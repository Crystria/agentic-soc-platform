# Báo Cáo Triển Khai Phase 2: Agent Monitor & Control Plane

> **Ngày hoàn thành:** 2026-11-25  
> **Phạm vi:** Phase 2 trong lộ trình [KE_HOACH_TICH_HOP_VA_DANH_GIA.md](file:///d:/Project/SOC%20platform/agentic-soc-platform/KE_HOACH_TICH_HOP_VA_DANH_GIA.md)

---

## 1. Tổng Quan Chức Năng Đã Hoàn Thành

1. **Telemetry & Observability cho `CaseAnalysisJob`:**
   - Mở rộng model `CaseAnalysisJob` để lưu metadata thực thi (`provider_name`, `model_name`, `prompt_version`, `latency_ms`, `input_tokens`, `output_tokens`, `total_tokens`, `knowledge_keywords_count`, `knowledge_records_count`) và các index phục vụ thống kê hàng đợi.
   - Bổ sung `LLMAPI.resolve_config_metadata()` và `invoke_structured_llm_with_telemetry()` (hỗ trợ `include_raw=True` để trích `usage_metadata` / `token_usage` và fallback an toàn khi mock không nhận `include_raw`).
   - Ghi nhận tự động latency, token usage, số lượng RAG keywords/records mỗi khi `CaseAnalysisRunner` và worker `run_case_analysis_once()` hoàn tất job.

2. **Agent Monitor & Control Plane APIs (`/api/agentic/...` — Admin-only):**
   - `GET /api/agentic/overview/`: Trả về KPI hàng đợi (`Pending/Running/Success/Failed`, 24h success rate, avg & P95 latency, 24h token totals), độ phủ tag LLM (`fast`, `powerful`, `tool_calling`, `structured_output`) không lộ `api_key`, thống kê Knowledge RAG (`Manual` vs `Case`, top từ khóa được truy xuất gần đây), danh mục runtime (`playbooks`, `modules` + stream health), và trạng thái background workers.
   - `GET /api/agentic/jobs/`, `GET /api/agentic/jobs/{id}/`: Phân trang, lọc theo trạng thái/trigger/model, tìm kiếm theo Case ID/title/lỗi/model và xem toàn bộ `result_json`.
   - `POST /api/agentic/jobs/{id}/retry/`, `POST /api/agentic/jobs/{id}/cancel/`, `POST /api/agentic/jobs/trigger/`: Điều khiển hàng đợi và kích hoạt phân tích Case theo Case ID hoặc UUID.
   - `GET /api/agentic/prompts/`: Liệt kê và đọc nội dung toàn bộ prompt tích hợp (`investigation.system`, `investigation.knowledge_keywords`, `knowledge_extraction.system`) và custom playbook prompts theo ngôn ngữ (`en`/`zh`).

3. **Giao Diện Quản Lý Agent (`/agents` — Admin-only):**
   - Thêm trang [`AgentMonitor.tsx`](file:///d:/Project/SOC%20platform/agentic-soc-platform/frontend/src/pages/AgentMonitor.tsx) vào menu chính của [`MainLayout.tsx`](file:///d:/Project/SOC%20platform/agentic-soc-platform/frontend/src/components/MainLayout.tsx) và route `/agents` trong [`App.tsx`](file:///d:/Project/SOC%20platform/agentic-soc-platform/frontend/src/App.tsx) với 3 tab:
     - **Queue & Telemetry:** KPI 24h, trạng thái LLM tag coverage & workers, bảng hàng đợi `CaseAnalysisJob` có Auto-refresh 10s, nút Trigger / Retry / Cancel và **Job Inspector Drawer** xem lỗi, RAG keywords/records và raw `result_json`.
     - **Prompts:** Trình duyệt và xem nội dung các system prompts theo ngôn ngữ.
     - **RAG & Runtime:** Thống kê Knowledge Base, top từ khóa RAG gần đây, danh sách Stream Consumer Modules và Playbooks.

---

## 2. Danh Sách File & Vị Trí Hàm/Class Đã Tạo Mới hoặc Chỉnh Sửa

### A. Backend (Python / Django)

| File | Trạng thái | Hàm / Class / Thành phần | Mô tả |
| :--- | :---: | :--- | :--- |
| [`backend/apps/agentic/models.py`](file:///d:/Project/SOC%20platform/agentic-soc-platform/backend/apps/agentic/models.py#L30-L50) | **Sửa** | `CaseAnalysisJob` | Bổ sung 9 trường telemetry & RAG counts cùng 2 DB indexes. |
| [`backend/apps/agentic/migrations/0002_caseanalysisjob_telemetry.py`](file:///d:/Project/SOC%20platform/agentic-soc-platform/backend/apps/agentic/migrations/0002_caseanalysisjob_telemetry.py) | **Tạo mới** | `Migration` | Migration bổ sung các cột telemetry và index vào `agentic_case_analysis_jobs`. |
| [`backend/integrations/llm/llmapi.py`](file:///d:/Project/SOC%20platform/agentic-soc-platform/backend/integrations/llm/llmapi.py#L43-L50) | **Sửa** | `LLMAPI.resolve_config_metadata()` | Trả về `provider_name` và `model_name` an toàn (không lộ `api_key`). |
| [`backend/apps/agentic/analysis/prompts.py`](file:///d:/Project/SOC%20platform/agentic-soc-platform/backend/apps/agentic/analysis/prompts.py#L51-L165) | **Sửa** | `list_prompt_catalog()`, `_extract_token_usage()`, `invoke_structured_llm_with_telemetry()`, `invoke_structured_llm()` | Đọc danh mục prompt built-in/custom và thu thập token usage, latency, model metadata khi gọi LLM. |
| [`backend/apps/agentic/analysis/analysis.py`](file:///d:/Project/SOC%20platform/agentic-soc-platform/backend/apps/agentic/analysis/analysis.py#L25-L75) | **Sửa** | `AnalysisResult`, `CaseAnalysisRunner.run()` | Thu thập telemetry LLM + RAG counts vào `AnalysisResult.telemetry`. |
| [`backend/apps/agentic/services/cases.py`](file:///d:/Project/SOC%20platform/agentic-soc-platform/backend/apps/agentic/services/cases.py#L77-L125) | **Sửa** | `complete_case_analysis_job()`, `cancel_case_analysis_job()`, `retry_case_analysis_job()` | Lưu telemetry khi hoàn tất job và hỗ trợ hủy/chạy lại job an toàn với `select_for_update()`. |
| [`backend/apps/agentic/runtime/monitor.py`](file:///d:/Project/SOC%20platform/agentic-soc-platform/backend/apps/agentic/runtime/monitor.py#L48-L60) | **Sửa** | `run_case_analysis_once()` | Truyền `result.telemetry` vào `complete_case_analysis_job()`. |
| [`backend/apps/agentic/services/agent_monitor.py`](file:///d:/Project/SOC%20platform/agentic-soc-platform/backend/apps/agentic/services/agent_monitor.py) | **Tạo mới** | `serialize_job_list_item()`, `serialize_job_detail()`, `build_agentic_overview()` | Tổng hợp số liệu hàng đợi, latency P95, token 24h, LLM coverage, RAG keywords và runtime modules. |
| [`backend/apps/agentic/views.py`](file:///d:/Project/SOC%20platform/agentic-soc-platform/backend/apps/agentic/views.py) | **Tạo mới** | `AgenticOverviewView`, `AgenticPromptCatalogView`, `CaseAnalysisJobViewSet` | Các API Admin-only phục vụ Agent Monitor UI. |
| [`backend/apps/agentic/urls.py`](file:///d:/Project/SOC%20platform/agentic-soc-platform/backend/apps/agentic/urls.py) | **Tạo mới** | `urlpatterns` | Đăng ký routes `/api/agentic/overview/`, `/api/agentic/prompts/`, `/api/agentic/jobs/`. |
| [`backend/asp/urls.py`](file:///d:/Project/SOC%20platform/agentic-soc-platform/backend/asp/urls.py#L22-L26) | **Sửa** | `urlpatterns` | Gắn `apps.agentic.urls` vào root `/api/`. |
| [`backend/apps/agentic/tests.py`](file:///d:/Project/SOC%20platform/agentic-soc-platform/backend/apps/agentic/tests.py) | **Tạo mới** | `PromptTelemetryTests`, `AgentMonitorApiTests` | Unit & API tests cho telemetry, prompt catalog, phân quyền Admin và thao tác trigger/cancel/retry job. |

### B. Frontend (React 19 / TypeScript / Ant Design 6)

| File | Trạng thái | Thành phần / Hàm | Mô tả |
| :--- | :---: | :--- | :--- |
| [`frontend/src/api/agentic.ts`](file:///d:/Project/SOC%20platform/agentic-soc-platform/frontend/src/api/agentic.ts) | **Tạo mới** | `fetchAgenticOverview`, `fetchAgenticJobs`, `fetchAgenticJobDetail`, `retryAgenticJob`, `cancelAgenticJob`, `triggerAgenticCaseAnalysis`, `fetchAgenticPrompts` | Typed API client cho Agent Monitor. |
| [`frontend/src/pages/AgentMonitor.tsx`](file:///d:/Project/SOC%20platform/agentic-soc-platform/frontend/src/pages/AgentMonitor.tsx) | **Tạo mới** | `AgentMonitor` | Trang điều hành Agent gồm Queue & Telemetry, Job Inspector Drawer, Prompt Catalog và RAG & Runtime. |
| [`frontend/src/App.tsx`](file:///d:/Project/SOC%20platform/agentic-soc-platform/frontend/src/App.tsx#L12-L65) | **Sửa** | `App` | Thêm route `/agents` bảo vệ bởi `PermissionRoute permission="admin"`. |
| [`frontend/src/components/MainLayout.tsx`](file:///d:/Project/SOC%20platform/agentic-soc-platform/frontend/src/components/MainLayout.tsx#L10-L85) | **Sửa** | `MainLayout` | Thêm mục menu **Agents** và breadcrumb `/agents` cho Admin. |

---

## 3. Kết Quả Kiểm Thử & Trạng Thái Xác Minh

| Hạng mục kiểm tra | Kết quả | Ghi chú |
|---|---|---|
| `python -m py_compile` (12 files Python Phase 2) | ✅ **Pass** (exit code 0) | Toàn bộ syntax hợp lệ. |
| `ast.parse` (12 files Python Phase 2) | ✅ **Pass** (`AST OK: 12`) | Không có lỗi cú pháp AST. |
| `eslint .` (`frontend/`) | ✅ **Pass** (0 errors, 0 warnings) | Không còn lỗi hay cảnh báo hook/lint. |
| `tsc -b` (`frontend/`) | ✅ **Pass** (exit code 0) | Type-checking strict mode thành công. |
| `vite build` (`frontend/`) | ✅ **Pass** (`dist/` built in 5.67s) | Build production bundle thành công (`8130 modules transformed`). |
| Django migration & unit tests (`manage.py migrate && manage.py test apps.agentic`) | ⏳ **Chưa chạy trực tiếp trên host** | Cần chạy trong Docker Compose hoặc môi trường CI có Python `>=3.14`, PostgreSQL và Redis. |
