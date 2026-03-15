/**
 * Template hợp đồng vay tiêu dùng P2P
 * Dựa theo mẫu hợp đồng vay tiêu dùng Việt Nam
 * Xuất HTML → dùng với pdf renderer
 */

import { LoanContract, RepaymentScheduleItem, FeeStructureItem, BorrowerInfo } from '../schemas/loan-contract.schema';

function mapPolicyActionLabel(policy: any): string {
  const actions: string[] = [];
  if (policy.send_notification) actions.push('Thông báo ứng dụng');
  if (policy.send_email) actions.push('Gửi email nhắc nợ');
  if (policy.send_sms) actions.push('Gửi SMS nhắc nợ');
  if (policy.apply_penalty) actions.push('Áp dụng lãi phạt theo hợp đồng');
  if (policy.block_new_loan) actions.push('Chặn vay mới');

  const stageLabel: Record<string, string> = {
    NONE: 'Theo dõi',
    REMINDER: 'Nhắc nợ',
    WARNING: 'Cảnh báo',
    COLLECTION: 'Chuyển thu hồi',
    LEGAL: 'Xử lý pháp lý',
    WRITE_OFF: 'Nợ mất vốn',
  };
  if (policy.collection_stage && stageLabel[String(policy.collection_stage)]) {
    actions.push(stageLabel[String(policy.collection_stage)]);
  }
  if (policy.legal_escalation) actions.push('Escalation pháp lý');
  return actions.length ? actions.join(', ') : 'Theo chính sách nội bộ tại thời điểm ký';
}

function generateDelinquencyPolicyRows(policies: any[]): string {
  return policies
    .map(
      p => `
    <tr>
      <td style="text-align:center">Nhóm ${p.debt_group}</td>
      <td style="text-align:center">${p.min_days ?? 0} - ${p.max_days ?? 99999} ngày</td>
      <td>${mapPolicyActionLabel(p)}</td>
    </tr>
  `,
    )
    .join('');
}

function generateDelinquencyPolicySection(contract: LoanContract): string {
  const policies = (contract as any).delinquencyPolicySnapshot || [];
  if (!Array.isArray(policies) || policies.length === 0) {
    return `
      <div class="highlight" style="border-color:#d35400;background:#fff7ed;">
        <strong>Chưa có snapshot chính sách nợ quá hạn</strong><br/>
        Hợp đồng chưa ghi nhận cấu hình delinquencyPolicySnapshot tại thời điểm phát hành.
        Vui lòng liên hệ quản trị để rà soát trước khi ký.
      </div>
    `;
  }
  return `
    <table class="delinquency-table">
      <thead>
        <tr>
          <th>Nhóm nợ</th>
          <th>Ngày quá hạn</th>
          <th>Biện pháp xử lý</th>
        </tr>
      </thead>
      <tbody>
        ${generateDelinquencyPolicyRows(policies)}
      </tbody>
    </table>
  `;
}

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
      font-size: 12pt;
      line-height: 1.5;
      color: #1a1a1a;
      padding: 16px 14px;
      max-width: 100%;
      margin: 0 auto;
      -webkit-text-size-adjust: 100%;
    }
    .header {
      text-align: center;
      margin-bottom: 30px;
      border-bottom: 2px solid #333;
      padding-bottom: 20px;
    }
    .header .vento-logo {
      margin-bottom: 10px;
    }
    .header .vento-logo svg {
      display: inline-block;
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
      padding: 4px 6px;
      vertical-align: top;
      word-break: break-word;
    }
    .info-table .label {
      width: 110px;
      min-width: 110px;
      font-weight: bold;
      color: #333;
      font-size: 11pt;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 10px 0;
      font-size: 9pt;
      table-layout: auto;
    }
    table thead th {
      background-color: #1a5276;
      color: #fff;
      padding: 6px 3px;
      text-align: center;
      font-weight: bold;
      font-size: 9pt;
      white-space: nowrap;
    }
    table tbody td {
      border: 1px solid #ddd;
      padding: 4px 3px;
      font-size: 9pt;
    }
    table tbody tr:nth-child(even) {
      background-color: #f8f9fa;
    }
    .delinquency-table {
      font-size: 10pt;
      page-break-inside: avoid;
    }
    .delinquency-table thead th {
      font-size: 10pt;
      white-space: normal;
      line-height: 1.35;
    }
    .delinquency-table tbody td {
      font-size: 10pt;
      line-height: 1.4;
      vertical-align: top;
      word-break: break-word;
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
      flex-direction: row;
      justify-content: space-between;
      margin-top: 40px;
      page-break-inside: avoid;
      gap: 12px;
    }
    .signature-box {
      width: 48%;
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
    @media screen and (max-width: 480px) {
      body { padding: 12px 10px; font-size: 11pt; }
      .header .company-name { font-size: 13pt; }
      .contract-title h1 { font-size: 16pt; }
      h2 { font-size: 12pt; }
      .info-table .label { width: 100px; min-width: 100px; font-size: 10pt; }
      .info-table td { font-size: 10pt; padding: 3px 4px; }
      table { font-size: 8pt; }
      table thead th { font-size: 8pt; padding: 4px 2px; }
      table tbody td { font-size: 8pt; padding: 3px 2px; }
      .signature-box .note { margin-bottom: 40px; }
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
    <div class="vento-logo">
      <svg viewBox="10 20 300 80" width="220" height="55" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="ventoGold" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" style="stop-color:#F0B90B"/>
            <stop offset="50%" style="stop-color:#FCD535"/>
            <stop offset="100%" style="stop-color:#F0B90B"/>
          </linearGradient>
        </defs>
        <g fill="none" stroke="url(#ventoGold)" stroke-width="5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M22 30 L47 82 L72 30"/>
          <path d="M82 30 L112 30 M82 30 L82 82 L112 82 M82 56 L108 56"/>
          <path d="M127 82 L127 30 L167 82 L167 30"/>
          <path d="M182 30 L232 30 M207 30 L207 82"/>
          <path d="M252 30 L282 30 L297 56 L282 82 L252 82 L237 56 Z"/>
        </g>
      </svg>
    </div>
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

  <!-- ═══════ CHÍNH SÁCH NỢ QUÁ HẠN SNAPSHOT ═══════ -->
  <h2>Điều 3A: Chính sách nợ quá hạn tại thời điểm ký</h2>
  <p>Chính sách dưới đây được snapshot tại thời điểm phát hành hợp đồng và được ưu tiên áp dụng cho hợp đồng này.</p>
  ${generateDelinquencyPolicySection(contract)}

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
    <p>c) Có quyền áp dụng lãi phạt chậm trả theo quy định đã công bố tại thời điểm ký hợp đồng;</p>
    <p>d) Thông báo cho Bên B trước ít nhất 07 ngày về bất kỳ thay đổi nào liên quan đến khoản vay.</p>
  </div>

  <h3>5.2. Quyền và nghĩa vụ của Bên B (Bên vay):</h3>
  <div class="indent">
    <p>a) Nhận giải ngân đúng số tiền theo hợp đồng;</p>
    <p>b) Thanh toán đầy đủ các kỳ trả nợ (gốc + lãi) đúng hạn;</p>
    <p>c) Chịu lãi phạt nếu chậm trả theo điều khoản và chính sách nợ quá hạn snapshot tại thời điểm ký;</p>
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

  <!-- ═══════ NHẮC LẠI SNAPSHOT TRƯỚC KHI KÝ ═══════ -->
  <h2>Điều 6A: Xác nhận lại chính sách nợ quá hạn trước khi ký</h2>
  <p>Ngay trước thời điểm ký, Bên B xác nhận đã đọc và đồng ý các nhóm xử lý nợ quá hạn dưới đây:</p>
  ${generateDelinquencyPolicySection(contract)}

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
