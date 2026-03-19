---
description: Sử dụng Gemini CLI để debug và khám phá codebase (tiết kiệm token cho IDE Agent)
---

# Gemini CLI Debug Workflow

Workflow này hướng dẫn cách tận dụng **Gemini CLI** để debug, khám phá codebase, và tiết kiệm token cho IDE Agent.

## 🎯 Mục đích

- Gemini CLI = **Sub-agent đọc code** (FREE via OAuth)
- IDE Agent = **Chỉ viết code** khi đã có facts
- Kết quả: Token thấp, ít bug, developer kiểm soát

## 📋 Các loại Sub-Agent

### 1️⃣ Code Explorer
```bash
gemini "In [đường dẫn], find [tên type/function]. Return file paths only."
```

**Ví dụ:**
```bash
gemini "In client_app/src/types, find LoanStatus enum. Return file path and values."
gemini "In server_do_an/src, list all services. Return file paths only."
```

### 2️⃣ Debugger
```bash
gemini "Debug: [mô tả vấn đề]. Check: 1) [điểm kiểm tra]. Return facts only."
```

**Ví dụ:**
```bash
gemini "Debug: LoanListScreen shows 'personal' instead of Vietnamese. Check: 1) LOAN_WILLINGS values. 2) Label mapping. Return facts."
```

### 3️⃣ Data Flow Tracer
```bash
gemini "Trace data flow: [field] from [source] to [destination]. Return step-by-step."
```

**Ví dụ:**
```bash
gemini "Trace data flow: loanStatus from Fineract API to LoanListScreen UI. Return step-by-step."
```

### 4️⃣ Diff Analyzer
```bash
gemini "Compare [file1] and [file2]. What are the key differences?"
```

### 5️⃣ Impact Analyzer
```bash
gemini "If I change [field/function], which files will be affected? List file paths."
```

## ⚡ Quick Alias (PowerShell)

```powershell
Set-Alias g gemini
```

Sau đó:
```bash
g "Find LoanStatus enum in src/"
```

## 🔄 Workflow Pattern

```
┌─────────────────┐     Facts      ┌─────────────────┐
│   Gemini CLI    │ ─────────────► │   IDE Agent     │
│   (Read Only)   │                │   (Write Only)  │
└─────────────────┘                └─────────────────┘
         │                                  │
         │ Explore                          │ Implement
         ▼                                  ▼
    ┌─────────┐                        ┌─────────┐
    │ Context │                        │  Code   │
    └─────────┘                        └─────────┘
```

##  Best Practices

// turbo-all
1. **Hỏi cụ thể**: "Return only..." / "List file paths only"
2. **Giới hạn scope**: Chỉ định thư mục cụ thể
3. **Yêu cầu format**: "Return facts", "Step-by-step"
4. **Chờ kết quả**: Gemini CLI cần thời gian read files

## ❌ KHÔNG dùng Gemini CLI khi

- Cần edit file ngay lập tức → Dùng IDE Agent
- Đã biết chính xác cần làm gì → Dùng IDE Agent
- Task đơn giản (1-2 bước) → Dùng IDE Agent

## 🔐 Security Check

```bash
# Kiểm tra auth
gemini whoami

# Đảm bảo KHÔNG có API key
echo $env:GEMINI_API_KEY  # Phải là empty
```
