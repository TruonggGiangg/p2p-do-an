# Agent Change Rules (Memory Service)

Mục tiêu: giúp agent/dev **tự biết khi nào phải cập nhật tài liệu** khi code thay đổi.

## 1) Quy tắc bắt buộc theo loại thay đổi

### A. Thay đổi API/contract (`memory-service/src/server.js`)
Phải cập nhật ít nhất 1 trong các file:
- `memory-service/README.md`
- `memory-service/IMPLEMENTATION_BLUEPRINT.vi.md`

Ví dụ cần update doc:
- endpoint mới (`/agent/answer`)
- request/response schema thay đổi
- auth header/secret rule thay đổi

### B. Thay đổi retrieval/ranking (`memory-service/src/retrieval.js`, `memory-service/src/answerer.js`)
Phải cập nhật ít nhất 1 trong:
- `memory-service/README.md`
- `memory-service/IMPLEMENTATION_BLUEPRINT.vi.md`

Ví dụ:
- đổi mode detection, weights, rerank logic
- thêm query rewrite song ngữ
- đổi anti-hallucination behavior

### C. Thay đổi config/env (`memory-service/src/config.js`, `.env.example`, `docker-compose.memory.yml`)
Phải cập nhật:
- `memory-service/README.md` (bắt buộc)

### D. Thay đổi ingest/indexing schema (`memory-service/src/indexer.js`, `memory-service/src/neo4j.js`, `memory-service/src/vectorStore.js`)
Phải cập nhật ít nhất 1 trong:
- `memory-service/README.md`
- `memory-service/IMPLEMENTATION_BLUEPRINT.vi.md`

## 2) Định nghĩa “doc update hợp lệ”

Một thay đổi doc được coi là hợp lệ khi:
- Có cập nhật mô tả hành vi mới (không chỉ sửa chính tả), và
- Có ít nhất 1 ví dụ request/response hoặc lệnh chạy tương ứng với behavior mới.

## 3) Rule kiểm soát trong CI/dev

Dùng script:
- `memory-service/scripts/check-doc-rules.ps1`

Script đọc file thay đổi git và kiểm tra theo rule ở trên.

- Chế độ cảnh báo: in warning, không fail build
- Chế độ enforce: fail build nếu vi phạm

## 4) Checklist nhanh trước khi merge

- API thay đổi? -> đã cập nhật README endpoint chưa
- Retrieval thay đổi? -> đã mô tả mode/weights/rule mới chưa
- Config/env thay đổi? -> đã cập nhật `.env.example` và README chưa
## 5) Quy tắc cho Agent (Tự động sử dụng Memory Service)

Để đảm bảo câu trả lời có độ chính xác cao về nghiệp vụ P2P, Agent phải tuân thủ:

- **Trigger**: Khi người dùng hỏi về logic nghiệp vụ phức tạp (ví dụ: luồng giải ngân, tính toán lãi suất, quy trình Approve loan, Escrow, etc.)
- **Action**: Agent phải tự động thực hiện gọi API Memory Service:
  - **Endpoint (Context)**: `POST http://localhost:5055/agent/context`
  - **Endpoint (Answer)**: `POST http://localhost:5055/agent/answer` (Dùng khi cần giải thích sâu)
  - **Payload**: `{"question": "câu hỏi của người dùng", "limit": 8}`
- **Constraint (TMP-First)**: 
  - Khi sử dụng `/agent/answer`, Agent **PHẢI** đọc nội dung phản hồi từ `tmpFilePath` được trả về trong JSON (thường nằm ở `.../p2p-memory-service/agent-answers/*.txt`).
  - Tuyệt đối không dựa vào output CLI bị cắt cụt (truncated) để đảm bảo không mất mát context kỹ thuật quan trọng.
- **Constraint (Context)**: Sử dụng dữ liệu `contextText` trả về từ `/agent/context` để bổ trợ cho câu trả lời, thay vì chỉ dựa vào dữ liệu tĩnh trong code hiện tại.

*Lưu ý: Nếu Memory Service offline (lỗi connection), Agent vẫn trả lời nhưng phải thông báo rằng đang sử dụng dữ liệu offline.*
