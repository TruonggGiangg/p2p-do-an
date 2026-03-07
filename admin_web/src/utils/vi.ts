/**
 * Việt hóa - bản dịch tiếng Việt cho sản phẩm vay và sản phẩm tiết kiệm
 */

/** Dịch giá trị từ Fineract (tiếng Anh) sang tiếng Việt */
export const VALUE_VI: Record<string, string> = {
  // Trạng thái
  active: 'Đang hoạt động',
  inactive: 'Không hoạt động',
  'LOANPRODUCT.ACTIVE': 'Đang hoạt động',
  'LOANPRODUCT.INACTIVE': 'Không hoạt động',
  'SAVINGSPRODUCT.ACTIVE': 'Đang hoạt động',
  'SAVINGSPRODUCT.INACTIVE': 'Không hoạt động',

  // Loại lãi suất
  flat: 'Lãi phẳng',
  'Flat': 'Lãi phẳng',
  'Declining Balance': 'Dư nợ giảm dần',
  'declining balance': 'Dư nợ giảm dần',

  // Chu kỳ / Tần suất (dùng lowercase để match)
  months: 'Tháng',
  month: 'Tháng',
  years: 'Năm',
  year: 'Năm',
  days: 'Ngày',
  day: 'Ngày',
  weeks: 'Tuần',
  week: 'Tuần',

  // Hình thức trả nợ / Amortization
  'Equal principal payments': 'Trả gốc đều',
  'Equal installments': 'Trả đều kỳ',
  'Progressive': 'Tiến triển',

  // Chiến lược xử lý
  'Mifos Standard': 'Chuẩn Mifos',
  'Heavensfamily': 'Heavensfamily',
  'Creocore': 'Creocore',
  'India': 'Ấn Độ',

  // Ngày trong tháng/năm
  'Actual': 'Thực tế',
  '30': '30 ngày',
  '360': '360 ngày',
  '365': '365 ngày',

  // Kế hoạch lịch
  'Horizontal': 'Ngang',
  'Vertical': 'Dọc',

  // N/A
  'N/A': 'Không có',
  'NONE': 'Không',

  // Interest calculation
  'Same as repayment period': 'Giống chu kỳ trả nợ',
  'Daily': 'Hàng ngày',
  'Monthly': 'Hàng tháng',
  'Quarterly': 'Hàng quý',
  'Annually': 'Hàng năm',

  // Delinquency
  'Nhóm 1 (1-30 days)': 'Nhóm 1 (1-30 ngày)',
  'Nhóm 2 (31-60 days)': 'Nhóm 2 (31-60 ngày)',
  'Nhóm 3 (61-90 days)': 'Nhóm 3 (61-90 ngày)',
  'Nhóm quá hạn (>90 ngày)': 'Nhóm quá hạn (>90 ngày)',
  'Chính sách quản lý quá hạn P2P': 'Chính sách quản lý quá hạn P2P',
};

/** Dịch giá trị - kiểm tra không phân biệt hoa thường */
export function translateValue(val: any): string {
  if (val == null || val === '') return '-';
  if (typeof val === 'boolean') return val ? 'Có' : 'Không';
  if (typeof val === 'number') return val.toLocaleString('vi-VN');
  if (typeof val === 'object') return JSON.stringify(val);
  const s = String(val).trim();
  return VALUE_VI[s] ?? VALUE_VI[s.toLowerCase()] ?? s;
}
