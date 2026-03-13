# Kế hoạch thực thi: Quản lý khoản vay & Nợ quá hạn (Admin Web)

## 1. Tổng quan mô hình dữ liệu

### 1.1 Quan hệ dữ liệu (đúng)
```
1 Sản phẩm vay (Loan Product)  →  1 Bucket (Delinquency Bucket)
1 Bucket                        →  Nhiều Range (Delinquency Range)
1 Sản phẩm vay                  →  Nhiều Khoản vay (Loan)
1 Khách hàng (Customer)          →  Nhiều Khoản vay
```

### 1.2 Trạng thái khoản vay trong Fineract
| Code | Mô tả |
|------|-------|
| `loanStatusType.pendingApproval` | Chờ phê duyệt |
| `loanStatusType.approved` | Đã phê duyệt (chờ giải ngân) |
| `loanStatusType.active` / `activeInGoodStanding` | Đang hoạt động |
| `loanStatusType.closed` | Đã đóng |
| `loanStatusType.withdrawnByClient` | KH rút lại |
| `loanStatusType.rejected` | Từ chối |
| `loanStatusType.writtenOff` | Xóa nợ |
| `loanStatusType.overpaid` | Trả dư |

### 1.3 Cấu trúc dữ liệu hiện tại

**MongoDB (LoanApplication):**
- `status`: pending | approved | rejected | disbursed | cancelled | closed
- `fineractLoanId`, `productId`, `userId`, `capital`, `periodMonth`
- `totalOverdue`, `delinquentDays`, `delinquencyClassification`
- `delinquencyRange`, `delinquencyTags`, `installmentLevelDelinquency`
- `repaymentSchedule`, `transactions`, `charges`
- `lastSyncedAt`, `clientDisplayName`

**API hiện có:**
- `GET /admin/loans/pending` – Chỉ khoản chờ duyệt
- `GET /admin/overdue-loans` – Chỉ khoản quá hạn (status=disbursed, totalOverdue>0)
- `GET /admin/customers/:id/detail` – Chi tiết KH + loans (lấy từ Fineract trực tiếp)
- `GET /admin/loans/:id/details` – Chi tiết 1 khoản vay
- `POST /admin/sync-disbursed-loans` – Sync khoản đã giải ngân vào Mongo

---

## 2. Vấn đề hiện tại

### 2.1 Phân tán, thiếu thống nhất
- **Phê duyệt khoản vay** (`/loan-approvals`): Chỉ khoản chờ duyệt
- **Khoản vay quá hạn** (`/overdue-loans`): Chỉ khoản quá hạn, data từ Mongo
- **Khách hàng** (`/customers/:id`): Loans lấy trực tiếp từ Fineract (không qua Mongo)

→ Không có trang **tổng hợp tất cả khoản vay** với đủ trạng thái.

### 2.2 Filter UI/UX kém
- OverdueLoansPage: Nhiều ô input rời rạc (nhóm, khoản từ–đến, ngày từ–đến), khó dùng
- CustomersPage: Bộ lọc nâng cao ẩn, nhiều tab, filter client-side phức tạp
- Không có filter theo sản phẩm, trạng thái Fineract, ngày giải ngân

### 2.3 Sync data không nhất quán
- Overdue: Chỉ sync khoản disbursed từ Fineract → Mongo
- Customer detail: Lấy loans trực tiếp từ Fineract (không dùng Mongo)
- Loan approvals: Lấy pending từ Fineract
→ Nguồn dữ liệu khác nhau, khó bảo đảm tính nhất quán.

---

## 3. Kế hoạch thực thi

### Phase 1: Backend – API quản lý khoản vay thống nhất

#### 1.1 API mới: `GET /admin/loans` (danh sách khoản vay)
**Query params:**
- `page`, `limit` – Phân trang
- `status` – Trạng thái: `all` | `pending` | `approved` | `disbursed` | `closed` | `overdue`
- `productId` – Lọc theo sản phẩm vay
- `classification` – Nhóm quá hạn (delinquency)
- `keyword` – Tìm theo tên KH, username, fineractLoanId
- `delinquentDaysMin`, `delinquentDaysMax` – Số ngày quá hạn
- `minOverdueAmount`, `maxOverdueAmount` – Khoản quá hạn (₫)
- `disbursementDateFrom`, `disbursementDateTo` – Ngày giải ngân

**Logic:**
- `status=overdue`: Mongo `status=disbursed`, `totalOverdue>0`
- Các status khác: Map Fineract status ↔ Mongo status
- Kết hợp Mongo + Fineract: Ưu tiên Mongo nếu có, fallback Fineract cho khoản chưa sync

#### 1.2 Cập nhật sync
- Mở rộng `syncDisbursedLoans` để sync **tất cả** khoản vay có trong Fineract (không chỉ disbursed)
- Hoặc tạo `syncAllLoansFromFineract` – sync theo status (pending, approved, active, closed)
- Đảm bảo `getCustomerDetail` dùng data đã sync khi có, tránh gọi Fineract trùng lặp

#### 1.3 API `GET /admin/loans/stats`
Trả về thống kê nhanh:
- Tổng khoản vay
- Theo trạng thái: pending, approved, disbursed, closed, overdue
- Theo nhóm quá hạn (nếu overdue)

---

### Phase 2: Frontend – Trang Quản lý khoản vay mới

#### 2.1 Tạo `LoansPage.tsx` – Trang chính
**Layout:**
- **Header**: Tiêu đề "Quản lý khoản vay"
- **Stats cards** (5–6 thẻ): Tổng | Chờ duyệt | Đã giải ngân | Quá hạn | Đã đóng
- **Tabs chính**: Tất cả | Chờ duyệt | Đang hoạt động | Quá hạn | Đã đóng
- **Bộ lọc nâng cao** (collapsible, thiết kế gọn):
  - Sản phẩm vay (Select)
  - Nhóm quá hạn (Select, từ delinquency-ranges)
  - Trạng thái (Select)
  - Số ngày quá hạn (Range: từ–đến)
  - Khoản quá hạn (Range: từ–đến ₫)
  - Ngày giải ngân (DateRangePicker)
  - Tìm kiếm (Input: tên KH, username, #loanId)
- **Bảng chính** (ProTable):
  - Cột: # | Khách hàng | Sản phẩm | Gốc | Trạng thái | Nhóm quá hạn | Tiền quá hạn | Ngày quá hạn | Ngày giải ngân | Thao tác
  - Sort, pagination server-side
  - Click row → mở Drawer chi tiết (tái sử dụng logic từ CustomerDetailPage)

#### 2.2 Tích hợp Nợ quá hạn
- Tab "Quá hạn" = filter `status=overdue`
- Cột "Nhóm quá hạn" hiển thị `delinquencyClassification` với Tag màu theo mức độ
- Filter "Nhóm quá hạn" dùng `getDelinquencyRanges()` – 5 nhóm mới
- Giữ nguyên nút "Làm mới thông tin" (sync) và "Đồng bộ" trong trang

#### 2.3 Drawer chi tiết khoản vay
- Tái sử dụng nội dung từ CustomerDetailPage (tabs: Tổng quan, Chi tiết, Giao dịch, Lịch trả nợ, Quá hạn & Rủi ro, Tài liệu)
- Nút "Xem khách hàng" → navigate `/customers/:userId`
- Nút "Đồng bộ" → sync loan rồi refresh

---

### Phase 3: Điều hướng & Menu

#### 3.1 Cập nhật menu
- **Gộp** "Phê duyệt khoản vay" và "Khoản vay quá hạn" → **"Quản lý khoản vay"** (`/loans`)
- Hoặc giữ 2 mục nhưng "Quản lý khoản vay" là trang chính, "Phê duyệt" và "Quá hạn" là tab con (deep link: `/loans?tab=pending`, `/loans?tab=overdue`)

#### 3.2 Redirect
- `/loan-approvals` → `/loans?tab=pending`
- `/overdue-loans` → `/loans?tab=overdue`

---

### Phase 4: Cải thiện UX Filter

#### 4.1 Thiết kế bộ lọc
- **Dạng form gọn** trong Card, 1–2 dòng
- Các filter quan trọng luôn hiển thị: Trạng thái, Sản phẩm, Nhóm quá hạn (khi tab Quá hạn)
- Filter ít dùng đưa vào "Thêm bộ lọc" (Popover/Dropdown)
- Nút "Áp dụng" và "Xóa bộ lọc" rõ ràng
- Lưu filter vào URL (query params) để share được

#### 4.2 Preset nhanh
- "Quá hạn nghiêm trọng" (Nhóm 4, 5)
- "Quá hạn > 30 ngày"
- "Chờ duyệt"

---

## 4. Thứ tự triển khai đề xuất

| # | Task | Ước lượng | Phụ thuộc |
|---|------|-----------|-----------|
| 1 | Backend: `GET /admin/loans` với filter đầy đủ | 1–2 ngày | - |
| 2 | Backend: `GET /admin/loans/stats` | 0.5 ngày | - |
| 3 | Backend: Mở rộng sync (nếu cần) | 0.5 ngày | 1 |
| 4 | Frontend: Tạo `LoansPage.tsx` cơ bản + bảng | 1 ngày | 1, 2 |
| 5 | Frontend: Tích hợp bộ lọc (form gọn, URL params) | 1 ngày | 4 |
| 6 | Frontend: Drawer chi tiết (tái sử dụng từ CustomerDetail) | 0.5 ngày | 4 |
| 7 | Frontend: Stats cards, tabs | 0.5 ngày | 4 |
| 8 | Frontend: Cập nhật menu, redirect | 0.5 ngày | 6 |
| 9 | Testing & chỉnh sửa UX | 1 ngày | 8 |

**Tổng ước lượng: 6–7 ngày**

---

## 5. Chi tiết kỹ thuật

### 5.1 Admin API – `getLoans(filters)`
```typescript
// admin.controller.ts
@Get('loans')
async getLoans(
  @Query('page') page = 1,
  @Query('limit') limit = 20,
  @Query('status') status?: 'all'|'pending'|'approved'|'disbursed'|'closed'|'overdue',
  @Query('productId') productId?: number,
  @Query('classification') classification?: string,
  @Query('keyword') keyword?: string,
  @Query('delinquentDaysMin') delinquentDaysMin?: number,
  @Query('delinquentDaysMax') delinquentDaysMax?: number,
  @Query('minOverdueAmount') minOverdueAmount?: number,
  @Query('maxOverdueAmount') maxOverdueAmount?: number,
  @Query('disbursementDateFrom') disbursementDateFrom?: string,
  @Query('disbursementDateTo') disbursementDateTo?: string,
) { ... }
```

### 5.2 adminApi (admin_web)
```typescript
getLoans: (params: LoansFilterParams) => api.get('/api/admin/loans', { params })
getLoansStats: () => api.get('/api/admin/loans/stats')
```

### 5.3 LoansPage – Cấu trúc component
```
LoansPage
├── StatsCards (Row of Cards)
├── FilterCard (collapsible Form)
├── ProTable (columns, request=fetchLoans)
└── LoanDetailDrawer (reuse từ CustomerDetailPage)
```

---

## 6. Lưu ý

1. **Nguồn dữ liệu**: Ưu tiên Mongo cho khoản đã sync; Fineract cho pending/approved nếu chưa có trong Mongo.
2. **Performance**: Index Mongo: `status`, `totalOverdue`, `delinquencyClassification`, `productId`, `disbursementDate`, `userId`.
3. **Delinquency ranges**: Dùng API `getDelinquencyRanges` (đã có) – 5 nhóm mới.
4. **RBAC**: Áp dụng `CheckPolicies` cho `LoanApplication` read/update như hiện tại.
