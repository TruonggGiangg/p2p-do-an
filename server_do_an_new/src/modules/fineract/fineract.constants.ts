export const FINERACT_AXIOS_CLIENT = 'FINERACT_AXIOS_CLIENT';

/**
 * Charge ID "Phí phạt tất toán sớm" trong Fineract
 * chargeTimeType=2 (Specified Due Date), penalty=true, chargeCalculationType=% Amount
 * KHÔNG gắn sẵn vào loan product — add thủ công khi borrower prepay
 * Tỷ lệ phạt được lấy ĐỘNG từ Fineract (GET /charges/{id}) — không hardcode
 */
export const PREPAYMENT_PENALTY_CHARGE_ID = 14;

/**
 * Charge ID "Phí phạt trễ hạn" trong Fineract
 * chargeTimeType=9 (Overdue Installment), penalty=true
 * Batch Job hàng đêm sẽ apply charge này khi policy có apply_penalty=true
 * Tỷ lệ phạt lấy ĐỘNG từ Fineract (GET /charges/{id})
 * Nếu charge chưa tồn tại → tạo charge mới trên Fineract Admin
 */
export const OVERDUE_PENALTY_CHARGE_ID = 15;

/**
 * Mức phạt mặc định (%/năm trên số tiền quá hạn) khi không lấy được charge từ Fineract.
 * Theo quy định NHNN, lãi suất phạt quá hạn tối đa = 150% lãi suất trong hạn.
 * Ví dụ: lãi suất 18%/năm → phạt tối đa 27%/năm → ~0.074%/ngày.
 * Giá trị DEFAULT_OVERDUE_PENALTY_RATE_PER_DAY = 0.05% / ngày (bảo thủ).
 */
export const DEFAULT_OVERDUE_PENALTY_RATE_PER_DAY = 0.05;
