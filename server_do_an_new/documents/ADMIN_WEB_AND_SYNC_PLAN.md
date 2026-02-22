# Kế hoạch: Web quản trị + Đồng bộ sản phẩm vay với Fineract

## 1. Cách client_new lấy danh sách sản phẩm vay (Gói vay ưu đãi)

### 1.1 Luồng tổng quan

```
App (LoanScreen) → loanService.getLoanProducts() → GET /api/loan/products (JWT)
       → server_do_an_new LoanController → LoanService → FineractLoanService
       → Fineract BE 8080 GET /loanproducts
```

### 1.2 Chi tiết phía client (client_new)

| Thành phần | File | Mô tả |
|------------|------|--------|
| **API call** | `src/features/loan/services/loan.service.ts` | `getLoanProducts()` gọi `GET /api/loan/products` qua `api.client` (đã gắn baseURL + JWT). |
| **Response type** | Cùng file | `LoanProductsResponse`: `data.products: LoanProduct[]`, `data.count`. |
| **LoanProduct** | Cùng file | `id`, `name`, `shortName`, `interestRatePerPeriod`, `interestType: { id, code, value }`, `minPrincipal`, `maxPrincipal`, `minNumberOfRepayments`, `maxNumberOfRepayments`. |
| **Màn hình** | `src/features/loan/screens/LoanScreen.tsx` | `useEffect` gọi `fetchProducts()` → `loanService.getLoanProducts()`, hiển thị tiêu đề "Gói vay ưu đãi", FlatList mỗi item: tên, mã (shortName), lãi suất %/tháng, kiểu lãi (interestType.value). |

### 1.3 Chi tiết phía server (server_do_an_new)

| Thành phần | File | Mô tả |
|------------|------|--------|
| **Route** | `src/modules/loan/loan.controller.ts` | `GET /loan/products` (bảo vệ bởi `JwtAuthGuard`), trả về `{ statusCode, message, data: { products, count } }`. |
| **Business logic** | `src/modules/loan/loan.service.ts` | Gọi `fineractLoanService.getLoanProducts()`, **lọc** chỉ giữ sản phẩm có `shortName` bắt đầu `'P'` hoặc `name` chứa `'P2P'`. |
| **Fineract proxy** | `src/modules/fineract/services/fineract-loan.service.ts` | `getLoanProducts()`: `GET /loanproducts` tới Fineract, trả về `pageItems` hoặc `data` (mảng). Fineract trả về đúng cấu trúc có `id`, `name`, `shortName`, `interestRatePerPeriod`, `interestType: { id, code, value }` nên server trả thẳng (sau khi lọc) cho client. |

### 1.4 Tóm tắt dữ liệu hiển thị trên app

- **Tên gói**: `item.name` (vd: "Vay học phí", "Vay mua điện thoại").
- **Mã**: `item.shortName` (vd: "PVHP", "PMDT").
- **Lãi suất**: `item.interestRatePerPeriod` (%/tháng).
- **Kiểu lãi**: `item.interestType.value` (vd: "Declining Balance").

---

## 2. Kiến trúc: Web quản trị ↔ server_do_an_new ↔ Fineract BE 8080

```
┌─────────────────────┐     REST (JWT/Admin)      ┌──────────────────────────┐     HTTP (Basic/OAuth)     ┌──────────────────┐
│  Web quản trị       │ ◄──────────────────────► │  server_do_an_new        │ ◄────────────────────────► │  Fineract BE     │
│  (Admin Web)        │   /api/admin/...          │  (NestJS)                │   /loanproducts, ...       │  (port 8080)     │
└─────────────────────┘                          └──────────────────────────┘                          └──────────────────┘
         │                                                    │
         │                                                    │ Đồng bộ / so sánh
         │                                                    ▼
         │                                          ┌──────────────────────┐
         └─────────────────────────────────────────►│  App (client_new)    │
              Thông báo / cấu hình                   │  GET /api/loan/products
              (sync status, document types)         │  + sync/health nếu cần
                                                   └──────────────────────┘
```

- **Admin web**: chỉ gọi API của `server_do_an_new` (không gọi trực tiếp Fineract).
- **server_do_an_new**: là nơi duy nhất gọi Fineract (8080); đồng thời lưu cấu hình “document types theo từng khoản vay” và trạng thái đồng bộ.
- **App**: khi mở (hoặc vào màn vay), gọi `GET /api/loan/products`; có thể gọi thêm endpoint sync/status để biết có lệch với Fineract hay không và hiển thị thông báo.

---

## 3. Kế hoạch Web quản trị: Định nghĩa loại tài liệu cho từng gói vay

### 3.1 Mục tiêu

- Admin định nghĩa **các loại tài liệu (document types)** bắt buộc/tùy chọn cho **từng sản phẩm vay** (loan product).
- Cấu hình lưu ở **server_do_an_new** (DB riêng hoặc MongoDB hiện có), **không** bắt buộc Fineract có sẵn API document-theo-product; nếu sau này Fineract có (vd entity-datatable/document theo entity), server có thể map thêm.
- App khi nộp hồ sơ vay có thể lấy danh sách document types theo product từ server để hiển thị form upload đúng loại tài liệu.

### 3.2 Dữ liệu cần quản lý (Admin)

| Entity | Mô tả |
|--------|--------|
| **Loan product (tham chiếu)** | Danh sách sản phẩm vay lấy từ Fineract (read-only trên admin: id, name, shortName). Admin chọn product để gắn document types. |
| **Document type** | Tên loại tài liệu (vd: "CMND/CCCD", "Hộ khẩu", "Giấy xác nhận học phí"), bắt buộc hay không, thứ tự hiển thị. |
| **Loan product – document type** | Quan hệ N-N: một gói vay có nhiều loại tài liệu; một loại tài liệu có thể dùng cho nhiều gói vay. |

### 3.3 API đề xuất (server_do_an_new)

- **Admin auth**: dùng JWT với role `admin` (hoặc guard riêng cho `/api/admin`).
- **Loan products (đọc từ Fineract)**  
  - `GET /api/admin/loan-products`  
  - Trả về danh sách sản phẩm vay (giống hoặc mở rộng từ `GET /loan/products`) để admin chọn.
- **Document types (CRUD)**  
  - `GET /api/admin/document-types`  
  - `POST /api/admin/document-types` (name, required, sortOrder)  
  - `PUT /api/admin/document-types/:id`  
  - `DELETE /api/admin/document-types/:id`
- **Gắn document type với loan product**  
  - `GET /api/admin/loan-products/:fineractProductId/document-types`  
  - `PUT /api/admin/loan-products/:fineractProductId/document-types` (body: `{ documentTypeIds: number[] }` hoặc danh sách object với required/sortOrder).
- **Cho app (user)**  
  - `GET /api/loan/products/:productId/document-types` (hoặc nhúng vào `GET /api/loan/products` mở rộng) để app hiển thị form tải tài liệu theo gói vay.

### 3.4 Cơ sở dữ liệu (server_do_an_new)

- **DocumentType**: id, name, required (boolean), sortOrder, createdAt, updatedAt.
- **LoanProductDocumentType** (quan hệ): fineractProductId (number), documentTypeId (ref), required (override?), sortOrder.  
  Hoặc đơn giản: bảng DocumentType có field `loanProductIds: number[]` (Fineract product id) nếu mỗi document type chỉ cần gắn với một số product.

Chọn một trong hai hướng:

- **Option A**: Bảng riêng `LoanProductDocumentType` (productId, documentTypeId, required, sortOrder) → linh hoạt, dễ mở rộng.
- **Option B**: DocumentType có `loanProductIds: number[]` → đơn giản, ít bảng.

### 3.5 Giao diện Admin (Web) đề xuất

1. **Đăng nhập** (admin).
2. **Trang “Sản phẩm vay”**: danh sách loan products (sync từ Fineract), có nút “Cấu hình tài liệu” cho từng dòng.
3. **Trang “Loại tài liệu”**: CRUD loại tài liệu (tên, bắt buộc, thứ tự).
4. **Trang “Cấu hình tài liệu theo gói vay”**: chọn product → chọn/ bỏ chọn các document types, đánh dấu bắt buộc, sắp xếp thứ tự.

Công nghệ web: tùy dự án (React/Vue/Next…), chỉ cần gọi REST API của server_do_an_new.

---

## 4. Đồng bộ khi vào app và thông báo cho Admin

### 4.1 Mục tiêu

- Mỗi khi user **vào app** (hoặc vào màn “Vay vốn”): thực hiện **sync/so sánh** danh sách sản phẩm vay với Fineract.
- Nếu có **thay đổi** (sản phẩm bị xóa hoặc sửa trên Fineract so với lần trước): **thông báo** để admin điều chỉnh (cấu hình document types, hoặc xử lý trên Fineract cho phù hợp).

### 4.2 Cách triển khai đề xuất

#### Bước 1: Lưu “snapshot” sản phẩm vay (server_do_an_new)

- Bảng (hoặc collection) **LoanProductSnapshot**: lưu lần cuối sync danh sách product từ Fineract (vd: productId, name, shortName, interestRatePerPeriod, updatedAt).
- Hoặc đơn giản: lưu **hash/json** của danh sách product + thời điểm sync.

#### Bước 2: Endpoint sync khi app gọi

- **Cách A – Sync ngầm khi lấy danh sách**  
  - Khi app gọi `GET /api/loan/products`, server (sau khi lấy từ Fineract) so sánh với snapshot:
    - Nếu giống → trả về bình thường.
    - Nếu khác (thêm/xóa/sửa product) → cập nhật snapshot, ghi log “sync drift” và đánh dấu “có thay đổi so với lần trước” (flag hoặc bảng SyncDriftLog).
- **Cách B – Endpoint riêng**  
  - App gọi `GET /api/loan/products` như hiện tại.  
  - Thêm `GET /api/loan/products/sync-status` (hoặc `POST /api/loan/products/sync`) để server so sánh Fineract vs snapshot và trả về: `{ inSync: boolean, added: [], removed: [], modified: [] }`.  
  - App chỉ cần gọi khi vào màn “Vay vốn”; nếu `inSync === false` có thể hiển thị banner “Danh sách gói vay đã được cập nhật” hoặc không chặn, tùy product.

#### Bước 3: Thông báo cho Admin

- **Trong DB**: bảng **SyncDriftLog** (hoặc tương đương) lưu mỗi lần phát hiện lệch: thời điểm, diff (added/removed/modified product ids hoặc chi tiết).
- **Admin web**:  
  - Trang “Đồng bộ / Cảnh báo”: danh sách các lần drift gần nhất; admin xem và thao tác (vd: cập nhật cấu hình document types cho product mới, ẩn/xóa cấu hình product đã xóa trên Fineract).  
  - Có thể gửi email/notification (optional) khi có drift.

### 4.3 Luồng tổng hợp

1. User mở app → vào màn Vay vốn → gọi `GET /api/loan/products` (và tuỳ chọn `GET .../sync-status`).
2. Server lấy danh sách từ Fineract, so sánh với snapshot:
   - Cập nhật snapshot nếu có thay đổi.
   - Ghi log drift nếu có (added/removed/modified).
3. App hiển thị danh sách sản phẩm (có thể thêm banner “Đã cập nhật” nếu vừa sync có thay đổi).
4. Admin vào web quản trị → mục “Đồng bộ” hoặc “Cảnh báo” → thấy các thay đổi so với Fineract → điều chỉnh cấu hình (document types, v.v.) cho phù hợp.

---

## 5. Thứ tự triển khai đề xuất

1. **Phase 1 – Nền tảng**
   - Thiết kế DB cho DocumentType + quan hệ với loan product (Fineract productId).
   - API admin: CRUD document types, gắn document types với loan product.
   - API cho app: lấy document types theo product (khi cần cho form hồ sơ vay).

2. **Phase 2 – Admin Web**
   - Đăng nhập admin.
   - Trang quản lý loại tài liệu.
   - Trang quản lý sản phẩm vay (đọc từ API) + cấu hình tài liệu theo từng gói vay.

3. **Phase 3 – Đồng bộ và cảnh báo**
   - Snapshot + so sánh khi lấy danh sách từ Fineract (hoặc endpoint sync-status).
   - Bảng/log drift; API admin xem danh sách drift.
   - Trang admin “Đồng bộ / Cảnh báo” và (tuỳ chọn) thông báo email.

4. **Phase 4 – App**
   - (Đã có: lấy danh sách sản phẩm vay.)
   - Gọi API lấy document types theo product khi user chọn gói vay và vào bước nộp tài liệu; hiển thị form upload đúng loại tài liệu.

---

## 6. Triển khai đã làm (server_do_an_new)

- **Admin API** (yêu cầu JWT + role `admin` trong token Keycloak):
  - `GET /admin/loan-products` – danh sách sản phẩm vay từ Fineract
  - `GET/POST/PUT/DELETE /admin/document-types` – CRUD loại tài liệu
  - `GET/PUT /admin/loan-products/:fineractProductId/document-types` – cấu hình tài liệu theo sản phẩm
  - `GET /admin/sync-drift` – lịch sử đồng bộ / cảnh báo
  - `POST /admin/sync-compare` – chạy so sánh và ghi log
- **App API** (JWT user):
  - `GET /loan/products` – như cũ; mỗi lần gọi sẽ đồng bộ snapshot và ghi log drift
  - `GET /loan/products/:productId/document-types` – danh sách loại tài liệu cần nộp theo sản phẩm
- **Cấu hình**: Trong Keycloak cần có role `admin` và gán cho user quản trị. Token sau đăng nhập phải có `realm_access.roles` chứa `admin`.

### Admin Web (admin_web)

- **Công nghệ**: Vite + React 18 + TypeScript + React Router + Axios.
- **Chạy**: `cd admin_web && npm install && npm run dev` (mặc định http://localhost:5174).
- **Biến môi trường**: `VITE_API_URL` (mặc định http://localhost:3001).
- **Chức năng**:
  - Đăng nhập (username/password) – chỉ cho phép user có role `admin`.
  - **Loại tài liệu**: CRUD (thêm, sửa, xóa, xem danh sách).
  - **Sản phẩm vay**: Danh sách từ Fineract, nút "Cấu hình tài liệu" mở modal chọn loại tài liệu (và bắt buộc) cho từng gói vay, lưu qua PUT `/admin/loan-products/:id/document-types`.
  - **Đồng bộ / Cảnh báo**: Xem lịch sử sync drift (thêm/xóa/sửa sản phẩm), nút "Chạy so sánh ngay" gọi POST `/admin/sync-compare`.

## 7. Tài liệu tham khảo trong codebase

- Client: `client_new/src/features/loan/services/loan.service.ts`, `client_new/src/features/loan/screens/LoanScreen.tsx`
- Server: `server_do_an_new/src/modules/loan/loan.controller.ts`, `loan.service.ts`, `server_do_an_new/src/modules/fineract/services/fineract-loan.service.ts`
- Fineract API (tham khảo): Loan Product – `GET/POST /loanproducts`, `GET /loanproducts/{productId}`. Document/entity có thể mở rộng qua Entity-Datatable Checks / Data Tables (Fineract) nếu cần sau này.
