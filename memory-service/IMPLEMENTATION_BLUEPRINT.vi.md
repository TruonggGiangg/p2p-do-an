# Memory System Blueprint (P2P)

## 1) Use-cases priority

Ưu tiên theo tác động thực tế cho agent:

1. **Code flow / call-chain** (cao nhất)
   - Ví dụ: "flow giải ngân từ escrow sang borrower"
2. **API logic & mapping dữ liệu**
   - Ví dụ: endpoint nào gọi Fineract, payload nào sinh transfer
3. **Design decisions / historical context**
   - Ví dụ: vì sao dùng transfer 2 bước, vì sao skip fee
4. **Doc alignment / policy lookup**
   - Ví dụ: checklist quy trình trong docs khớp code chưa

=> Vì vậy ingest ưu tiên: `server/interators/**`, `server/interfaces/**`, `docs/**`, rồi đến phần còn lại.

## 2) Graph schema

### Node chính
- `File {path, language, hash, size, updatedAt}`
- `Chunk {id, text, startLine, endLine, order, updatedAt}`
- `Symbol {key, name, kind, updatedAt}`
- `ImportRef {source}`
- (phase mở rộng) `API`, `DocSection`, `CommitDecision`

### Edge chính
- `(:File)-[:HAS_CHUNK]->(:Chunk)`
- `(:File)-[:DECLARES]->(:Symbol)`
- `(:File)-[:IMPORTS]->(:ImportRef)`
- (mở rộng) `:Symbol-[:CALLS]->:Symbol`, `:CommitDecision-[:UPDATED]->:File`

## 3) Ingest pipeline

1. Discover files theo glob
2. Parse file + split chunks
3. Mask PII (email, phone, token-like strings)
4. Upsert graph entities/relations
5. Tạo embeddings và upsert Qdrant points
6. Incremental maintenance:
   - skip file unchanged theo hash
   - delete graph/vector cho file đã removed

## 4) Retrieval tối ưu (hybrid)

1. Keyword retrieval từ Neo4j chunks
2. Vector search top-k từ Qdrant
3. Graph candidate retrieval từ Symbol/Import match
4. Merge theo `chunk.id`
5. Rerank bằng **RRF**:
   - `score = Σ (weight_i / (RRF_K + rank_i))`
6. Traverse graph lấy `symbols/imports` để thêm context

Routing mode:
- `graph-first`: query có path/id rõ
- `keyword-first`: query ngắn
- `hybrid`: query ngữ nghĩa/phức hợp

## 5) Test queries thực tế

So sánh `without memory` vs `with /agent/context` cho các nhóm:

- flow/call-chain
- mapping API
- cross-file impact
- câu hỏi mơ hồ, câu hỏi quá rộng

KPI nên theo dõi:
- hit@k của snippet đúng
- thời gian retrieval p95
- tỷ lệ trả lời cần fallback/clarify

## 6) Agent inbound flow

Runtime flow chuẩn:

1. Agent nhận question
2. Gọi `POST /agent/context`
3. Inject `contextText` + top result vào prompt system
4. LLM trả lời + trích dẫn file path liên quan

## 7) Infra & monitoring

Đã có:
- `GET /metrics` (ingest/retrieval avg/p95/max + error count)
- breakdown retrieval: keyword/vector/graph/rerank/related
- `GET /memory/status` (ingest state)
- webhook secret check
- PII masking toggle

Backup:
- Script `scripts/backup-memory.ps1` dump Neo4j + snapshot Qdrant
- Khuyến nghị schedule nightly + retention 7/14 ngày

## 8) Security baseline

- Không ingest secrets thô (`MASK_PII=true`)
- Restrict `/webhooks/git` bằng `x-memory-secret`
- Không public `OPENAI_API_KEY`
- Chỉ expose ports nội bộ ở môi trường production
