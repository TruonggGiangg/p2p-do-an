# 📘 Chiến Lược Dòng Tiền & Lịch Trả Nợ P2P

> **Tóm tắt:** Tài liệu này giải thích cơ chế cốt lõi của hệ thống P2P về cách tính toán Lịch vay, Lịch trả nợ và Dòng tiền nhận về của Nhà đầu tư (Lender). Chúng ta áp dụng mô hình **Dòng Tiền Tự Nhiên (Natural Cashflow)** để đảm bảo tính minh bạch, an toàn pháp lý và tối ưu hóa trải nghiệm người dùng.

---

## 1. Triết Lý Cốt Lõi: "Dòng Tiền Tự Nhiên"

Thay vì cố gắng "làm phẳng" (flat) số tiền trả hàng tháng để nó đều tăm tắp như Ngân hàng truyền thống, chúng ta chọn phương án **Pass-through Model** (Chuyển tiếp).

*   **Borrower trả bao nhiêu:** Hệ thống ghi nhận bấy nhiêu.
*   **Sàn trích phí:** Ngay tại thời điểm giao dịch phát sinh.
*   **Lender nhận phần còn lại:** Chuyển thẳng về ví Lender.

### Tại sao chọn cách này?
1.  **Minh bạch tuyệt đối:** Lender thấy rõ tiền của mình đi đâu, về đâu. Không có "quỹ đen" hay "bể chứa" trung gian.
2.  **An toàn pháp lý:** Sàn đóng vai trò **Môi giới (Broker)** thuần túy, không huy động vốn trả lãi cố định.
3.  **Khuyến khích tái đầu tư:** Dòng tiền thực nhận của Lender có xu hướng **Tăng nhẹ dần** về cuối kỳ, tạo cảm giác tích cực.

---

## 2. Cơ Chế Tính Toán Chi Tiết

### A. Với Người Vay (Borrower)
*   **Phương pháp:** Dư nợ giảm dần (Declining Balance).
*   **Đặc điểm:** Số tiền trả hàng tháng (EMI) là cố định.
    *   **Tháng đầu:** Gốc trả ít, Lãi trả nhiều (do dư nợ cao).
    *   **Tháng cuối:** Gốc trả nhiều, Lãi trả ít (do dư nợ thấp).

### B. Với Sàn (Platform Revenue)
*   **Phí môi giới (Spread):** Sàn thu phí dựa trên chênh lệch lãi suất.
*   **Công thức:** `Phí = Borrower Interest Payment x (Spread / Borrower Rate)`
*   **Xu hướng:** Vì tiền lãi Borrower trả giảm dần theo thời gian -> Doanh thu của Sàn cũng giảm dần theo từng kỳ của khoản vay đó.

### C. Với Nhà Đầu Tư (Lender Investment Return)
Đây là phần thú vị nhất. Dòng tiền Lender nhận về = **Gốc (100%) + Lãi (Sau phí)**.

#### Hiện tượng: "Tổng tiền về túi Tăng Dần"
Mặc dù lợi nhuận (Profit) giảm dần theo thời gian, nhưng tổng tiền mặt (Cash) chảy về ví Lender lại **Tăng Dần**.

| Hạng mục | Tháng 1 (Đầu kỳ) | Tháng Cuối (Cuối kỳ) | Xu hướng |
| :--- | :--- | :--- | :--- |
| **1. Tiền Gốc** (Lender nhận 100%) | Thấp (Ví dụ: 488k) | **Rất Cao** (Ví dụ: 630k) | 📈 Tăng mạnh |
| **2. Tiền Lãi** (Lender nhận ~83%) | Cao (Ví dụ: 125k) | Thấp (Ví dụ: 7.5k) | 📉 Giảm mạnh |
| **TỔNG NHẬN (1+2)** | **613k** | **637.5k** | **↗️ Tăng nhẹ** |

**Lý do:**
1.  **Tỷ trọng Gốc tăng:** Càng về cuối, phần Lender nhận được chủ yếu là Gốc. Gốc được hoàn trả 100% không mất phí.
2.  **Phí sàn giảm:** Càng về cuối, lãi ít đi -> Phí sàn thu (trên lãi) cũng ít đi -> Lãi ròng Lender nhận được trọn vẹn hơn.

---

## 3. Bài Toán Ví Dụ (Case Study)

Giả sử khoản đầu tư: **10.000.000 VNĐ**
*   Lãi suất vay: **18%**
*   Phí sàn (Spread): **3%**
*   Lãi suất Lender thực nhận: **15%**
*   Kỳ hạn: **18 tháng**

### Phân tích dòng tiền

1.  **Tháng 1:**
    *   Borrower trả lãi to (150k).
    *   Sàn thu phí to (~25k).
    *   Lender nhận lãi 125k + Gốc 488k = **613k**.

2.  **Tháng 18:**
    *   Borrower trả chủ yếu là gốc (630k).
    *   Lãi tí hon (9k).
    *   Sàn thu phí tí hon (~1.5k).
    *   Lender nhận Gốc 630k + Lãi 7.5k = **637.5k**.

👉 **Lender cảm thấy:** "À, càng về cuối tiền về càng 'đậm' hơn chút, sướng hơn!" -> Dễ dàng ra quyết định tái đầu tư cho khoản vay mới.

---

## 4. Kết Luận Chiến Lược

Chúng ta **KHÔNG** sửa code để làm phẳng dòng tiền này. Việc giữ dòng tiền tự nhiên (Natural Flow) mang lại lợi ích kép:

1.  **Về Kỹ thuật:** Giảm thiểu rủi ro tính toán sai lệch, không cần xử lý các trường hợp bù trừ phức tạp khi tất toán sớm/trễ hạn.
2.  **Về Business:** Dòng tiền sạch, minh bạch, phù hợp với mô hình P2P chuẩn quốc tế.
3.  **Về UX:** Mang lại trải nghiệm tích cực "về đích" cho nhà đầu tư.

## 5. Phân Tích Chuyên Sâu: Tại Sao Đây Là Chiến Thuật "Vàng"?

Chiến thuật bạn đang áp dụng là sự kết hợp của **Trả góp theo dư nợ giảm dần (Annuity)** và **Mô hình chia sẻ doanh thu (Revenue Sharing)**. Đây là chiến thuật "Vàng" cho các nền tảng P2P Lending chuyên nghiệp với 4 lợi ích sát sườn:

### 1. Giảm thiểu rủi ro mất vốn (Quan trọng nhất)
Trong đầu tư P2P, rủi ro lớn nhất là Borrower bùng nợ.
*   Với chiến thuật này, dòng tiền **Gốc (Principal)** trả về cho Lender **TĂNG DẦN** theo thời gian.
*   **Lợi ích:** Nếu Borrower trả được khoảng 10-12 tháng rồi mới bùng nợ, thì lúc đó Lender đã thu hồi được phần lớn tiền gốc rồi. Thiệt hại sẽ thấp hơn rất nhiều so với việc trả lãi hàng tháng còn gốc trả cuối kỳ (Bullet Payment).

### 2. Tối ưu hóa "Lãi Kép" (Compound Interest)
Đây là vũ khí bí mật của Lender.
*   Vì tiền **Gốc** được trả về ngay từ tháng đầu tiên (chứ không bị giam đến cuối kỳ), Lender có thể lấy ngay số tiền đó để đầu tư vào một hợp đồng vay mới.
*   **Hiệu ứng:** Tiền đẻ ra tiền liên tục. Tốc độ quay vòng vốn nhanh giúp lãi suất thực tế (IRR) của Lender cao hơn con số 15% trên giấy tờ.

### 3. Minh bạch và Công bằng (Fairness)
*   **Cơ chế:** Phí sàn (Spread 3%) được tính trên Tiền Lãi thực tế.
*   **Thực tế:**
    *   Tháng đầu lãi nhiều → Sàn thu phí nhiều.
    *   Tháng cuối lãi ít → Sàn thu phí ít.
*   **Tâm lý:** Lender cảm thấy công bằng vì không bị "cắt phế" một cục cố định khi lợi nhuận đang giảm dần. Sàn và Lender "cùng hội cùng thuyền" (Win-Win).

### 4. An toàn pháp lý cho Sàn
Nếu bạn cam kết trả dòng tiền "phẳng lỳ" (đều tăm tắp), bạn đang hành xử giống Ngân hàng (Huy động vốn trả lãi cố định), rất rủi ro pháp lý.
*   Bằng cách trả theo **dòng tiền tự nhiên**: Bạn chỉ đóng vai trò là Người chuyển phát tiền (Pass-through).
*   **Lá chắn pháp lý:** Bạn chứng minh được: "Khách trả sao tôi chuyển vậy, tôi chỉ thu phí dịch vụ".

**Tóm lại:**
Chiến thuật này biến khoản đầu tư thành một "Dòng suối":
*   Chảy mạnh dần về lượng nước (Tiền mặt về ví tăng).
*   An toàn dần theo thời gian (Gốc đã thu về túi).
*   Tạo cơ hội tái đầu tư liên tục.

> *Tài liệu được soạn thảo ngày 27/12/2026 bởi Team P2P Antigravity.*
