/**
 * Template hợp đồng đầu tư P2P (Nhà đầu tư – Lender)
 * Dựa theo mẫu hợp đồng ủy thác đầu tư / hợp đồng cho vay ngang hàng Việt Nam
 * Xuất HTML → render trên WebView hoặc chuyển thành PDF
 */

import { LenderScheduleItem } from '../schemas/investment-contract.schema';

// ── Helpers ─────────────────────────────────────────

function formatMoney(amount: number): string {
  return Math.round(amount).toLocaleString('vi-VN');
}

function formatDate(dateStr?: string | Date): string {
  if (!dateStr) return '___/___/______';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '___/___/______';
  return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function numberToVietnameseWords(num: number): string {
  if (num === 0) return 'không đồng';
  const units = ['', 'một', 'hai', 'ba', 'bốn', 'năm', 'sáu', 'bảy', 'tám', 'chín'];

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

  const groups = ['', 'nghìn', 'triệu', 'tỷ'];
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

function generateScheduleRows(schedule: LenderScheduleItem[]): string {
  let cumulativePrincipal = 0;
  return schedule
    .map(item => {
      cumulativePrincipal += item.principal;
      return `
    <tr>
      <td style="text-align:center">${item.period}</td>
      <td style="text-align:center">${formatDate(item.dueDate)}</td>
      <td style="text-align:right">${formatMoney(item.principal)}</td>
      <td style="text-align:right">${formatMoney(item.interest)}</td>
      <td style="text-align:right; font-weight:600">${formatMoney(item.total)}</td>
      <td style="text-align:right">${formatMoney(cumulativePrincipal)}</td>
    </tr>`;
    })
    .join('');
}

// ── Main Types ──────────────────────────────────────

export interface InvestorInfo {
  fullName?: string;
  idNumber?: string;
  phone?: string;
  email?: string;
  address?: string;
  dateOfBirth?: string;
}

export interface BorrowerSummary {
  creditScore?: number;
  creditGrade?: string;
  loanPurpose?: string;
  loanProductName?: string;
}

export interface InvestmentContractTemplateData {
  contract: any; // InvestmentContract (populated)
  investorInfo?: InvestorInfo;
  borrowerSummary?: BorrowerSummary;
  companyName?: string;
  companyAddress?: string;
  companyPhone?: string;
}

// ── Generate HTML ───────────────────────────────────

export function generateInvestmentContractHTML(data: InvestmentContractTemplateData): string {
  const {
    contract,
    investorInfo = {} as InvestorInfo,
    borrowerSummary = {} as BorrowerSummary,
    companyName = 'CÔNG TY CHO VAY NGANG HÀNG P2P VENTO',
    companyAddress = 'TP. Hồ Chí Minh, Việt Nam',
    companyPhone = '1900-xxxx',
  } = data;

  const inv = investorInfo;
  const now = new Date();
  const maturityDate = new Date(now);
  maturityDate.setMonth(maturityDate.getMonth() + (contract.periodMonth || 0));

  const totalScheduleRows = contract.lenderSchedule?.length || 0;
  const totalPrincipal = contract.scheduleTotalPrincipal || contract.capital || 0;
  const totalInterest = contract.scheduleTotalInterest || contract.entirelyProfit || 0;
  const totalIncome = contract.scheduleTotalIncome || contract.entirelyPay || 0;

  return `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Hợp đồng đầu tư - ${contract.contractId}</title>
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
      border-bottom: 2px solid #14342B;
      padding-bottom: 20px;
    }
    .header .vento-logo {
      margin-bottom: 10px;
    }
    .header .company-name {
      font-size: 16pt;
      font-weight: bold;
      text-transform: uppercase;
      color: #14342B;
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
      color: #14342B;
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
      width: 140px;
      min-width: 140px;
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
      background-color: #14342B;
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
    .highlight {
      background-color: #f0faf6;
      border: 1px solid #b2dfdb;
      border-radius: 4px;
      padding: 12px 16px;
      margin: 12px 0;
    }
    .highlight strong { color: #14342B; }
    .risk-box {
      background-color: #FFF8E1;
      border: 1px solid #FFD54F;
      border-radius: 4px;
      padding: 12px 16px;
      margin: 12px 0;
    }
    .risk-box strong { color: #E65100; }
    .article { margin: 10px 0; }
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
      .info-table .label { width: 110px; min-width: 110px; font-size: 10pt; }
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
            <stop offset="0%" style="stop-color:#14342B"/>
            <stop offset="50%" style="stop-color:#1A3B34"/>
            <stop offset="100%" style="stop-color:#14342B"/>
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
    <h1>Hợp đồng đầu tư cho vay ngang hàng</h1>
  </div>
  <div class="contract-number">Số: <strong>${contract.contractId}</strong></div>
  <div class="contract-date">
    Ngày ${now.getDate()} tháng ${now.getMonth() + 1} năm ${now.getFullYear()}
  </div>

  <!-- ═══════ CĂN CỨ PHÁP LÝ ═══════ -->
  <h2>Căn cứ pháp lý</h2>
  <div class="indent">
    <p>- Căn cứ Bộ luật Dân sự số 91/2015/QH13 ngày 24/11/2015;</p>
    <p>- Căn cứ Nghị định 18/2022/NĐ-CP về Sandbox cho Fintech;</p>
    <p>- Căn cứ Thông tư 39/2016/TT-NHNN về hoạt động cho vay;</p>
    <p>- Căn cứ Luật Đầu tư số 61/2020/QH14;</p>
    <p>- Căn cứ vào năng lực pháp lý và ý chí tự nguyện của các bên.</p>
  </div>

  <!-- ═══════ THÔNG TIN CÁC BÊN ═══════ -->
  <h2>Điều 1: Thông tin các bên</h2>

  <h3>Bên A – Sàn giao dịch (Bên trung gian):</h3>
  <table class="info-table">
    <tr><td class="label">Tên tổ chức:</td><td>${companyName}</td></tr>
    <tr><td class="label">Vai trò:</td><td>Trung gian kết nối cho vay ngang hàng (P2P Lending Platform)</td></tr>
    <tr><td class="label">Địa chỉ:</td><td>${companyAddress}</td></tr>
    <tr><td class="label">Điện thoại:</td><td>${companyPhone}</td></tr>
  </table>

  <h3>Bên B – Nhà đầu tư (Bên cho vay):</h3>
  <table class="info-table">
    <tr><td class="label">Họ và tên:</td><td><strong>${inv.fullName || '________________________'}</strong></td></tr>
    <tr><td class="label">Số CCCD/CMND:</td><td>${inv.idNumber || '________________________'}</td></tr>
    <tr><td class="label">Ngày sinh:</td><td>${inv.dateOfBirth ? formatDate(inv.dateOfBirth) : '________________________'}</td></tr>
    <tr><td class="label">Địa chỉ:</td><td>${inv.address || '________________________'}</td></tr>
    <tr><td class="label">Số điện thoại:</td><td>${inv.phone || '________________________'}</td></tr>
    <tr><td class="label">Email:</td><td>${inv.email || '________________________'}</td></tr>
  </table>

  <!-- ═══════ NỘI DUNG ĐẦU TƯ ═══════ -->
  <h2>Điều 2: Nội dung đầu tư</h2>

  <div class="highlight">
    <table class="info-table">
      <tr>
        <td class="label">Mã hợp đồng:</td>
        <td><strong>${contract.contractId}</strong></td>
      </tr>
      <tr>
        <td class="label">Vốn đầu tư:</td>
        <td><strong>${formatMoney(contract.capital)} VNĐ</strong>
          <br/><em>(Bằng chữ: ${numberToVietnameseWords(contract.capital)})</em>
        </td>
      </tr>
      <tr>
        <td class="label">Số notes đầu tư:</td>
        <td><strong>${contract.numNotes}</strong> notes</td>
      </tr>
      <tr>
        <td class="label">Kỳ hạn đầu tư:</td>
        <td><strong>${contract.periodMonth} tháng</strong></td>
      </tr>
      <tr>
        <td class="label">Lãi suất:</td>
        <td><strong>${contract.monthlyRatePercent?.toFixed(2) || '0'}% / tháng</strong> (≈ ${contract.annualRatePercent?.toFixed(2) || '0'}% / năm)</td>
      </tr>
      <tr>
        <td class="label">Thu nhập hàng tháng:</td>
        <td><strong>${formatMoney(contract.monthlyIncome || 0)} VNĐ</strong></td>
      </tr>
      <tr>
        <td class="label">Tổng lợi nhuận dự kiến:</td>
        <td><strong>${formatMoney(contract.entirelyProfit || 0)} VNĐ</strong></td>
      </tr>
      <tr>
        <td class="label">Tổng nhận về dự kiến:</td>
        <td><strong>${formatMoney(contract.entirelyPay || 0)} VNĐ</strong>
          <br/><em>(Bằng chữ: ${numberToVietnameseWords(contract.entirelyPay || 0)})</em>
        </td>
      </tr>
      <tr>
        <td class="label">Phí dịch vụ:</td>
        <td>${formatMoney(contract.serviceFee || 0)} VNĐ</td>
      </tr>
      <tr>
        <td class="label">Ngày đáo hạn dự kiến:</td>
        <td>${formatDate(contract.fdMaturityDate || maturityDate)}</td>
      </tr>
    </table>
  </div>

  <!-- ═══════ THÔNG TIN KHOẢN VAY ═══════ -->
  <h2>Điều 3: Thông tin khoản vay được đầu tư</h2>
  <div class="risk-box">
    <p><strong>⚠ Lưu ý về rủi ro:</strong> Đầu tư cho vay ngang hàng (P2P Lending) có rủi ro mất vốn.
    Bên B đã đọc hiểu và chấp nhận rủi ro tín dụng khi tham gia đầu tư.</p>
  </div>
  <table class="info-table">
    <tr>
      <td class="label">Mục đích vay:</td>
      <td>${borrowerSummary.loanPurpose || 'Vay tiêu dùng'}</td>
    </tr>
    <tr>
      <td class="label">Sản phẩm vay:</td>
      <td>${borrowerSummary.loanProductName || 'Vay cá nhân'}</td>
    </tr>
    ${
      borrowerSummary.creditScore
        ? `
    <tr>
      <td class="label">Điểm tín dụng người vay:</td>
      <td><strong>${borrowerSummary.creditScore}</strong> (Hạng: ${borrowerSummary.creditGrade || 'N/A'})</td>
    </tr>
    `
        : ''
    }
  </table>

  <!-- ═══════ LỊCH NHẬN TIỀN ═══════ -->
  <h2>Điều 4: Lịch nhận tiền dự kiến</h2>
  <p>Bên B sẽ nhận lại vốn và lãi theo lịch trình sau (${totalScheduleRows} kỳ):</p>

  <div class="highlight">
    <table class="info-table">
      <tr>
        <td class="label">Tổng vốn gốc nhận lại:</td>
        <td><strong>${formatMoney(totalPrincipal)} VNĐ</strong></td>
      </tr>
      <tr>
        <td class="label">Tổng lãi nhận được:</td>
        <td><strong>${formatMoney(totalInterest)} VNĐ</strong></td>
      </tr>
      <tr>
        <td class="label">Tổng thu nhập:</td>
        <td><strong>${formatMoney(totalIncome)} VNĐ</strong></td>
      </tr>
    </table>
  </div>

  <table>
    <thead>
      <tr>
        <th>Kỳ</th>
        <th>Ngày nhận</th>
        <th>Gốc (VNĐ)</th>
        <th>Lãi (VNĐ)</th>
        <th>Tổng (VNĐ)</th>
        <th>Lũy kế gốc</th>
      </tr>
    </thead>
    <tbody>
      ${generateScheduleRows(contract.lenderSchedule || [])}
    </tbody>
  </table>

  <!-- ═══════ QUYỀN VÀ NGHĨA VỤ ═══════ -->
  <h2>Điều 5: Quyền và nghĩa vụ các bên</h2>

  <h3>5.1. Quyền và nghĩa vụ của Bên A (Sàn giao dịch):</h3>
  <div class="indent">
    <p>a) Thực hiện vai trò trung gian kết nối giữa nhà đầu tư và người vay;</p>
    <p>b) Quản lý giao dịch, lưu ký vốn và phân phối dòng tiền theo lịch trình;</p>
    <p>c) Cung cấp thông tin minh bạch về khoản vay và rủi ro cho Bên B;</p>
    <p>d) Thực hiện biện pháp thu hồi nợ khi người vay vi phạm;</p>
    <p>e) Thu phí dịch vụ theo chính sách đã công bố.</p>
  </div>

  <h3>5.2. Quyền và nghĩa vụ của Bên B (Nhà đầu tư):</h3>
  <div class="indent">
    <p>a) Được nhận lại vốn gốc và lãi suất theo lịch trình đã cam kết;</p>
    <p>b) Được cung cấp thông tin về tình trạng khoản vay minh bạch, kịp thời;</p>
    <p>c) Chấp nhận rủi ro tín dụng: Bên A không đảm bảo 100% thu hồi vốn trong trường hợp người vay mất khả năng thanh toán;</p>
    <p>d) Không rút vốn trước hạn trừ khi có thỏa thuận đặc biệt;</p>
    <p>e) Cung cấp thông tin trung thực khi đăng ký tài khoản đầu tư.</p>
  </div>

  <!-- ═══════ CAM KẾT VỀ RỦI RO ═══════ -->
  <h2>Điều 6: Cam kết và rủi ro đầu tư</h2>
  <div class="indent">
    <p>6.1. <strong>Rủi ro tín dụng:</strong> Bên B hiểu rằng người vay có thể không thanh toán đúng hạn hoặc mất khả năng thanh toán, dẫn đến việc Bên B có thể không thu hồi được một phần hoặc toàn bộ khoản đầu tư.</p>
    <p>6.2. <strong>Rủi ro thanh khoản:</strong> Bên B hiểu rằng khoản đầu tư không thể rút trước hạn và phải tuân thủ lịch trình nhận tiền đã cam kết.</p>
    <p>6.3. <strong>Miễn trừ trách nhiệm:</strong> Bên A không chịu trách nhiệm bồi thường nếu Bên B bị thiệt hại do rủi ro tín dụng của người vay, với điều kiện Bên A đã thực hiện đầy đủ nghĩa vụ cung cấp thông tin và biện pháp thu hồi nợ.</p>
    <p>6.4. Bên B xác nhận đã đọc hiểu toàn bộ thông tin về khoản vay, điểm tín dụng người vay, và cam kết tự chịu trách nhiệm về quyết định đầu tư của mình.</p>
  </div>

  <!-- ═══════ ĐIỀU KHOẢN CHUNG ═══════ -->
  <h2>Điều 7: Điều khoản chung</h2>
  <div class="indent">
    <p>7.1. Hợp đồng này có hiệu lực kể từ ngày hai bên ký kết bằng chữ ký số.</p>
    <p>7.2. Hợp đồng được lập thành bản điện tử, có giá trị pháp lý tương đương bản giấy theo Luật Giao dịch điện tử.</p>
    <p>7.3. Mọi tranh chấp phát sinh sẽ được giải quyết thông qua thương lượng. Trường hợp không thương lượng được, các bên đồng ý đưa ra Trung tâm Trọng tài hoặc Tòa án nhân dân có thẩm quyền.</p>
    <p>7.4. Các bên đã đọc kỹ, hiểu rõ và đồng ý với toàn bộ nội dung hợp đồng.</p>
    <p>7.5. Hợp đồng tự động kết thúc khi Bên B đã nhận đầy đủ vốn gốc và lãi theo lịch trình, hoặc khi khoản vay được tất toán trước hạn.</p>
  </div>

  <!-- ═══════ CHỮ KÝ ═══════ -->
  <div class="signature-section">
    <div class="signature-box">
      <div class="title">Bên A – Sàn giao dịch</div>
      <div class="note">(Đại diện hệ thống)</div>
      <div class="signature-placeholder">
        ✓ Hệ thống tự động xác nhận
      </div>
      <div class="name">${companyName}</div>
    </div>

    <div class="signature-box">
      <div class="title">Bên B – Nhà đầu tư</div>
      <div class="note">(Ký số xác nhận)</div>
      <div class="signature-placeholder" id="investor-signature">
        ${contract.signatureData ? '✓ Đã ký số' : contract.signedAt ? '✓ Đã ký' : 'Chờ ký xác nhận'}
      </div>
      <div class="name">${inv.fullName || '________________________'}</div>
      ${contract.signedAt ? `<div style="font-size:10pt; color:#27ae60">Ngày: ${formatDate(contract.signedAt)}</div>` : ''}
    </div>
  </div>

  <div class="footer">
    <p>Hợp đồng điện tử được tạo tự động bởi hệ thống ${companyName}</p>
    <p>Mã hợp đồng: ${contract.contractId}</p>
    ${contract.smartCASignatureVerified ? '<p style="color:#27ae60"><strong>✓ Đã xác thực chữ ký số SmartCA</strong></p>' : ''}
  </div>

</body>
</html>`;
}
