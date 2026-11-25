# Đánh Giá Hiện Trạng & Kế Hoạch Tích Hợp — Agentic SOC Platform

> **Ngày lập:** 2026-11-25  
> **Trạng thái Git:** Đã kiểm tra và chạy `git pull --ff-only origin master` → `Already up to date.` tại commit `d224cd1` (bao gồm toàn bộ mã nguồn mới nhất từ `funnywolf/agentic-soc-platform` v0.6.0 ở `2da9bb3` cộng thêm các commit tích hợp Wazuh/Splunk/Kibana và sửa lỗi `d224cd1`).

---

## 1. Trạng Thái Pull Code Mới Nhất Từ `master`

| Hạng mục | Kết quả kiểm tra thực tế |
|---|---|
| **Branch hiện tại** | `master` |
| **Remote `origin`** | `https://github.com/Crystria/agentic-soc-platform` — `HEAD` tại `d224cd1` (`0` commit ahead / `0` commit behind) |
| **Upstream gốc (`funnywolf/agentic-soc-platform`)** | `master` đang ở `2da9bb3` (`chore(release): prepare v0.6.0`), đã nằm trong lịch sử của `d224cd1` |
| **Lệnh `git pull --ff-only origin master`** | `Already up to date.` |
| **Thay đổi cục bộ chưa commit (được giữ nguyên)** | `README.md`, `frontend/src/pages/Dashboard.tsx`, `frontend/src/pages/Dashboard.css` và các file báo cáo `.md` |

---

## 2. Cơ Chế Tạo Agentic, RAG, LLM Trong Dự Án

### 2.1. LLM Layer — Tách biệt Provider qua OpenAI-Compatible Interface
- **File:** [`backend/integrations/llm/llmapi.py`](file:///d:/Project/SOC%20platform/agentic-soc-platform/backend/integrations/llm/llmapi.py#L22-L53)
- Class `LLMAPI` đọc danh sách cấu hình động từ Database (`get_llm_configs()`), khởi tạo `langchain_openai.ChatOpenAI` với `base_url`, `api_key`, `model`, `proxy` (hỗ trợ OpenAI, Gemini, DeepSeek, Ollama hoặc gateway nội bộ).
- Chọn model theo **tag** (`select_config(tag=...)`): trong UI [`LLMProviderSettings.tsx`](file:///d:/Project/SOC%20platform/agentic-soc-platform/frontend/src/pages/LLMProviderSettings.tsx#L41) có 4 tag chuẩn: `fast`, `powerful`, `tool_calling`, `structured_output`.

### 2.2. RAG Layer — Hybrid Keyword Search trên PostgreSQL (Không dùng Vector DB)
- **File:** [`backend/apps/agentic/analysis/knowledge.py`](file:///d:/Project/SOC%20platform/agentic-soc-platform/backend/apps/agentic/analysis/knowledge.py#L72-L177)
- **Bước 1 (`extract_knowledge_keywords`):** Gọi LLM qua `invoke_structured_llm(..., output_schema=KnowledgeSearchKeywords)` để trích xuất tối đa `8` từ khóa tìm kiếm từ Case; có hàm `fallback_knowledge_keywords()` dự phòng nếu LLM lỗi.
- **Bước 2 (`search_knowledge_records`):** Truy vấn bảng `Knowledge` trên PostgreSQL bằng `icontains` (trên `title`, `body`) và `tags__contains`, lọc theo hạn sử dụng (`expires_at`), lấy tối đa `10` bản ghi mới nhất.
- **Tự động học từ Case đã đóng (`extract_knowledge_from_case`):** Khi Case đã có `verdict`, hệ thống dùng prompt `KNOWLEDGE_EXTRACTION_PROMPT` để rút kinh nghiệm và lưu thành bản ghi `Knowledge` (`source = KnowledgeSource.CASE`).

### 2.3. Agentic Layer — Job Queue + Structured Output Pipeline
- **File:** [`backend/apps/agentic/analysis/analysis.py`](file:///d:/Project/SOC%20platform/agentic-soc-platform/backend/apps/agentic/analysis/analysis.py#L43-L92), [`prompts.py`](file:///d:/Project/SOC%20platform/agentic-soc-platform/backend/apps/agentic/analysis/prompts.py#L54-L61), [`schemas.py`](file:///d:/Project/SOC%20platform/agentic-soc-platform/backend/apps/agentic/analysis/schemas.py#L40-L70), [`monitor.py`](file:///d:/Project/SOC%20platform/agentic-soc-platform/backend/apps/agentic/runtime/monitor.py#L18-L59).
- **Cơ chế vận hành:**
  1. Khi tạo/cập nhật Case hoặc kích hoạt playbook [`Investigation`](file:///d:/Project/SOC%20platform/agentic-soc-platform/backend/playbooks/investigation.py#L5-L22), hệ thống tạo `CaseAnalysisJob` (`Pending`) được bảo vệ chống trùng bằng `pg_advisory_xact_lock` ([`services/cases.py`](file:///d:/Project/SOC%20platform/agentic-soc-platform/backend/apps/agentic/services/cases.py#L24-L46)).
  2. Worker chạy nền gọi `run_case_analysis_once()` (poll theo chu kỳ) → `CaseAnalysisRunner.run()` tuần tự hóa Case (`AI_PROFILE_INVESTIGATION`), lấy ngữ cảnh RAG, nạp System Prompt [`System_en.md`](file:///d:/Project/SOC%20platform/agentic-soc-platform/backend/data/playbooks/investigation/System_en.md) (156 dòng, 5 bước phân tích + 8 nguyên tắc chống bịa dữ liệu) và ép kiểu đầu ra qua `.with_structured_output(InvestigationReport)`.
  3. Kết quả lưu vào 6 trường AI của `Case` (`verdict_ai`, `severity_ai`, `impact_ai`, `priority_ai`, `confidence_ai`, `investigation_report_ai_json`) và `CaseAnalysisJob.result_json`.
- **Mở rộng Agent ngoài & Playbook:** Cung cấp API chuẩn `/api/agent/v1/` ([`agent_api/urls.py`](file:///d:/Project/SOC%20platform/agentic-soc-platform/backend/apps/agent_api/urls.py)) và plugin loader cho `BasePlaybook` / `BaseModule` ([`runtime/base.py`](file:///d:/Project/SOC%20platform/agentic-soc-platform/backend/apps/agentic/runtime/base.py), [`runtime/loader.py`](file:///d:/Project/SOC%20platform/agentic-soc-platform/backend/apps/agentic/runtime/loader.py)).

---

## 3. Đánh Giá Mức Độ Đáp Ứng Yêu Cầu Hiện Tại

> **Kết luận ngắn gọn:** Dự án đã có nền tảng vững chắc (~70–75%), nhưng **CHƯA ĐỦ hoàn toàn** để đáp ứng trọn vẹn 4 nhóm yêu cầu nâng cao dưới đây.

| Yêu cầu | Mức độ hiện tại | Đã có trong codebase | Phần còn thiếu (Gap) |
|---|---|---|---|
| **1. Giao diện quản lý Agent** | **~50%** | Cấu hình LLM Provider ([`LLMProviderSettings.tsx`](file:///d:/Project/SOC%20platform/agentic-soc-platform/frontend/src/pages/LLMProviderSettings.tsx)), giám sát health của 3 loại worker ([`WorkersSettings.tsx`](file:///d:/Project/SOC%20platform/agentic-soc-platform/frontend/src/pages/WorkersSettings.tsx)), quản lý Playbooks & Custom scripts (`/playbooks`, `/custom`). | Chưa có màn hình quản trị **Agent Job Queue** (`CaseAnalysisJob`), xem/retry/hủy job lỗi, kiểm tra prompt/raw output, theo dõi token/latency theo từng model hoặc cấu hình prompt/agent profile trên UI. |
| **2. Hệ thống giám sát sử dụng AI** | **~80%** | Webhook Wazuh/Splunk/ELK + Redis Stream `WAZUH-ALERTS`, SHA-256 correlation 24h, tự động tạo Case & xếp lịch AI phân tích, Dashboard risk/MTTD/MTTA/MTTR ([`dashboard/views.py`](file:///d:/Project/SOC%20platform/agentic-soc-platform/backend/apps/dashboard/views.py)), bộ 15 kịch bản ground truth ([`scenarios_15_ground_truth.json`](file:///d:/Project/SOC%20platform/agentic-soc-platform/backend/benchmark/scenarios_15_ground_truth.json)). | Worker xử lý job vẫn theo cơ chế DB polling chứ chưa event-driven; thiếu cơ chế cảnh báo/escalation tự động khi gặp Case `Critical` có `confidence_ai = Low` hoặc khi Agent Worker fail liên tục. |
| **3. Textmode trước → Phát triển lên Web** | **~70%** | Đã có **`asp-cli` v0.6.0** ([`cli/src/asp_cli/main.py`](file:///d:/Project/SOC%20platform/agentic-soc-platform/cli/src/asp_cli/main.py)) dùng `typer`, `rich`, `httpx`, `jmespath` phủ gần hết API (`auth`, `case`, `alert`, `artifact`, `knowledge`, `playbook`, `siem`, `ti`, `cmdb`, `dev stream`); Backend REST tách rời hoàn toàn khỏi React Web UI. | Chưa có chế độ **TUI tương tác** (Terminal Dashboard bằng `textual` để xem live stream/case/report trên terminal); CLI thiếu nhóm lệnh `asp agent` (theo dõi queue `CaseAnalysisJob`, trigger & stream tiến độ phân tích AI). |
| **4. AI-assisted Decision-Making** | **~55%** | AI trả về đầy đủ `verdict_ai`, `severity_ai`, `impact_ai`, `priority_ai`, `confidence_ai`, `evidence_findings`, `attack_chain`, `remediations`, `unknowns` và hiển thị đẹp trên [`InvestigationReportView.tsx`](file:///d:/Project/SOC%20platform/agentic-soc-platform/frontend/src/components/InvestigationReportView.tsx). | **Thiếu vòng lặp ra quyết định khép kín:** (a) Các trường `*_ai` ở [`CaseBasicView.tsx`](file:///d:/Project/SOC%20platform/agentic-soc-platform/frontend/src/components/CaseBasicView.tsx#L153-L226) chỉ là read-only, chưa có nút **1-click Accept / Override AI Assessment**; (b) Chưa có nút **1-click Run Recommended Playbook** từ mục `remediations`; (c) Chức năng **AI Quality Evaluation (AI–Human Agreement)** trong [`08-ai-quality-evaluation.md`](file:///d:/Project/SOC%20platform/agentic-soc-platform/docs/specs/v0.6.0/08-ai-quality-evaluation.md) và **Bulk Triage / SLA** đang bị hoãn trong [`00-release-scope.md`](file:///d:/Project/SOC%20platform/agentic-soc-platform/docs/specs/v0.6.0/00-release-scope.md#L90-L95); (d) Chưa có `confidence_score` định lượng và cơ chế phê duyệt Human-in-the-Loop cho playbook rủi ro cao. |

---

## 4. Phân Tích Ưu & Nhược Điểm Của `funnywolf/agentic-soc-platform` (React.js + Python)

### 4.1. Stack Python (Django 6 + DRF + Channels + LangChain + Pydantic)
- **Ưu điểm:**
  - Hệ sinh thái AI/Security cực mạnh: LangChain + Pydantic `.with_structured_output()` đảm bảo JSON báo cáo luôn đúng schema; dễ tích hợp thêm SIEM/TI/EDR bằng Python SDK (`elasticsearch`, `splunk-sdk`, `pycti`).
  - Hỗ trợ mở rộng an toàn mà không sửa core thông qua `BasePlaybook`, `BaseModule` và `/api/agent/v1/`.
  - RAG trên PostgreSQL giúp triển khai on-prem đơn giản (1 Docker Compose stack: Postgres + Redis + S3), không phải vận hành thêm Vector DB.
- **Nhược điểm:**
  - **Single-turn Agent:** `CaseAnalysisRunner` hiện mới gọi LLM một lượt với ngữ cảnh có sẵn, chưa tự động chạy vòng lặp ReAct nhiều bước để truy vấn thêm SIEM/TI khi thiếu bằng chứng (`unknowns`).
  - **RAG chỉ khớp từ khóa (`icontains`):** Dễ bỏ sót tài liệu khi khác từ đồng nghĩa hoặc khác ngôn ngữ (Anh/Việt).
  - **Phiên bản môi trường cao:** [`backend/pyproject.toml`](file:///d:/Project/SOC%20platform/agentic-soc-platform/backend/pyproject.toml#L4-L8) yêu cầu `python >= 3.14` và `django >= 6.0.6`, dễ gặp trở ngại tương thích thư viện bên thứ ba nếu triển khai ngoài Docker chuẩn.
  - **Thiếu Observability cho LLM:** Chưa lưu token usage, chi phí, latency từng bước và trace để debug khi LLM suy luận sai.

### 4.2. Stack React.js (React 19 + TypeScript + Ant Design 6 + Vite 8 + Zustand)
- **Ưu điểm:**
  - TypeScript + Ant Design 6 cung cấp sẵn hệ thống bảng biểu, form, filter, layout chuẩn cho màn hình SOC nhiều dữ liệu; Vite cho tốc độ build/HMR nhanh.
  - Tách biệt hoàn toàn qua REST + WebSocket (`realtime.tsx`), cho phép phát triển song song CLI/TUI và Web trên cùng một Backend.
- **Nhược điểm:**
  - Bundle size nặng do Ant Design + `@ant-design/charts` + CodeMirror + Markdown Editor.
  - `react@^19.2.6`, `typescript~6.0.2`, `vite@^8.1.3` ([`frontend/package.json`](file:///d:/Project/SOC%20platform/agentic-soc-platform/frontend/package.json#L28-L45)) là các phiên bản rất mới, có thể gặp xung đột nhỏ với một số thư viện UI cộng đồng.
  - Thiếu luồng tương tác Human-in-the-Loop (duyệt đề xuất AI, chạy playbook trực tiếp từ kết quả điều tra, quản lý hàng đợi Agent).

---

## 5. Kế Hoạch Tích Hợp & Nâng Cấp Theo Lộ Trình (4 Phases)

### Phase 1 — Hoàn thiện AI-Assisted Decision-Making & Human-in-the-Loop (Ưu tiên P0)
1. **Backend (`apps/cases` & `apps/agentic`):**
   - Thêm endpoint `POST /api/cases/<case_id>/apply-ai-assessment/` cho phép analyst chấp nhận toàn bộ hoặc một phần (`verdict_ai`, `severity_ai`, `impact_ai`, `priority_ai`, `confidence_ai`) kèm ghi chú lý do khi override.
   - Hiện thực hóa spec [`docs/specs/v0.6.0/08-ai-quality-evaluation.md`](file:///d:/Project/SOC%20platform/agentic-soc-platform/docs/specs/v0.6.0/08-ai-quality-evaluation.md): tạo model `AiQualityEvaluation` và signal/hook khi Case chuyển sang `Closed` để đo **AI–Human Agreement**, confusion matrix cho `Verdict`, và over/underestimate cho các trường ordinal.
   - Gắn cờ phê duyệt thủ công cho `BasePlaybook` có `RISK_LEVEL in ("High", "Critical")` trước khi thực thi (Human-in-the-Loop gate).
2. **Frontend (`CaseBasicView.tsx`, `InvestigationReportView.tsx`, `SystemSettings.tsx`):**
   - Thêm thanh thao tác **"Accept AI Assessment"** / **"Compare AI vs Analyst"** ngay trên [`CaseBasicView.tsx`](file:///d:/Project/SOC%20platform/agentic-soc-platform/frontend/src/components/CaseBasicView.tsx).
   - Tại khối `remediations` của [`InvestigationReportView.tsx`](file:///d:/Project/SOC%20platform/agentic-soc-platform/frontend/src/components/InvestigationReportView.tsx), ánh xạ hành động gợi ý với nút **"Run Playbook"** có modal xác nhận.
   - Thêm tab **AI Quality** trong `SystemSettings` để theo dõi tỷ lệ đồng thuận AI–Human theo thời gian.

### Phase 2 — Giao Diện Quản Lý Agent (Agent Monitor & Control Plane) (Ưu tiên P0)
1. **Backend (`apps/agentic`):**
   - Mở rộng `CaseAnalysisJob` lưu thêm `model_name`, `latency_ms`, `token_usage` (JSON), `prompt_version`.
   - Thêm API `/api/agentic/jobs/` (lọc theo `status`, `case`, `trigger`) + action `POST /api/agentic/jobs/<id>/retry/` và `POST /api/agentic/jobs/<id>/cancel/`.
2. **Frontend (`SystemSettings.tsx` hoặc trang `/agents`):**
   - Bổ sung trang/tab **Agent Monitor**: hiển thị thống kê hàng đợi `Pending / Running / Success / Failed`, nhật ký lỗi LLM, latency trung bình, nút **Trigger Re-analyze / Retry**, và xem inspector `result_json` / `knowledge_keywords` đã dùng cho RAG.

### Phase 3 — Triển Khai Textmode-First → Đồng Bộ Web (Ưu tiên P1)
1. **Mở rộng `asp-cli` ([`cli/src/asp_cli/`](file:///d:/Project/SOC%20platform/agentic-soc-platform/cli/src/asp_cli/main.py)):**
   - Thêm nhóm lệnh `asp agent`: `asp agent jobs list`, `asp agent jobs retry <id>`, `asp agent analyze <case_id> --wait`.
   - Thêm lệnh `asp case decide <case_id> --accept-ai` hoặc tương tác từng trường trên terminal.
2. **Bổ sung chế độ TUI (`asp tui`) với `textual`:**
   - Gồm 4 màn hình terminal chạy qua `/api/agent/v1/`: (1) Live Alerts & Cases Queue, (2) Case Investigation Report + Accept/Override Decision, (3) Playbook Runner & Live Logs, (4) Agent Job Monitor.
   - Mọi luồng nghiệp vụ xây cho Textmode đều dùng chung REST API với React Web UI để khi chuyển/phát triển tiếp lên Web không bị làm lại logic.

### Phase 4 — Nâng Cấp Lõi Agentic & Hybrid RAG (Ưu tiên P2)
1. **Nâng cấp RAG trong [`knowledge.py`](file:///d:/Project/SOC%20platform/agentic-soc-platform/backend/apps/agentic/analysis/knowledge.py):**
   - Chuyển từ `icontains` thuần sang **PostgreSQL Full-Text Search (`SearchVector`, `SearchRank`)** kết hợp **pgvector** (Hybrid Lexical + Semantic Ranking) để nâng độ chính xác truy xuất khi Knowledge Base lớn.
2. **Nâng cấp Single-turn thành Multi-step ReAct Agent (tùy chọn theo độ phức tạp Case):**
   - Tận dụng tag `tool_calling` trong `LLMAPI` và các integration sẵn có (`siem`, `threat_intel`, `cmdb`) để Agent chủ động truy vấn bổ sung khi phát hiện `unknowns` hoặc `confidence_ai == Low` trước khi xuất `InvestigationReport` cuối cùng.
   - Bổ sung rule auto-escalation: nếu `severity_ai in ("High", "Critical")` và `confidence_ai == "Low"`, tự động gắn tag `needs-escalation` và gửi thông báo tới kênh cảnh báo/Inbox.
