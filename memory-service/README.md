# P2P Memory Service (Graph + Vector, Full Optimize)

Dịch vụ này tạo persistent memory cho agent bằng Neo4j + Qdrant:

- Ingest code/docs thành graph (File, Chunk, Symbol, ImportRef)
- Tạo vector chunk để semantic retrieval
- Query hybrid (keyword + vector + graph metadata)
- Chạy độc lập, không tác động business flow hiện tại

## 1) Chạy stack

Từ thư mục p2p:

docker compose -f docker-compose.memory.yml up -d --build

Kiểm tra:

curl http://localhost:5055/health
curl http://localhost:5055/memory/status
curl http://localhost:5055/metrics

Services:

- Neo4j Browser: http://localhost:7475
- Qdrant API: http://localhost:6333
- Memory Service API: http://localhost:5055

## 2) Ingest dữ liệu

Ingest thủ công:

curl -X POST http://localhost:5055/memory/ingest \
  -H "Content-Type: application/json" \
  -d "{}"

Payload tùy chọn:

{
  "projectRoot": "/workspace/server",
  "includeGlob": "**/*.{js,ts,md}",
  "excludeGlobs": ["**/node_modules/**", "**/tests/**"]
}

### Ingest tự động theo lịch

Trong docker-compose.memory.yml:

- AUTO_INGEST_ENABLED=true
- AUTO_INGEST_INTERVAL_SEC=900

### Theo dõi tiến độ ingest (real-time)

Endpoint: GET /memory/ingest/progress

Trả về:

```json
{
  "ok": true,
  "ingestInProgress": true,
  "progress": {
    "current": 450,
    "total": 1500,
    "percent": 30,
    "currentFile": "fineract-provider/src/.../LoanProduct.java",
    "indexedFiles": 200,
    "skippedFiles": 250
  },
  "lastIngest": {
    "status": "running",
    "trigger": "manual_api",
    "startedAt": "2026-03-04T01:00:00Z",
    "finishedAt": null
  }
}
```

Poll nhanh bằng PowerShell:

```powershell
# Xem tiến độ ingest real-time
while ($true) {
  $p = Invoke-RestMethod -Uri "http://localhost:5055/memory/ingest/progress"
  if (-not $p.ingestInProgress) { Write-Host "Done!"; break }
  Write-Host "$($p.progress.percent)% ($($p.progress.current)/$($p.progress.total)) - $($p.progress.currentFile)"
  Start-Sleep -Seconds 2
}
```

Endpoint GET /memory/status cũng trả về `progress` khi đang ingest.

### Ingest qua Git webhook

Endpoint: POST /webhooks/git

Header bắt buộc khi bật secret:

- x-memory-secret: giá trị MEMORY_WEBHOOK_SECRET

Ví dụ:

curl -X POST http://localhost:5055/webhooks/git \
  -H "Content-Type: application/json" \
  -H "x-memory-secret: change-this-secret" \
  -d "{}"

## 3) Agent query

Query raw:

curl -X POST http://localhost:5055/memory/query \
  -H "Content-Type: application/json" \
  -d '{"question":"flow giải ngân từ escrow sang borrower nằm ở đâu?","limit":8}'

Trả về:

- chunks: top snippets đã rerank hybrid
- related: symbols/imports từ top files
- strategy: hybrid hoặc keyword
- weights: trọng số keyword/vector
- mode: graph-first | keyword-first | hybrid
- rrfK: hệ số fusion rank

### Wrapper cho agent runtime

Endpoint: POST /agent/context

Input:

{
  "question": "flow giải ngân từ escrow sang borrower nằm ở đâu?",
  "limit": 8
}

Output:

- contextText: đoạn context đã format sẵn để inject prompt
- result: dữ liệu retrieval gốc

## 4) Reset memory

curl -X POST http://localhost:5055/memory/reset

Lệnh này reset cả graph và vector collection.

## 5) Chế độ semantic tốt nhất

Mặc định đang dùng EMBEDDING_PROVIDER=local-hash (không cần API key).

Để semantic query tốt hơn:

- set EMBEDDING_PROVIDER=openai
- set OPENAI_API_KEY hợp lệ
- giữ QDRANT_URL hoạt động

## 5.3) Agent answer provider (OpenAI/Gemini/No-key)

Endpoint:

- `POST /agent/answer`

Body:

```json
{
  "question": "api nao tao transfer accounttransfers va tinh fee",
  "debug": true
}
```

Provider options:

- `ANSWER_PROVIDER=auto`: ưu tiên OpenAI, fallback Gemini, rồi fallback extractive
- `ANSWER_PROVIDER=openai`: chỉ gọi OpenAI, lỗi thì fallback extractive
- `ANSWER_PROVIDER=gemini`: chỉ gọi Gemini, lỗi thì fallback extractive
- `ANSWER_PROVIDER=extractive`: không gọi LLM (không cần key)

Cấu hình Gemini:

- `ANSWER_PROVIDER=gemini`
- `ANSWER_GEMINI_MODEL=gemini-1.5-flash` (hoặc model Gemini bạn muốn)
- `ANSWER_GEMINI_API_KEY=<your_key>` (hoặc dùng `GEMINI_API_KEY`)

Khi `debug=true`, response có `debug.providerUsed` để bạn biết thực tế đang dùng `gemini`, `openai`, hay `extractive`.

Tự động ghi file tạm `.txt` cho mỗi lần `POST /agent/answer`:

- Response sẽ có `tmpFilePath`.
- Response có thêm `tmpFileName` và `tmpFileUrl` để agent đọc file qua HTTP.
- File chứa: câu hỏi, answer, used files, reasoning mode, retrieval timings.
- Mặc định lưu ở thư mục temp của hệ điều hành (`.../p2p-memory-service/agent-answers`).
- Có thể override bằng env: `ANSWER_TMP_DIR`.
- Với Docker compose hiện tại, tmp được map ra host tại: `p2p/memory-service/tmp/agent-answers`.
- Có dọn tự động theo TTL:
  - `ANSWER_TMP_CLEANUP_ENABLED=true`
  - `ANSWER_TMP_TTL_SEC=86400` (mặc định 24h)
  - `ANSWER_TMP_CLEANUP_INTERVAL_SEC=600` (mặc định 10 phút)

Đọc file tạm qua API:

- `GET /agent/answer/tmp/{tmpFileName}`

## 5.1) Monitoring + PII

- `GET /metrics`: trả về cả `recent` (sliding window) và `lifetime` (toàn bộ uptime)
- Backward compatible: trường `ingest` và `retrieval` vẫn map tới `recent`
- `recent` có `avg/p95/max`; `lifetime` có `count/avg/max` + errors + lastAt
- `POST /metrics/reset` với body `{ "scope": "recent" }` hoặc `{ "scope": "all" }`
- Nếu bật `MEMORY_WEBHOOK_SECRET`, reset cần header `x-memory-secret`
- `MASK_PII=true`: mask email/phone/token-like data trước khi lưu memory
- `METRIC_WINDOW_SIZE=200`: số mẫu dùng để tính thống kê

Ví dụ reset recent metrics:

curl -X POST http://localhost:5055/metrics/reset \
  -H "Content-Type: application/json" \
  -H "x-memory-secret: change-this-secret" \
  -d '{"scope":"recent"}'

## 5.2) Retrieval tuning (RRF + routing)

- `KEYWORD_WEIGHT`, `VECTOR_WEIGHT`, `GRAPH_WEIGHT`: trọng số 3 nguồn retrieval
- `RRF_K`: hằng số trong Reciprocal Rank Fusion
- `MIN_VECTOR_SCORE`: ngưỡng loại vector match nhiễu

Routing mặc định:

- Query có ID/path rõ -> `graph-first`
- Query rất ngắn -> `keyword-first`
- Còn lại -> `hybrid`

Query rewrite song ngữ (Việt -> Anh):

- Hệ thống tự mở rộng alias kỹ thuật khi phát hiện từ khóa tiếng Việt/Anh (ví dụ: `giải ngân` -> `disbursement`, `chuyển khoản` -> `accounttransfers`, `phí` -> `fee/charge`).
- Mục tiêu: vẫn hỏi tiếng Việt tự nhiên nhưng tăng recall ở code/symbol đặt tên tiếng Anh.
- API không đổi, chỉ cải thiện retrieval nội bộ.

## 6) Giải thích ngắn để dễ hiểu

- Nếu bạn hỏi có từ khóa rõ, keyword đã đủ tốt.
- Nếu bạn hỏi tự nhiên, nhiều cách diễn đạt khác nhau, vector giúp bắt đúng ngữ nghĩa.
- Hybrid kết hợp cả hai nên ổn định hơn và ít miss context hơn keyword-only.

## 7) Blueprint triển khai

Xem tài liệu chi tiết theo checklist kiến trúc tại:

- `memory-service/IMPLEMENTATION_BLUEPRINT.vi.md`

## 8) Tích hợp quy trình code (CI helper)

Script:

- `memory-service/scripts/run-memory-ci.ps1`

Script sẽ chạy theo flow:

1. Health check
2. Reset metrics recent (nếu không skip)
3. Ingest (nếu không skip)
4. Chạy 10 query benchmark qua `/agent/context`
5. In summary + metrics snapshot (`recent` và `lifetime`)
6. Optional fail build theo threshold

Ví dụ:

```powershell
cd p2p/memory-service
./scripts/run-memory-ci.ps1
```

Chạy như gate trong CI (fail nếu vượt ngưỡng):

```powershell
./scripts/run-memory-ci.ps1 -EnforceThresholds -MaxAvgMs 250 -MaxP95Ms 500
```

Nếu đã ingest trước đó:

```powershell
./scripts/run-memory-ci.ps1 -SkipIngest
```

## 9) Rule để agent tự biết khi nào phải update tài liệu

Rule file:

- `memory-service/AGENT_RULES.md`

Script check rule:

- `memory-service/scripts/check-doc-rules.ps1`

Chạy riêng:

```powershell
./scripts/check-doc-rules.ps1
```

Enforce fail (dùng cho CI):

```powershell
./scripts/check-doc-rules.ps1 -Enforce
```

Tích hợp trực tiếp vào memory CI script:

```powershell
./scripts/run-memory-ci.ps1 -CheckDocRules
./scripts/run-memory-ci.ps1 -EnforceDocRules -EnforceThresholds
```

## 10) Evaluation tự động (quality report)

Dataset ground-truth:

- `memory-service/scripts/eval-dataset.json`
- `memory-service/scripts/eval-dataset-golive.json` (bộ 50 case cho go-live gate)

Script chấm quality:

- `memory-service/scripts/evaluate-memory.ps1`

Chạy nhanh:

```powershell
./scripts/evaluate-memory.ps1
```

Mặc định mỗi lần chạy sẽ lưu artifact vào `./tmp/eval-reports`:

- `eval-<timestamp>-details.json` (summary + per-case rows)
- `eval-<timestamp>-cases.csv` (per-case table)
- `eval-<timestamp>-summary.json` (run summary)
- `latest-summary.json` (summary mới nhất)

Tùy chỉnh nơi lưu report hoặc tắt lưu report:

```powershell
./scripts/evaluate-memory.ps1 -ReportDir ./tmp/eval-reports
./scripts/evaluate-memory.ps1 -SkipReport
```

Enforce fail theo ngưỡng:

```powershell
./scripts/evaluate-memory.ps1 -Enforce -MinRetrievalHitRate 0.75 -MinAnswerKeywordRate 0.60
```

Chế độ go-live (ngưỡng chặt hơn + tối thiểu số case):

```powershell
./scripts/evaluate-memory.ps1 -QualityProfile golive
./scripts/evaluate-memory.ps1 -QualityProfile golive -DatasetPath ./scripts/eval-dataset-golive.json
./scripts/evaluate-memory.ps1 -QualityProfile golive -Enforce
```

Tích hợp trong CI helper:

```powershell
./scripts/run-memory-ci.ps1 -RunEval
./scripts/run-memory-ci.ps1 -EnforceThresholds -EnforceEval
./scripts/run-memory-ci.ps1 -RunEval -EvalReportDir ./tmp/eval-reports
./scripts/run-memory-ci.ps1 -RunEval -SkipEvalReport
./scripts/run-memory-ci.ps1 -GoLiveGate -RunEval
./scripts/run-memory-ci.ps1 -GoLiveGate -RunEval -EnforceThresholds -EnforceEval
```

`-GoLiveGate` sẽ tự động dùng `./scripts/eval-dataset-golive.json` nếu file tồn tại.
