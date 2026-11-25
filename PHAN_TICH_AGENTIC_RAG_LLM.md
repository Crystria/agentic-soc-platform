# Phân Tích Chuyên Sâu: Agentic / RAG / LLM trong Agentic SOC Platform

> Báo cáo phân tích source code thực tế · Cập nhật: 2026-11-22

---

## Câu 1 — Cơ Chế Tạo Agentic, RAG, LLM Trong Hệ Thống

### 1.1 Kiến Trúc Tổng Quát

```
Wazuh Alert (JSON)
      │
      ▼
[webhook/wazuh] → normalize → Alert model (PostgreSQL)
      │
      ▼
[Correlation Engine] → SHA-256 dedup (24h window) → Case model
      │
      ▼
CaseAnalysisJob (status=PENDING, scheduled_at=now)
      │
      ▼  [Worker polling loop — monitor.py]
[run_case_analysis_once()]
      │
      ├─ serialize_case_for_investigation(case)   → case_payload (dict)
      │
      ├─ build_knowledge_context(case_payload)    ← [RAG LAYER]
      │       │
      │       ├─ extract_knowledge_keywords()     ← LLM fast call
      │       └─ search_knowledge_records()       ← PostgreSQL icontains
      │
      ├─ invoke_structured_llm(                   ← [LLM LAYER]
      │       prompt_id=INVESTIGATION_SYSTEM_PROMPT,
      │       payload={case, knowledge},
      │       output_schema=InvestigationReport   ← [Pydantic Schema]
      │   )
      │
      └─ save_case_analysis_record()             → DB lưu kết quả
```

### 1.2 LLM Layer — `llmapi.py`

Hệ thống **không lock vào một model cụ thể**. Dùng LangChain `ChatOpenAI` tương thích với bất kỳ OpenAI-compatible API:

```python
# backend/integrations/llm/llmapi.py
class LLMAPI:
    def get_llm(self, tags: list[str]) -> ChatOpenAI:
        return ChatOpenAI(
            api_key=settings.LLM_API_KEY,
            base_url=settings.LLM_BASE_URL,   # có thể là GPT-4o, Gemini, Ollama, DeepSeek
            model=settings.LLM_MODEL,
            tags=tags,
        )
```

| Tag | Model Role | Dùng Cho |
|---|---|---|
| `structured_output` | LLM chính (GPT-4o / Gemini) | Investigation Agent |
| `fast` | LLM nhẹ hơn | Keyword extraction cho RAG |

Bật Structured Output bằng LangChain `.with_structured_output()`:

```python
# prompts.py
def invoke_structured_llm(prompt_id, payload, output_schema):
    llm = LLMAPI().get_llm(tags=["structured_output"])
    chain = prompt | llm.with_structured_output(output_schema)
    return chain.invoke({"payload": json.dumps(payload)})
```

> **Kết quả**: Output luôn là Pydantic object hợp lệ, không cần parse thủ công.

### 1.3 RAG Layer — `knowledge.py`

**Không dùng Vector DB.** Dùng PostgreSQL inverted-index keyword search:

```python
# knowledge.py — 2 bước
def build_knowledge_context(case_payload) -> KnowledgeContext:
    # Bước 1: LLM fast → trích keywords từ case
    keywords = extract_knowledge_keywords(case_payload)
    # Bước 2: PostgreSQL icontains → tìm knowledge records khớp
    records = search_knowledge_records(keywords)
    return KnowledgeContext(keywords=keywords, records=records)
```

**Cách RAG inject vào prompt:**
```json
{
  "knowledge": [
    {
      "title": "SSH Brute Force Detection",
      "body": "Recommended remediation: block source IP...",
      "tags": ["ssh", "brute-force"]
    }
  ],
  "case": { ... },
  "discussions": [ ... ]
}
```

**Nguồn dữ liệu RAG:** Lấy từ **Knowledge Base của hệ thống** — không cần train lại model. Analyst có thể thêm/sửa knowledge records qua UI hoặc `asp knowledge` CLI command.

### 1.4 Agentic Schema — `schemas.py`

`InvestigationReport` là output chính của LLM Agent:

```python
class InvestigationReport(BaseModel):
    verdict: str              # TRUE_POSITIVE / FALSE_POSITIVE / UNDETERMINED
    severity: str             # CRITICAL / HIGH / MEDIUM / LOW / INFORMATIONAL
    impact: str               # Mô tả tác động
    priority: str             # HIGH / MEDIUM / LOW
    confidence: str           # HIGH / MEDIUM / LOW
    digest: str               # Tóm tắt 4-6 câu dạng prose
    affected_assets: list[AffectedAsset]        # max 5
    evidence_findings: list[EvidenceFinding]    # max 5
    attack_chain: list[AttackChainStep]         # MITRE ATT&CK — max 6
    attack_timeline: list[TimelineEvent]        # max 8
    ioc_indicators: list[IndicatorOfCompromise] # max 10
    remediations: list[Remediation]             # max 6
    unknowns: list[str]                         # Gaps — max 5
```

### 1.5 System Prompt — `System_en.md`

System Prompt cực kỳ chi tiết (~156 dòng), định nghĩa:
- **Role**: "Senior SOC/DFIR Analyst" với 15+ năm kinh nghiệm
- **5 bước suy luận tuần tự**: Context Review → Evidence Analysis → Threat Classification → Chain/Timeline → Final Report
- **8 nguyên tắc nghiêm ngặt**: Không fabricate dữ liệu, prefer restrained verdict khi thiếu thông tin, dedup tất cả lists
- **Field-level requirements**: Mỗi field trong `InvestigationReport` có hướng dẫn riêng

> **Kết luận Q1**: Hệ thống dùng pattern **RAG → Prompt Engineering → Structured LLM** thay vì fine-tuning hay custom training. Không cần train dataset — chỉ cần cấu hình LLM provider và bổ sung knowledge base.

---

## Câu 2 — Giao Diện Quản Lý Agent

### 2.1 Hiện Tại Có Gì

| Component | Vị Trí | Chức Năng |
|---|---|---|
| Cases UI | `frontend/src/pages/Cases.tsx` | Xem Case + xem AI report kết quả |
| Playbook UI | `frontend/src/pages/Playbooks.tsx` | Trigger playbook thủ công |
| LLM Settings | `frontend/src/pages/Settings.tsx` | Cấu hình API Key, Model, Base URL |
| Knowledge Base | `frontend/src/pages/Knowledge.tsx` | Thêm/sửa RAG knowledge records |
| **CLI** | `cli/src/asp_cli/main.py` | `asp case`, `asp playbook run`, `asp knowledge`, `asp dev stream` |

### 2.2 Những Gì Còn Thiếu

| Tính Năng Thiếu | Mô Tả | Priority |
|---|---|---|
| **Agent Job Monitor** | Xem queue `CaseAnalysisJob` (PENDING/RUNNING/FAILED) | 🔴 High |
| **Prompt Debug View** | Xem prompt thực tế gửi đến LLM | 🟡 Medium |
| **LLM Response Inspector** | Xem raw JSON output từ LLM | 🟡 Medium |
| **Analyst Feedback Loop** | Analyst confirm/reject AI verdict → fine-tuning data | 🟡 Medium |
| **Model A/B Testing** | So sánh 2 model trên cùng case | 🟢 Low |
| **Cost Tracking** | Token usage và chi phí per model | 🟢 Low |

### 2.3 Đề Xuất Agent Monitor Page

```
/agent-monitor
├─ Job Queue (CaseAnalysisJob)
│   ├─ PENDING queue (count)
│   ├─ RUNNING (current job + elapsed time)
│   └─ History (SUCCESS/FAILED + error log)
│
├─ Knowledge RAG Stats
│   ├─ Total knowledge records
│   ├─ Top keywords retrieved
│   └─ Cache hit rate
│
└─ LLM Stats
    ├─ Token usage (input/output)
    ├─ Latency (avg/p95)
    └─ Error rate
```

---

## Câu 3 — Hệ Thống Giám Sát Sử Dụng AI

### 3.1 AI-Assisted Decision Making — Đánh Giá Hiện Tại

**✅ Đã hoạt động tốt:**

| Quyết Định | Trả Lời Bởi AI | Confidence |
|---|---|---|
| Verdict (TRUE/FALSE positive) | ✅ `verdict` field | Có `confidence` field |
| Severity classification | ✅ CRITICAL/HIGH/MEDIUM/LOW | Theo 8 nguyên tắc nghiêm ngặt |
| MITRE ATT&CK mapping | ✅ `attack_chain[].attack_stage` | Evidence-based |
| Impact assessment | ✅ `impact` prose | Linked to affected assets |
| IOC extraction | ✅ `ioc_indicators` | Type + value + context |
| Remediation steps | ✅ `remediations` với priority | Actionable, không vague |
| Affected assets | ✅ Hostname/IP/Username | Max 5 entries |
| Attack timeline | ✅ Chronological events | Traceable evidence fields |
| Unknowns/Gaps | ✅ `unknowns` field | Explicit uncertainty |
| Priority scoring | ✅ `priority` field | HIGH/MEDIUM/LOW |

**❌ Chưa có:**

| Gap | Vấn Đề | Hậu Quả |
|---|---|---|
| **Explainability UI** | Analyst không thấy "AI đưa ra kết luận vì lý do gì" | Giảm trust |
| **Human feedback loop** | Không có cơ chế analyst confirm/reject | Không improve theo thời gian |
| **Confidence calibration** | `confidence` chỉ là string, không có số 0-100% | Khó ra quyết định |
| **Multi-step reasoning trace** | Không lưu chain-of-thought | Debug khi sai khó |
| **Alert fatigue tracking** | Không biết AI đã false positive bao nhiêu lần | Không có metrics |
| **Escalation rules** | Nếu AI confidence LOW → không tự động escalate | Manual intervention |

### 3.2 Worker Polling Mechanism — `monitor.py`

```python
# monitor.py — polling loop thực tế
def run_case_analysis_once():
    job = CaseAnalysisJob.objects.filter(
        status=AgenticJobStatus.PENDING,
        scheduled_at__lte=timezone.now()
    ).order_by("scheduled_at", "created_at").first()

    if job is None:
        return False   # → Worker sleep rồi poll lại

    running_job = start_case_analysis_job(job)   # status = RUNNING
    try:
        result = run_case_analysis(case=running_job.case, ...)
        complete_case_analysis_job(running_job, result.analysis_record)  # status = SUCCESS
    except Exception as exc:
        fail_case_analysis_job(running_job, str(exc))                    # status = FAILED
    return True
```

**Mô hình**: Job queue poll-based (không phải event-driven WebSocket). Worker chạy vòng lặp 10-30s poll DB.

---

## Câu 4 — Phân Tích Ưu/Nhược: React.js + Python Stack

### 4.1 Frontend — React 19 + TypeScript + Ant Design

| | Phân Tích |
|---|---|
| **✅ Ưu điểm** | TypeScript strict mode → type-safe; Ant Design bộ UI hoàn chỉnh cho dashboard; Vite build fast (< 1s HMR); React 19 Server Components ready |
| **⚠️ Nhược điểm** | Bundle size lớn (Ant Design ~2MB gzip); React 19 còn mới → một số packages chưa tương thích; pnpm workspace setup phức tạp cho team mới |
| **🔑 Risk** | `@ant-design/charts` phụ thuộc G2 Plot — có thể conflict version với React 19 |

### 4.2 Backend — Python + Django + LangChain

| | Phân Tích |
|---|---|
| **✅ Ưu điểm** | LangChain ecosystem đầy đủ (OpenAI/Gemini/Ollama); Django ORM mạnh, migration tự động; Pydantic type-safe output parsing; Redis Streams native support |
| **⚠️ Nhược điểm** | Python GIL → dùng Gunicorn multi-process workers để bypass; Django startup chậm hơn FastAPI ~200ms; LangChain API thay đổi thường xuyên (breaking changes) |
| **🔑 Risk** | `langchain-openai` version lock — upgrade LangChain có thể break `.with_structured_output()` |

### 4.3 So Sánh Stack vs Alternatives

| Tiêu Chí | React + Python (hiện tại) | Vue + Go | Next.js + FastAPI |
|---|---|---|---|
| AI/LLM ecosystem | ⭐⭐⭐⭐⭐ | ⭐⭐ | ⭐⭐⭐⭐ |
| Performance | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ |
| Learning curve | ⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐ |
| Community/Docs | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐ |
| SOC tooling fit | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐ |

**Nhận xét**: Stack React + Python là lựa chọn tối ưu cho SOC platform AI — không nên đổi stack.

---

## Câu 5 — Triển Khai Text Mode / CLI

### 5.1 ASP CLI Đã Có Sẵn! (v0.6.0)

```
📦 cli/src/asp_cli/main.py  (1478 dòng)
```

CLI được xây dựng bằng:
- **Typer** — argument parsing (giống Click nhưng type-annotated)
- **Rich** — colored output, tables
- **httpx** — async HTTP client
- **JMESPath** — query JSON output

**Các lệnh đã có:**
```bash
asp auth login --api-url https://localhost:8443 --api-key asp_xxx
asp auth status

asp case list [--output json] [--query "results[*].case_id"]
asp case show <id>
asp case update <id> --status CLOSED

asp alert list
asp alert show <id>

asp knowledge list
asp knowledge search "ssh brute force"

asp playbook list
asp playbook run <name> --case-id <id>

asp siem search --query "..."
asp ti lookup --ioc 192.168.1.1

asp dev stream list     # Xem Redis Streams
asp dev stream read <stream>
```

### 5.2 Roadmap: Text Mode → Web

```
Phase 0 (ĐÃ CÓ): CLI cơ bản
  asp case list / show / update
  asp alert list / show
  asp playbook run

Phase 1 (Có thể thêm ngay):
  asp case analyze <id>          → trigger AI analysis
  asp agent jobs                 → xem job queue
  asp agent jobs --tail          → real-time follow job status
  asp knowledge add --file kb.md → import knowledge records

Phase 2 (TUI Mode với Textual):
  asp tui                        → Full terminal dashboard
  - Panels: Cases | Alerts | Jobs | Knowledge
  - Real-time update qua SSE/polling
  - Keyboard navigation

Phase 3 (Web UI — hiện tại):
  Đã có https://localhost:8443
```

### 5.3 Recommendation

> Nếu muốn triển khai text mode trước:
> - **Môi trường không có browser**: dùng `asp` CLI hiện tại
> - **Terminal dashboard đẹp hơn**: thêm `asp tui` với thư viện [Textual](https://textual.textualize.io/)
> - **Automation/scripting**: `asp case list --output json | jq '.results[].case_id'`

---

## Câu 6 — AI-Assisted Decision Making Đã Đủ Chưa?

### 6.1 Scorecard

| Tiêu Chí | Trạng Thái | Chi Tiết |
|---|---|---|
| Phân loại mối đe dọa | ✅ 100% | verdict + severity + confidence |
| Truy vết tấn công | ✅ 95% | attack_chain (MITRE) + attack_timeline |
| Nhận diện IOC | ✅ 90% | ioc_indicators với context |
| Khuyến nghị xử lý | ✅ 90% | remediations có priority + action_type |
| Nhận diện tài sản bị ảnh hưởng | ✅ 85% | affected_assets |
| Giải thích bằng chứng | ✅ 85% | evidence_findings |
| Nhận diện điểm mù | ✅ 80% | unknowns field |
| **Giải thích lý do quyết định** | ❌ 20% | Chỉ có digest text, không có CoT trace |
| **Vòng phản hồi từ analyst** | ❌ 0% | Không có feedback mechanism |
| **Tự cải thiện theo thời gian** | ❌ 0% | Không có reinforcement learning |
| **Confidence số (0-100%)** | ❌ 0% | Chỉ HIGH/MEDIUM/LOW string |

### 6.2 Gap Analysis và Đề Xuất

**Gap 1: Không có Explainability**
- *Vấn đề*: Analyst không biết tại sao AI chọn verdict "TRUE_POSITIVE"
- *Fix*: Thêm field `reasoning_chain: list[str]` vào `InvestigationReport` — LLM liệt kê từng bước suy luận

**Gap 2: Không có Feedback Loop**
- *Vấn đề*: Analyst xử lý xong case nhưng AI không học từ quyết định đó
- *Fix*: Thêm `AnalystFeedback` model — khi analyst đóng case, ghi lại verdict cuối cùng vs. AI verdict → export training data

**Gap 3: Confidence chỉ là String**
- *Vấn đề*: Không phân biệt được confidence 60% vs 90% (cả hai đều là "HIGH")
- *Fix*: Đổi thành `confidence_score: float` (0.0 → 1.0) + `confidence_level: str`

**Gap 4: Không có Escalation Logic**
- *Vấn đề*: Nếu AI confidence LOW + severity CRITICAL → không tự động alert analyst on-call
- *Fix*: Post-analysis hook kiểm tra điều kiện → send notification

---

## Tổng Kết

| Câu Hỏi | Trả Lời Ngắn |
|---|---|
| **Cơ chế Agentic/RAG/LLM** | RAG = PostgreSQL keyword search; LLM = LangChain ChatOpenAI; Agent = Job queue polling |
| **Giao diện quản lý Agent** | Chưa có dedicated page — cần thêm Agent Monitor |
| **AI Decision Making** | Đủ cho triage (verdict/severity/MITRE/IOC/remediation) nhưng thiếu explainability + feedback |
| **React + Python stack** | Tối ưu cho AI SOC platform — không cần đổi stack |
| **Text Mode / CLI** | ✅ ĐÃ CÓ — `asp` CLI v0.6.0 với 15+ command groups |
| **AI đã trả lời đủ chưa** | 85% tốt, thiếu: CoT trace, feedback loop, numeric confidence, escalation |
