/**
 * Template hợp đồng vay tiêu dùng P2P
 * Dựa theo mẫu hợp đồng vay tiêu dùng Việt Nam
 * Xuất HTML → dùng với pdf renderer
 */

import { LoanContract, RepaymentScheduleItem, FeeStructureItem, BorrowerInfo } from '../schemas/loan-contract.schema';

/** Format số tiền VND */
function formatMoney(amount: number): string {
  return Math.round(amount).toLocaleString('vi-VN');
}

/** Format ngày dd/MM/yyyy */
function formatDate(dateStr?: string | Date): string {
  if (!dateStr) return '___/___/______';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '___/___/______';
  return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

/** Chuyển số thành chữ tiếng Việt (đơn giản) */
function numberToVietnameseWords(num: number): string {
  if (num === 0) return 'không đồng';
  const units = ['', 'một', 'hai', 'ba', 'bốn', 'năm', 'sáu', 'bảy', 'tám', 'chín'];
  const groups = ['', 'nghìn', 'triệu', 'tỷ'];

  const rounded = Math.round(num);
  if (rounded >= 1e9) {
    const ty = Math.floor(rounded / 1e9);
    const remain = rounded % 1e9;
    const tyStr = numberToVietnameseWords(ty) + ' tỷ';
    return remain > 0 ? tyStr + ' ' + numberToVietnameseWords(remain) : tyStr;
  }

  const str = rounded.toString();
  const chunks: number[] = [];
  let i = str.length;
  while (i > 0) {
    const start = Math.max(0, i - 3);
    chunks.unshift(parseInt(str.slice(start, i)));
    i = start;
  }

  const parts: string[] = [];
  for (let idx = 0; idx < chunks.length; idx++) {
    const chunk = chunks[idx];
    const groupIdx = chunks.length - 1 - idx;
    if (chunk === 0) continue;

    const h = Math.floor(chunk / 100);
    const t = Math.floor((chunk % 100) / 10);
    const u = chunk % 10;

    let s = '';
    if (h > 0) s += units[h] + ' trăm';
    if (t === 0 && u > 0 && h > 0) s += ' lẻ';
    if (t === 1) s += ' mười';
    if (t > 1) s += ' ' + units[t] + ' mươi';
    if (u > 0) {
      if (t >= 2 && u === 1) s += ' mốt';
      else if (t >= 1 && u === 5) s += ' lăm';
      else s += ' ' + units[u];
    }

    parts.push(s.trim() + (groups[groupIdx] ? ' ' + groups[groupIdx] : ''));
  }

  return parts.join(' ').trim() + ' đồng';
}

/** Tạo rows cho bảng lịch trả nợ */
function generateScheduleRows(schedule: RepaymentScheduleItem[]): string {
  return schedule
    .map(
      item => `
    <tr>
      <td style="text-align:center">${item.period}</td>
      <td style="text-align:center">${formatDate(item.dueDate)}</td>
      <td style="text-align:right">${formatMoney(item.principal)}</td>
      <td style="text-align:right">${formatMoney(item.interest)}</td>
      <td style="text-align:right; font-weight:600">${formatMoney(item.total)}</td>
      <td style="text-align:right">${formatMoney(item.remainingAfter)}</td>
    </tr>
  `,
    )
    .join('');
}

/** Tạo phần phí */
function generateFeeSection(fees: FeeStructureItem[]): string {
  if (!fees || fees.length === 0) return '<p>Không có phí phát sinh.</p>';
  return `
    <table>
      <thead>
        <tr>
          <th>Loại phí</th>
          <th>Mức phí</th>
          <th>Thời điểm thu</th>
        </tr>
      </thead>
      <tbody>
        ${fees
          .map(
            f => `
          <tr>
            <td>${f.name}</td>
            <td>${f.type === 'percentage' ? `${f.percentage}% gốc vay (≈ ${formatMoney(f.amount)} đ)` : `${formatMoney(f.amount)} đ`}</td>
            <td>${f.chargeTime === 'disbursement' ? 'Khi giải ngân' : f.chargeTime}</td>
          </tr>
        `,
          )
          .join('')}
      </tbody>
    </table>
  `;
}

export interface ContractTemplateData {
  contract: LoanContract;
  companyName?: string;
  companyAddress?: string;
  companyPhone?: string;
}

/**
 * Sinh HTML hợp đồng vay tiêu dùng
 * Có thể render sang PDF bằng puppeteer, wkhtmltopdf, hoặc gửi HTML trực tiếp cho client render
 */
export function generateLoanContractHTML(data: ContractTemplateData): string {
  const {
    contract,
    companyName = 'CÔNG TY CHO VAY NGANG HÀNG P2P',
    companyAddress = 'TP. Hồ Chí Minh, Việt Nam',
    companyPhone = '1900-xxxx',
  } = data;

  const b: BorrowerInfo = contract.borrowerInfo || ({} as BorrowerInfo);
  const now = new Date();

  return `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Hợp đồng vay tiêu dùng - ${contract.contractId}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Times New Roman', Times, serif;
      font-size: 13pt;
      line-height: 1.6;
      color: #1a1a1a;
      padding: 40px 60px;
      max-width: 800px;
      margin: 0 auto;
    }
    .header {
      text-align: center;
      margin-bottom: 30px;
      border-bottom: 2px solid #333;
      padding-bottom: 20px;
    }
    .header .company-name {
      font-size: 16pt;
      font-weight: bold;
      text-transform: uppercase;
      color: #1a5276;
      margin-bottom: 4px;
    }
    .header .company-info {
      font-size: 11pt;
      color: #555;
    }
    .contract-title {
      text-align: center;
      margin: 30px 0 10px;
    }
    .contract-title h1 {
      font-size: 20pt;
      font-weight: bold;
      text-transform: uppercase;
      color: #1a1a1a;
    }
    .contract-number {
      text-align: center;
      font-size: 12pt;
      color: #555;
      margin-bottom: 5px;
    }
    .contract-date {
      text-align: center;
      font-style: italic;
      font-size: 12pt;
      margin-bottom: 30px;
    }
    h2 {
      font-size: 14pt;
      font-weight: bold;
      margin: 24px 0 10px;
      color: #1a5276;
      text-transform: uppercase;
      border-bottom: 1px solid #ccc;
      padding-bottom: 4px;
    }
    h3 {
      font-size: 13pt;
      font-weight: bold;
      margin: 16px 0 8px;
    }
    p { margin: 6px 0; text-align: justify; }
    .indent { padding-left: 30px; }
    .info-table {
      width: 100%;
      border-collapse: collapse;
      margin: 10px 0;
    }
    .info-table td {
      padding: 5px 10px;
      vertical-align: top;
    }
    .info-table .label {
      width: 200px;
      font-weight: bold;
      color: #333;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 12px 0;
      font-size: 11pt;
    }
    table thead th {
      background-color: #1a5276;
      color: #fff;
      padding: 8px 6px;
      text-align: center;
      font-weight: bold;
    }
    table tbody td {
      border: 1px solid #ddd;
      padding: 6px;
    }
    table tbody tr:nth-child(even) {
      background-color: #f8f9fa;
    }
    .highlight {
      background-color: #fef9e7;
      border: 1px solid #f9e79f;
      border-radius: 4px;
      padding: 12px 16px;
      margin: 12px 0;
    }
    .highlight strong {
      color: #d4ac0d;
    }
    .article { margin: 10px 0; }
    .article-title { font-weight: bold; }
    .signature-section {
      display: flex;
      justify-content: space-between;
      margin-top: 60px;
      page-break-inside: avoid;
    }
    .signature-box {
      width: 45%;
      text-align: center;
    }
    .signature-box .title {
      font-weight: bold;
      font-size: 13pt;
      text-transform: uppercase;
      margin-bottom: 8px;
    }
    .signature-box .note {
      font-style: italic;
      font-size: 11pt;
      color: #666;
      margin-bottom: 80px;
    }
    .signature-box .name {
      font-weight: bold;
      font-size: 13pt;
    }
    .signature-placeholder {
      height: 100px;
      border: 1px dashed #ccc;
      border-radius: 8px;
      margin: 10px auto;
      width: 200px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #aaa;
      font-size: 11pt;
      font-style: italic;
    }
    .footer {
      margin-top: 40px;
      text-align: center;
      font-size: 10pt;
      color: #888;
      border-top: 1px solid #ddd;
      padding-top: 10px;
    }
    @media print {
      body { padding: 20px 40px; }
      .signature-section { page-break-inside: avoid; }
    }
  </style>
</head>
<body>

  <!-- ═══════ HEADER ═══════ -->
  <div class="header">
    <div class="company-name">${companyName}</div>
    <div class="company-info">${companyAddress} | ĐT: ${companyPhone}</div>
  </div>

  <!-- ═══════ TIÊU ĐỀ ═══════ -->
  <div class="contract-title">
    <h1>Hợp đồng vay tiêu dùng</h1>
  </div>
  <div class="contract-number">Số: <strong>${contract.contractId}</strong></div>
  <div class="contract-date">
    Ngày ${now.getDate()} tháng ${now.getMonth() + 1} năm ${now.getFullYear()}
  </div>

  <!-- ═══════ CĂN CỨ PHÁP LÝ ═══════ -->
  <h2>Căn cứ pháp lý</h2>
  <div class="indent">
    <p>- Căn cứ Bộ luật Dân sự số 91/2015/QH13 ngày 24/11/2015;</p>
    <p>- Căn cứ Luật các Tổ chức Tín dụng số 47/2010/QH12;</p>
    <p>- Căn cứ Nghị định 174/2016/NĐ-CP hướng dẫn Luật Kế toán;</p>
    <p>- Căn cứ vào năng lực và nhu cầu của hai bên.</p>
  </div>

  <!-- ═══════ THÔNG TIN CÁC BÊN ═══════ -->
  <h2>Điều 1: Thông tin các bên</h2>

  <h3>Bên A – Bên cho vay:</h3>
  <table class="info-table">
    <tr><td class="label">Tên tổ chức:</td><td>${companyName}</td></tr>
    <tr><td class="label">Địa chỉ:</td><td>${companyAddress}</td></tr>
    <tr><td class="label">Điện thoại:</td><td>${companyPhone}</td></tr>
  </table>

  <h3>Bên B – Bên vay:</h3>
  <table class="info-table">
    <tr><td class="label">Họ và tên:</td><td><strong>${b.fullName || '________________________'}</strong></td></tr>
    <tr><td class="label">Số CCCD/CMND:</td><td>${b.idNumber || '________________________'}</td></tr>
    <tr><td class="label">Ngày sinh:</td><td>${b.dateOfBirth ? formatDate(b.dateOfBirth) : '________________________'}</td></tr>
    <tr><td class="label">Địa chỉ:</td><td>${b.address || '________________________'}</td></tr>
    <tr><td class="label">Số điện thoại:</td><td>${b.phone || '________________________'}</td></tr>
    <tr><td class="label">Email:</td><td>${b.email || '________________________'}</td></tr>
  </table>

  <!-- ═══════ NỘI DUNG VAY ═══════ -->
  <h2>Điều 2: Nội dung khoản vay</h2>

  <div class="highlight">
    <table class="info-table">
      <tr>
        <td class="label">Sản phẩm vay:</td>
        <td><strong>${contract.productName || 'Vay tiêu dùng'}</strong></td>
      </tr>
      <tr>
        <td class="label">Số tiền vay (gốc):</td>
        <td><strong>${formatMoney(contract.principalAmount)} VNĐ</strong>
          <br/><em>(Bằng chữ: ${numberToVietnameseWords(contract.principalAmount)})</em>
        </td>
      </tr>
      <tr>
        <td class="label">Lãi suất:</td>
        <td><strong>${contract.interestRate}% / tháng</strong> (≈ ${(contract.interestRate * 12).toFixed(2)}% / năm)</td>
      </tr>
      <tr>
        <td class="label">Thời hạn vay:</td>
        <td><strong>${contract.tenure} tháng</strong></td>
      </tr>
      <tr>
        <td class="label">Tổng tiền phải trả:</td>
        <td><strong>${formatMoney(contract.totalPayable)} VNĐ</strong>
          <br/><em>(Bằng chữ: ${numberToVietnameseWords(contract.totalPayable)})</em>
        </td>
      </tr>
      <tr>
        <td class="label">Trả hàng tháng:</td>
        <td><strong>${formatMoney(contract.monthlyPayment)} VNĐ</strong></td>
      </tr>
      <tr>
        <td class="label">Ngày giải ngân dự kiến:</td>
        <td>${formatDate(contract.disbursementDate)}</td>
      </tr>
    </table>
  </div>

  <!-- ═══════ PHÍ ═══════ -->
  <h2>Điều 3: Phí khoản vay</h2>
  ${generateFeeSection(contract.feeStructure)}

  <!-- ═══════ LỊCH TRẢ NỢ ═══════ -->
  <h2>Điều 4: Lịch trả nợ</h2>
  <p>Bên B cam kết thực hiện thanh toán theo lịch trả nợ dưới đây:</p>
  <table>
    <thead>
      <tr>
        <th>Kỳ</th>
        <th>Ngày đáo hạn</th>
        <th>Gốc (VNĐ)</th>
        <th>Lãi (VNĐ)</th>
        <th>Tổng (VNĐ)</th>
        <th>Dư nợ còn lại</th>
      </tr>
    </thead>
    <tbody>
      ${generateScheduleRows(contract.repaymentSchedule)}
    </tbody>
  </table>

  <!-- ═══════ QUYỀN VÀ NGHĨA VỤ ═══════ -->
  <h2>Điều 5: Quyền và nghĩa vụ của các bên</h2>

  <h3>5.1. Quyền và nghĩa vụ của Bên A (Bên cho vay):</h3>
  <div class="indent">
    <p>a) Giải ngân đúng số tiền và thời hạn đã cam kết trong hợp đồng;</p>
    <p>b) Có quyền yêu cầu Bên B thanh toán đầy đủ và đúng hạn;</p>
    <p>c) Có quyền áp dụng lãi phạt chậm trả theo quy định;</p>
    <p>d) Thông báo cho Bên B trước ít nhất 07 ngày về bất kỳ thay đổi nào liên quan đến khoản vay.</p>
  </div>

  <h3>5.2. Quyền và nghĩa vụ của Bên B (Bên vay):</h3>
  <div class="indent">
    <p>a) Nhận giải ngân đúng số tiền theo hợp đồng;</p>
    <p>b) Thanh toán đầy đủ các kỳ trả nợ (gốc + lãi) đúng hạn;</p>
    <p>c) Chịu lãi phạt nếu chậm trả: <strong>150%</strong> lãi suất vay cho số ngày chậm;</p>
    <p>d) Có quyền trả trước hạn toàn bộ hoặc một phần khoản vay;</p>
    <p>e) Cung cấp thông tin trung thực, chính xác cho Bên A.</p>
  </div>

  <!-- ═══════ ĐIỀU KHOẢN CHUNG ═══════ -->
  <h2>Điều 6: Điều khoản chung</h2>
  <div class="indent">
    <p>6.1. Hợp đồng này có hiệu lực kể từ ngày hai bên ký kết.</p>
    <p>6.2. Hợp đồng được lập thành 02 bản có giá trị pháp lý như nhau, mỗi bên giữ 01 bản.</p>
    <p>6.3. Mọi tranh chấp phát sinh từ hợp đồng này sẽ được giải quyết thông qua thương lượng. Trường hợp không thương lượng được, các bên đồng ý đưa ra Tòa án nhân dân có thẩm quyền để giải quyết.</p>
    <p>6.4. Các bên đã đọc kỹ, hiểu rõ và đồng ý với toàn bộ nội dung của hợp đồng này.</p>
  </div>

  <!-- ═══════ CHỮ KÝ ═══════ -->
  <div class="signature-section">
    <div class="signature-box">
      <div class="title">Bên A – Bên cho vay</div>
      <div class="note">(Ký, ghi rõ họ tên)</div>
      <div class="signature-placeholder">
        ${contract.legalApprovalAt ? '✓ Đã phê duyệt' : 'Chờ phê duyệt'}
      </div>
      <div class="name">${companyName}</div>
      ${contract.legalApprovalAt ? `<div style="font-size:10pt; color:#27ae60">Ngày: ${formatDate(contract.legalApprovalAt)}</div>` : ''}
    </div>

    <div class="signature-box">
      <div class="title">Bên B – Bên vay</div>
      <div class="note">(Ký, ghi rõ họ tên)</div>
      <div class="signature-placeholder" id="borrower-signature">
        ${
          contract.signatureData
            ? `<img src="${contract.signatureData}" alt="Chữ ký" style="max-width:180px; max-height:90px" />`
            : contract.signedAt
              ? '✓ Đã ký'
              : 'Chờ ký xác nhận'
        }
      </div>
      <div class="name">${b.fullName || '________________________'}</div>
      ${contract.signedAt ? `<div style="font-size:10pt; color:#27ae60">Ngày: ${formatDate(contract.signedAt)}</div>` : ''}
    </div>
  </div>

  <div class="footer">
    <p>Hợp đồng được tạo tự động bởi hệ thống ${companyName}</p>
    <p>Mã hợp đồng: ${contract.contractId}</p>
  </div>

</body>
</html>`;
}
