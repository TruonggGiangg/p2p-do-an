# Đặc tả Use Case – Tạo khoản vay (dạng bảng)

**Phiên bản:** 1.0  
**Ngày:** 26/02/2025

---

## 1. Thông tin Use Case

| Mục | Mô tả |
|-----|--------|
| **Tên use case** | Tạo khoản vay |
| **Actor chính** | Người vay (Borrower) |
| **Actor phụ** | Hệ thống Fineract (Core Banking), Smart OTP (xác thực), Admin (nhận đơn để duyệt/giải ngân) |
| **Mô tả sơ lược** | Cho phép người vay chọn sản phẩm vay, nhập số tiền và kỳ hạn, xem trước lịch trả nợ và phí, chọn ví nhận giải ngân, tải tài liệu đính kèm, xác thực OTP và gửi đơn. Hệ thống tạo hồ sơ trên MongoDB và đồng bộ sang Fineract với trạng thái "chờ duyệt". |
| **Pre-condition (Tiền điều kiện)** | • Người vay đã đăng nhập<br>• Người vay đã liên kết ví điện tử (có fineractClientId)<br>• Người vay đã đăng ký Smart OTP trong Profile (bắt buộc khi tạo khoản vay)<br>• Sản phẩm vay đã được cấu hình trên Fineract và hiển thị trên app |
| **Post-condition (Hậu điều kiện)** | • Đơn vay được tạo với trạng thái "pending" (chờ duyệt)<br>• Bản ghi LoanApplication được lưu trên MongoDB<br>• Khoản vay được tạo trên Fineract (submitted and pending approval)<br>• Lịch trả nợ dự kiến (schedulePreview) được lưu kèm đơn<br>• (Tùy chọn) Tài liệu đính kèm được upload lên Fineract sau khi có loanId |

---

## 2. Basic Flow (Luồng chính)

| Bước | Actor | System |
|------|--------|--------|
| 1 | Người vay truy cập màn hình "Tạo khoản vay" (LoanCreate) | |
| 2 | | Hệ thống hiển thị form nhập: số tiền, kỳ hạn, mục đích vay, ngày giải ngân; danh sách sản phẩm vay (nếu có nhiều) và cấu hình sản phẩm (lãi suất, loại lãi, bội số làm tròn) |
| 3 | Người vay chọn sản phẩm vay (nếu có), nhập số tiền, kỳ hạn, mục đích vay, ngày giải ngân | |
| 4 | | Hệ thống kiểm tra ràng buộc (số tiền ≥ 100.000, kỳ hạn trong khoảng cho phép của sản phẩm, ngày giải ngân không quá khứ và không quá 30 ngày) |
| 5 | Người vay nhấn "Tiếp tục" / "Xem lịch trả" | |
| 6 | | Hệ thống gọi API rate-preview, tính lịch trả nợ dự kiến (lãi phẳng hoặc dư nợ giảm dần) và hiển thị màn hình xác nhận (LoanConfirm) với schedulePreview, monthlyPay, entirelyPay, tổng lãi và danh sách phí (charges) |
| 7 | Người vay xem lịch trả và phí, chọn ví nhận giải ngân từ danh sách ví của mình | |
| 8 | | Hệ thống hiển thị danh sách loại tài liệu cần nộp theo sản phẩm (document-types); người vay có thể tải tài liệu (bắt buộc nếu required) |
| 9 | Người vay đính kèm tài liệu (nếu yêu cầu) và nhấn "Gửi đơn" | |
| 10 | | Hệ thống hiển thị hộp thoại xác thực Smart OTP |
| 11 | Người vay nhập mã OTP và xác thực | |
| 12 | | Hệ thống kiểm tra Smart OTP (consume session, action LOAN_CREATE); nếu hợp lệ tiếp tục |
| 13 | | Hệ thống kiểm tra ví thuộc user, user có fineractClientId, kỳ hạn trong [min, max] của sản phẩm |
| 14 | | Hệ thống tạo bản ghi LoanApplication trên MongoDB (status = "pending") với schedulePreview, monthlyPay, entirelyPay |
| 15 | | Hệ thống gọi Fineract API tạo khoản vay (create loan application); cập nhật fineractLoanId vào MongoDB |
| 16 | | Hệ thống hiển thị "Đơn vay đã tạo thành công" với mã đơn và trạng thái chờ duyệt |
| 17 | Kết thúc use case | |

---

## 3. Alternate Flows (Luồng thay thế)

| Mã | Mô tả | Actor | System |
|----|--------|--------|--------|
| **9a** | **Tải tài liệu sau khi đơn đã tạo** | | |
| 9a.1 | Người vay gửi đơn trước với danh sách tài liệu trống (nếu sản phẩm cho phép) hoặc chỉ metadata (documentTypeId, name) | Người vay nhấn "Gửi đơn" | |
| 9a.2 | | Hệ thống tạo đơn thành công (bước 14–16) | |
| 9a.3 | Người vay vào chi tiết đơn vay, chọn "Tải tài liệu" | | |
| 9a.4 | | Hệ thống hiển thị form upload theo từng documentTypeId | |
| 9a.5 | Người vay chọn file và gửi | | |
| 9a.6 | | Hệ thống gọi POST /api/loan/:id/documents, upload lên Fineract và cập nhật metadata vào MongoDB | |
| 9a.7 | Quay lại bước 16 (thông báo thành công hoặc màn hình chi tiết đơn) | | |
| **12a** | **Người vay chưa đăng ký Smart OTP** | | |
| 12a.1 | | Hệ thống kiểm tra danh sách thiết bị Smart OTP của user; nếu rỗng → báo lỗi | |
| 12a.2 | | Hệ thống hiển thị "Bạn cần đăng ký Smart OTP trong Profile trước khi tạo khoản vay." | |
| 12a.3 | Kết thúc use case | | |
| **12b** | **Người vay không gửi OTP hoặc OTP hết hạn/đã dùng** | | |
| 12b.1 | | Hệ thống kiểm tra otpSessionId và consume session; nếu thiếu hoặc không hợp lệ → báo lỗi | |
| 12b.2 | | Hệ thống hiển thị "Vui lòng xác thực OTP để tạo khoản vay." hoặc message từ Smart OTP | |
| 12b.3 | Quay lại bước 10 (hiển thị lại hộp thoại OTP) | | |

---

## 4. Exception Flows (Luồng ngoại lệ)

| Mã | Mô tả | Actor | System |
|----|--------|--------|--------|
| **13a** | **Ví không thuộc user** | | |
| 13a.1 | | Hệ thống gọi ensureWalletBelongsToUser(disbursementWalletId, userId); nếu không thuộc → lỗi | |
| 13a.2 | | Hệ thống trả về 400 "Ví không hợp lệ" | |
| 13a.3 | Kết thúc use case | | |
| **13b** | **User chưa liên kết ví điện tử (không có fineractClientId)** | | |
| 13b.1 | | Hệ thống kiểm tra user.fineractClientId; nếu null → lỗi | |
| 13b.2 | | Hệ thống hiển thị "Bạn cần liên kết ví điện tử trước khi tạo khoản vay" | |
| 13b.3 | Kết thúc use case | | |
| **13c** | **Kỳ hạn ngoài khoảng cho phép của sản phẩm** | | |
| 13c.1 | | Hệ thống so sánh periodMonth với minNumberOfRepayments, maxNumberOfRepayments của sản phẩm; nếu ngoài khoảng → lỗi | |
| 13c.2 | | Hệ thống hiển thị "Kỳ hạn phải từ X đến Y tháng (sản phẩm: …)" | |
| 13c.3 | Quay lại bước 3 (người vay chỉnh lại kỳ hạn) | | |
| **15a** | **Fineract tạo khoản vay thất bại** | | |
| 15a.1 | | Fineract API trả lỗi (client invalid, product config, …) | |
| 15a.2 | | Hệ thống trả về 400 với message từ Fineract; bản ghi MongoDB đã tạo vẫn giữ (có thể để admin xử lý hoặc rollback tùy chính sách) | |
| 15a.3 | Kết thúc use case | | |
| **4a** | **Ngày giải ngân không hợp lệ** | | |
| 4a.1 | | Hệ thống kiểm tra disbursementDate: không quá khứ, không quá 30 ngày từ hôm nay | |
| 4a.2 | | Hệ thống hiển thị "Ngày giải ngân không thể là quá khứ" hoặc "Ngày giải ngân không thể quá 30 ngày kể từ hôm nay" | |
| 4a.3 | Quay lại bước 3 | | |

---

## 5. Bảng tóm tắt tham chiếu

| Mục | Mô tả |
|-----|--------|
| **Màn hình liên quan** | LoanCreateScreen (nhập thông tin, gọi rate-preview), LoanConfirmScreen (xác nhận, ví, tài liệu, OTP, gửi đơn) |
| **API liên quan** | GET products, GET products/:productId/config, GET products/:productId/document-types, GET products/:productId/charges; POST rate-preview; POST apply; POST :id/documents (alternate) |
| **Schema chính** | LoanApplication (MongoDB): userId, productId, capital, periodMonth, disbursementWalletId, status, schedulePreview, fineractLoanId, documents |
| **Tài liệu đầy đủ** | TAO_KHOAN_VAY_MO_TA_VA_DAC_TA.md, BANG_DAC_TA_CHI_TIET_TAO_KHOAN_VAY.md |
