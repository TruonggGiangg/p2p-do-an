/**
 * OTP Action Types
 * Enum định nghĩa các loại giao dịch cần xác thực Smart OTP
 */
export enum OtpActionType {
  LOAN_CREATE = 'LOAN_CREATE', // Tạo khoản vay
  INVESTMENT = 'INVESTMENT', // Đầu tư
  TRANSFER = 'TRANSFER', // Chuyển tiền
  WITHDRAWAL = 'WITHDRAWAL', // Rút tiền
  DEVICE_REGISTER = 'DEVICE_REGISTER', // Đăng ký device mới
  PASSWORD_CHANGE = 'PASSWORD_CHANGE', // Đổi mật khẩu
  PROFILE_UPDATE = 'PROFILE_UPDATE', // Cập nhật thông tin nhạy cảm
  REPAYMENT = 'REPAYMENT', // Trả nợ một phần
  PREPAY = 'PREPAY', // Tất toán sớm
  OTHER = 'OTHER', // Khác
}
