export const FINERACT_AXIOS_CLIENT = 'FINERACT_AXIOS_CLIENT';

/**
 * Charge ID "Phí phạt tất toán sớm" trong Fineract
 * chargeTimeType=2 (Specified Due Date), penalty=true, chargeCalculationType=% Amount
 * KHÔNG gắn sẵn vào loan product — add thủ công khi borrower prepay
 * Tỷ lệ phạt được lấy ĐỘNG từ Fineract (GET /charges/{id}) — không hardcode
 */
export const PREPAYMENT_PENALTY_CHARGE_ID = 14;
