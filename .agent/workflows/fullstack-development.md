---
description: Giao Thức Hoạt Động (Fullstack Developer Mode) - Tối ưu hóa Hiệu Năng và Hiệu Suất
---

# Fullstack Development Workflow (Free-Tier Only)

Workflow này mô tả cách phối hợp các AI tools miễn phí để phát triển ứng dụng P2P một cách hiệu quả.

## 🎯 Nguyên tắc Core

| Tool | Vai trò | Chi phí |
|------|---------|---------|
| **Gemini CLI** | Đọc code, debug, explore |  FREE (OAuth Google) |
| **Antigravity (IDE Agent)** | Viết code, implementation |  FREE |
| **Aider** | Refactor lớn, rename |  FREE (local) |
| **Git** | Version control |  FREE |

## ⚡ Quy tắc vàng

```
❌ Không dùng GEMINI_API_KEY
❌ Không bật Google Cloud billing
❌ Không dùng OpenAI API
 Gemini CLI = OAuth Google account
 Developer = final decision-maker
```

## 📋 Phân chia công việc

### 1. Gemini CLI - "Sub-Agent" Đọc Code

**Chỉ dùng để:**
- Explore codebase
- Debug issues
- Trace data flow
- Tìm file/enum/type

**Ví dụ prompts:**
```bash
# Sub-agent 1: Code Explorer
gemini "In src/, list all enums related to Loan. Return file paths only."

# Sub-agent 2: Debugger
gemini "Debug: Loan status mismatch. Check enum, mapper, UI. Return facts only."

# Sub-agent 3: Data Flow Tracer
gemini "Trace data flow of loanStatus from API to UI. Return step-by-step."
```

### 2. Antigravity (IDE Agent) - Viết Code

**Chỉ giao task sau khi có facts từ Gemini CLI:**

```
Facts:
- enum values confirmed: [list]
- mapping file: [path]
- current behavior: [description]

Task:
- update UI label at [file:line]
- do not change enum
```

**❌ KHÔNG cho Antigravity:**
- Explore project
- Search enum
- Đọc nghiệp vụ

### 3. Aider - Refactor Lớn

**Khi nào dùng:**
- Rename field across many files
- Apply rule hàng loạt
- Refactor architecture

```bash
# Chỉ add file cần sửa
aider src/loan/loan.service.ts src/loan/loan.controller.ts
```

## 🚀 Workflow Mẫu

```
1. [Gemini CLI] Explore → Facts
2. [IDE Agent] Implement → Code
3. [Git] Commit → History
4. [Aider] Refactor (if needed)
```

##  Checklist Trước Mỗi Buổi

// turbo-all
- [ ] `gemini login` (OAuth, không API key)
- [ ] Không set `GEMINI_API_KEY` trong env
- [ ] Không bật Google Cloud billing
- [ ] IDE agent chỉ viết code
- [ ] Gemini CLI chỉ đọc
