---
name: memory-service
description: Tự động sử dụng P2P Memory Service (Neo4j + Qdrant) để lấy context code chính xác khi trả lời câu hỏi về nghiệp vụ, kiến trúc, hoặc luồng xử lý.
---

# Memory Service Integration

Sử dụng Memory Service (`http://localhost:5055`) để lấy context code từ codebase P2P trước khi trả lời câu hỏi phức tạp. Service kết hợp Neo4j (graph) + Qdrant (vector) cho hybrid retrieval.

## Khi nào PHẢI sử dụng

Bạn **PHẢI** query Memory Service khi user hỏi về:

1. **Luồng nghiệp vụ** — giải ngân, đầu tư, approve loan, escrow, tính lãi suất
2. **Call chain / code flow** — "function nào gọi function nào", "flow từ A đến B"
3. **Mapping API** — endpoint nào gọi Fineract, payload nào sinh transfer
4. **Cross-file impact** — "thay đổi file X ảnh hưởng file nào"
5. **Kiến trúc / design** — "tại sao dùng cách này", "module nào liên quan"

## Cách sử dụng

### 1. Lấy context snippets (DÙNG CHÍNH)

```powershell
$body = '{"question":"<câu hỏi user>","limit":8}'
$r = Invoke-RestMethod -Uri "http://localhost:5055/agent/context" -Method Post -ContentType "application/json" -Body $body
Write-Output $r.contextText
```

Response `contextText` chứa:
- Top code snippets đã rank (file path, line range, score)
- Related files với symbols và imports
- Retrieval strategy được sử dụng

**Bạn PHẢI inject `contextText` vào reasoning** trước khi trả lời user.

### 2. Health check

```powershell
Invoke-RestMethod -Uri "http://localhost:5055/health" -Method Get
```

Nếu service **offline** → thông báo cho user và fallback sang tìm kiếm thủ công (`grep_search`, `view_file`).

### 3. Query raw (khi cần dữ liệu chi tiết)

```powershell
$body = '{"question":"<câu hỏi>","limit":8}'
$r = Invoke-RestMethod -Uri "http://localhost:5055/memory/query" -Method Post -ContentType "application/json" -Body $body
$r.result | ConvertTo-Json -Depth 5
```

Response chi tiết hơn: chunks (text, path, scores), related files, strategy, timings.

## Quy trình xử lý câu hỏi

```
User hỏi nghiệp vụ/kiến trúc
    │
    ├── 1. Gọi POST /agent/context với question gốc
    │
    ├── 2. Đọc contextText trả về
    │      ├── Xác định files liên quan
    │      └── Hiểu snippets code chính
    │
    ├── 3. (Nếu cần) view_file các file quan trọng từ kết quả
    │
    └── 4. Trả lời user với trích dẫn file path cụ thể
```

## Mẹo query hiệu quả

- **Hỏi tiếng Việt OK** — service tự rewrite song ngữ (giải ngân → disbursement, phí → fee/charge)
- **Dùng keyword kỹ thuật** cho kết quả chính xác hơn: `accounttransfers`, `invest`, `matching`
- **Limit 6-8** là optimal cho hầu hết câu hỏi
- **Nếu kết quả không đủ** → thử rephrase query hoặc tăng limit lên 12

## Codebase được index

Memory service đã index 3 thư mục:

| Thư mục | Nội dung |
|---------|----------|
| `admin_web` | Admin dashboard (React) |
| `client_new` | Mobile app (React Native/Expo) |
| `server_do_an_new` | Backend API (NestJS + Fineract) |

## Fallback

Nếu Memory Service không khả dụng:
1. Thông báo user: "Memory Service đang offline, sử dụng tìm kiếm thủ công"
2. Sử dụng `grep_search` và `view_file` như bình thường
3. Suggest user chạy `docker compose -f docker-compose.memory.yml up -d` tại `d:\Project\p2p-do-an\memory-service`

## UI & Monitoring

- **Codebase Explorer**: http://localhost:5055/ui/
- **Neo4j Browser**: http://localhost:7475 (bolt://localhost:7688, neo4j/neo4jpassword)
- **Metrics**: `GET http://localhost:5055/metrics`
- **Ingest progress**: `GET http://localhost:5055/memory/ingest/progress`
