# Báo Cáo Triển Khai Phase 3: Textmode-First (`asp` CLI & `asp tui` ↔ Web Sync)

> **Ngày hoàn thành:** 2026-11-25  
> **Phạm vi:** Phase 3 trong lộ trình [KE_HOACH_TICH_HOP_VA_DANH_GIA.md](file:///d:/Project/SOC%20platform/agentic-soc-platform/KE_HOACH_TICH_HOP_VA_DANH_GIA.md)

---

## 1. Tổng Quan Chức Năng Đã Hoàn Thành

1. **Mở rộng `/api/agent/v1/` (Backend REST đồng bộ với Web UI):**
   - Bổ sung 10 capabilities mới vào `FOUNDATION_CAPABILITIES` trong [`backend/apps/agent_api/views.py`](file:///d:/Project/SOC%20platform/agentic-soc-platform/backend/apps/agent_api/views.py#L76-L108) (`case.report`, `case.analyze`, `case.decide`, `playbook.approve`, `playbook.reject`, `agent.overview`, `agent.jobs.*`).
   - Thêm các endpoint tái sử dụng trực tiếp service của Phase 1 & Phase 2:
     - `GET /api/agent/v1/cases/<case_id>/report/`: Trả về `InvestigationReport` và bảng đối chiếu `ai_quality`.
     - `POST /api/agent/v1/cases/<case_id>/analyze/`: Đưa Case vào hàng đợi điều tra AI (`request_case_analysis(..., trigger="cli")`).
     - `POST /api/agent/v1/cases/<case_id>/decide/`: Chấp nhận toàn bộ/từng phần AI (`apply_ai_assessment`) hoặc override trực tiếp `verdict`, `severity`, `impact`, `priority`, `confidence`, `status`, `summary` kèm `decision_note`.
     - `POST /api/agent/v1/playbooks/<playbook_id>/approve/` & `/reject/`: Duyệt hoặc từ chối Playbook `Awaiting Approval` từ CLI/TUI.
     - `GET /api/agent/v1/agent/overview/`, `/agent/jobs/`, `/agent/jobs/<job_id>/`, `POST .../retry/`, `POST .../cancel/` (Admin-only).

2. **Nâng cấp `asp-cli` (`cli/src/asp_cli/`):**
   - Bổ sung nhóm lệnh **`asp case report <id>`**, **`asp case analyze <id> [--wait]`**, **`asp case decide <id> [--accept-ai|--fields|...]`**.
   - Bổ sung lệnh **`asp playbook approve <id>`** và **`asp playbook reject <id>`**.
   - Bổ sung nhóm lệnh **`asp agent`**: `overview`, `jobs list`, `jobs show`, `jobs retry`, `jobs cancel`, và **`jobs tail`** (live-refresh terminal table dùng `rich.live.Live`).
   - Cập nhật đặc tả [`cli/src/asp_cli/spec/operations.json`](file:///d:/Project/SOC%20platform/agentic-soc-platform/cli/src/asp_cli/spec/operations.json) và tài liệu [`cli/README.md`](file:///d:/Project/SOC%20platform/agentic-soc-platform/cli/README.md).

3. **Giao Diện Terminal Tương Tác (`asp tui`):**
   - Tạo [`cli/src/asp_cli/tui.py`](file:///d:/Project/SOC%20platform/agentic-soc-platform/cli/src/asp_cli/tui.py) hỗ trợ hai chế độ liền mạch:
     - **Textual TUI (`--mode textual` hoặc `auto` khi cài `asp-cli[tui]`):** 4 tab `Cases`, `Alerts`, `Playbooks`, `Agent Monitor` kèm pane xem báo cáo AI và phím tắt nhanh (`a` Accept AI, `z` Analyze, `y` Approve Playbook, `n` Reject Playbook, `r` Refresh, `q` Quit).
     - **Rich Interactive Fallback (`--mode rich` hoặc khi chưa cài `textual`):** Terminal command center tương tác chạy hoàn toàn bằng thư viện `rich` có sẵn trong `cli/pyproject.toml`.

---

## 2. Danh Sách File & Vị Trí Hàm/Class Đã Tạo Mới hoặc Chỉnh Sửa

### A. Backend (`/api/agent/v1/`)

| File | Trạng thái | Hàm / Class / Thành phần | Mô tả |
| :--- | :---: | :--- | :--- |
| [`backend/apps/agent_api/serializers.py`](file:///d:/Project/SOC%20platform/agentic-soc-platform/backend/apps/agent_api/serializers.py#L164-L183) | **Sửa** | `serialize_playbook()` | Bổ sung `risk_level`, `requires_approval`, `approved_by`, `approved_at`, `approval_note`. |
| [`backend/apps/agent_api/views.py`](file:///d:/Project/SOC%20platform/agentic-soc-platform/backend/apps/agent_api/views.py#L204-L700) | **Sửa** | `CaseInvestigationReportView`, `CaseTriggerAnalysisView`, `CaseDecisionView`, `PlaybookApproveView`, `PlaybookRejectView`, `AgentMonitorOverviewView`, `AgentMonitorJobListView`, `AgentMonitorJobDetailView`, `AgentMonitorJobRetryView`, `AgentMonitorJobCancelView`, `_find_analysis_job()` | Các REST endpoints phục vụ CLI & Textmode TUI đồng bộ cùng service với Web UI. |
| [`backend/apps/agent_api/urls.py`](file:///d:/Project/SOC%20platform/agentic-soc-platform/backend/apps/agent_api/urls.py#L1-L82) | **Sửa** | `urlpatterns` | Đăng ký 10 routes mới dưới `/api/agent/v1/`. |
| [`backend/apps/agent_api/tests.py`](file:///d:/Project/SOC%20platform/agentic-soc-platform/backend/apps/agent_api/tests.py#L34-L98) | **Sửa** | `AgentApiDecisionAndMonitorTests` | Integration tests cho `/cases/{id}/analyze/`, `/report/`, `/decide/`, `/playbooks/{id}/approve/`, `/agent/overview/` và phân quyền Admin. |

### B. CLI & Textmode TUI (`cli/`)

| File | Trạng thái | Hàm / Class / Thành phần | Mô tả |
| :--- | :---: | :--- | :--- |
| [`cli/pyproject.toml`](file:///d:/Project/SOC%20platform/agentic-soc-platform/cli/pyproject.toml#L24-L35) | **Sửa** | `[project.optional-dependencies]` | Bổ sung optional extra `tui = ["textual>=1.0.0"]`. |
| [`cli/src/asp_cli/agent_commands.py`](file:///d:/Project/SOC%20platform/agentic-soc-platform/cli/src/asp_cli/agent_commands.py) | **Tạo mới** | `build_table()`, `render_case_report()`, `render_agent_overview()`, `wait_for_analysis_job()`, `build_decision_payload()`, `tail_agent_jobs()` | Module render báo cáo AI, polling tiến độ phân tích và live-tail hàng đợi trên terminal. |
| [`cli/src/asp_cli/tui.py`](file:///d:/Project/SOC%20platform/agentic-soc-platform/cli/src/asp_cli/tui.py) | **Tạo mới** | `textual_available()`, `RichInteractiveTui`, `_launch_textual_tui()`, `launch_tui()` | Giao diện textmode tương tác (hỗ trợ cả Textual full-screen lẫn Rich interactive fallback). |
| [`cli/src/asp_cli/main.py`](file:///d:/Project/SOC%20platform/agentic-soc-platform/cli/src/asp_cli/main.py#L30-L1450) | **Sửa** | `agent_app`, `agent_jobs_app`, `case_report`, `case_analyze`, `case_decide`, `playbook_approve`, `playbook_reject`, `agent_overview`, `agent_jobs_*`, `tui` | Đăng ký và nối toàn bộ lệnh CLI & TUI vào `asp` entrypoint. |
| [`cli/src/asp_cli/spec/operations.json`](file:///d:/Project/SOC%20platform/agentic-soc-platform/cli/src/asp_cli/spec/operations.json#L395-L513) | **Sửa** | `operations` | Cập nhật 11 operations mới cho CLI & AI Agent tooling. |
| [`cli/README.md`](file:///d:/Project/SOC%20platform/agentic-soc-platform/cli/README.md#L25-L45) | **Sửa** | Quick start | Bổ sung ví dụ lệnh mới và hướng dẫn cài `asp-cli[tui]`. |
| [`cli/tests/test_phase3_cli_tui.py`](file:///d:/Project/SOC%20platform/agentic-soc-platform/cli/tests/test_phase3_cli_tui.py) | **Tạo mới** | `Phase3OperationsSpecTests`, `Phase3HelperLogicTests` | Unit tests cho `operations.json`, `build_decision_payload()`, và `RichInteractiveTui._accept_ai()`. |

---

## 3. Kết Quả Kiểm Thử & Trạng Thái Xác Minh

| Hạng mục kiểm tra | Kết quả | Ghi chú |
|---|---|---|
| `python -m py_compile` (8 files Python Backend & CLI Phase 3) | ✅ **Pass** (exit code 0) | Toàn bộ syntax hợp lệ. |
| `operations.json` JSON validation | ✅ **Pass** | File JSON hợp lệ, đủ 11 operations mới. |
| `python -m unittest cli/tests/test_phase3_cli_tui.py -v` | ✅ **Pass** (`Ran 3 tests in 0.385s — OK`) | 3/3 tests (`operations.json`, `build_decision_payload`, `RichInteractiveTui._accept_ai`) đều chạy thực tế và pass. |
| `asp_cli.main` Typer CLI runner check | ⏳ **Thiếu `typer` trên Python global host** | `ModuleNotFoundError: No module named 'typer'` trên Python 3.11 global; cần chạy qua `uv run` trong `cli/` (`cli/uv.lock`). |
| Django `agent_api` tests (`manage.py test apps.agent_api`) | ⏳ **Chưa chạy trực tiếp trên host** | Cần chạy cùng PostgreSQL/Redis trong Docker Compose hoặc CI. |
