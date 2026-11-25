# Báo Cáo Thay Đổi Session — Agentic SOC Platform

> Theo Rule 13: Ghi lại các chức năng đã làm và vị trí hàm đã chỉnh sửa sau khi hoàn thành.

---

## Session hiện tại: Phân tích Agentic/RAG/LLM + Dashboard UI

### 1. Files Mới Được Tạo

| File | Mô Tả |
|---|---|
| `README_BAO_CAO_HE_THONG.md` | Báo cáo 3 chương đầy đủ: Cơ sở lý thuyết, Phân tích thiết kế, Triển khai |
| `README_VN.md` | Tóm tắt hệ thống bằng tiếng Việt |
| `BAO_CAO_TINH_GON_DASHBOARD.md` | Phân tích và hướng dẫn tái thiết kế Dashboard UI |
| `PHAN_TICH_AGENTIC_RAG_LLM.md` | Phân tích chuyên sâu 6 câu hỏi: Agentic/RAG/LLM/CLI/Stack |
| `BAO_CAO_THAY_DOI_SESSION.md` | File này |

### 2. Files Đã Chỉnh Sửa

#### `frontend/src/pages/Dashboard.tsx`

**Vị trí thay đổi:** Toàn bộ file được cấu trúc lại

| Thay Đổi | Mô Tả |
|---|---|
| Event Stream lên top | Di chuyển Wazuh Event Stream từ dưới lên trên cùng màn hình |
| Tabs gom deep-dive | Cases/Alerts/Jobs gom vào 1 Tabs component thay vì hiển thị riêng lẻ |
| Hero compact | Phần stat summary (Cases/Alerts/Jobs count) gom thành 1 row |
| Stats cards | Hiển thị compact 4-column grid |

#### `frontend/src/pages/Dashboard.css`

**Vị trí thay đổi:** Toàn bộ CSS redesign

| Thay Đổi | Mô Tả |
|---|---|
| `.dashboard-compact-hero` | Hero section gọn hơn, giảm padding |
| `.event-stream-top` | Stream section luôn visible không cần scroll |
| `.dashboard-tabs` | Styling cho tabs deep-dive section |

#### `README.md`

**Vị trí thay đổi:** Phần đầu file

| Thay Đổi | Mô Tả |
|---|---|
| Badge tiếng Việt | Thêm link đến `README_VN.md` và `README_BAO_CAO_HE_THONG.md` |

---

## 3. Các Hàm/Module Đã Phân Tích (Không Chỉnh Sửa)

| File | Module/Hàm | Mô Tả |
|---|---|---|
| `backend/integrations/llm/llmapi.py` | `LLMAPI.get_llm()` | LLM provider wrapper — LangChain ChatOpenAI |
| `backend/apps/agentic/analysis/knowledge.py` | `build_knowledge_context()`, `extract_knowledge_keywords()`, `search_knowledge_records()` | RAG pipeline — PostgreSQL keyword search |
| `backend/apps/agentic/analysis/prompts.py` | `invoke_structured_llm()` | Structured output LLM call |
| `backend/apps/agentic/analysis/analysis.py` | `CaseAnalysisRunner.run()`, `run_case_analysis()` | Main investigation pipeline |
| `backend/apps/agentic/analysis/schemas.py` | `InvestigationReport`, `AnalysisRecord` | Pydantic output schemas |
| `backend/apps/agentic/runtime/monitor.py` | `run_case_analysis_once()`, `run_playbook_once()` | Job queue polling worker |
| `backend/apps/agentic/models.py` | `CaseAnalysisJob`, `AgenticJobStatus` | Django ORM models cho job queue |
| `backend/data/playbooks/investigation/System_en.md` | System Prompt toàn bộ (156 dòng) | Investigation Agent system prompt |
| `cli/src/asp_cli/main.py` | Toàn bộ CLI (1478 dòng, 15+ command groups) | ASP CLI v0.6.0 |

---

## 4. Phát Hiện Quan Trọng

| Phát Hiện | Chi Tiết |
|---|---|
| **RAG không dùng vector DB** | Dùng PostgreSQL `icontains` keyword search — đơn giản nhưng đủ dùng |
| **LLM không lock model** | Hỗ trợ GPT-4o, Gemini, DeepSeek, Ollama qua `base_url` config |
| **CLI đã có đầy đủ** | `asp` CLI v0.6.0 với case/alert/playbook/knowledge/siem/ti/cmdb commands |
| **Job queue poll-based** | Worker polling DB 10-30s, không phải event-driven |
| **Structured Output** | LangChain `.with_structured_output(InvestigationReport)` đảm bảo output luôn hợp lệ |
| **System Prompt cực kỳ chi tiết** | 156 dòng, 5-step reasoning, 8 strict principles, field-level output guidance |

---

## 5. Gaps Cần Cải Thiện (Priority Order)

| Priority | Gap | Action |
|---|---|---|
| 🔴 P0 | Không có Agent Monitor UI | Tạo page `/agent-monitor` với job queue view |
| 🔴 P0 | Không có Analyst Feedback | Thêm `AnalystFeedback` model + UI button |
| 🟡 P1 | Confidence là string, không phải số | Đổi thành `confidence_score: float` |
| 🟡 P1 | Không có Escalation logic | Post-analysis hook nếu LOW confidence + CRITICAL severity |
| 🟢 P2 | CLI thiếu `asp agent` subcommand | Thêm `asp agent jobs`, `asp agent jobs --tail` |
| 🟢 P2 | TUI Mode chưa có | Thêm `asp tui` với Textual library |
