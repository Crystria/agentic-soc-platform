# Báo Cáo Triển Khai Phase 1: AI-Assisted Decision-Making & Human-in-the-Loop

> **Ngày hoàn thành:** 2026-11-25  
> **Phạm vi:** Phase 1 trong lộ trình [KE_HOACH_TICH_HOP_VA_DANH_GIA.md](file:///d:/Project/SOC%20platform/agentic-soc-platform/KE_HOACH_TICH_HOP_VA_DANH_GIA.md)

---

## 1. Tổng Quan Chức Năng Đã Hoàn Thành

1. **Chấp nhận / Điều chỉnh Đánh giá AI trên Case (`AI-Assisted Decision-Making`):**
   - Cho phép chỉnh sửa trực tiếp (inline editing) các trường đánh giá của chuyên viên (`severity`, `impact`, `priority`, `confidence`, `verdict`) ngay trong màn hình chi tiết Case.
   - Bổ sung thanh trợ lý quyết định AI (**AI Decision Assistant**) hỗ trợ **1-click Accept All AI** hoặc **Review & Override** (chọn từng trường cần áp dụng, tùy chọn chép AI `digest` vào `summary`, kèm ghi chú quyết định tự động lưu vào Case Comments và ghi nhận đầy đủ `AuditLog` qua `audit_actor`).
   - Cho phép kích hoạt lại điều tra AI thủ công (`Re-run AI Analysis`) trực tiếp từ tab `Investigation` của Case.
   - Gắn nút **Run Playbook** trực tiếp trên từng khuyến nghị `Remediation Recommendations` trong báo cáo điều tra để mở modal chạy Playbook với `user_input` được điền sẵn ngữ cảnh xử lý.

2. **Đánh giá Đồng thuận AI – Chuyên viên (`AI–Human Agreement` theo spec `08-ai-quality-evaluation.md`):**
   - Tạo model `AiQualityEvaluation` (tách khỏi `BaseModel` để không ghi `AuditLog` khi rebuild/delete) và cơ chế đồng bộ tự động qua `post_save` + `transaction.on_commit` có cô lập lỗi (failure isolation) khi Case được đóng (`Closed`), chỉnh sửa sau đóng, hoặc mở lại (`Reopen`).
   - Bổ sung management command `rebuild_ai_quality_evaluations` để backfill/đối soát lại dữ liệu không cần gọi LLM.
   - Hiển thị bảng so sánh **AI–Human Assessment Alignment** trên tab `Investigation` của từng Case (có thể xem bởi Admin, User, Viewer) và trang quản trị **AI Quality** (Admin-only) trong `System Settings` với tỷ lệ Prediction Coverage, Agreement Rate 5 trường, Ordinal Distance/Direction, và danh sách drilldown.

3. **Cổng Phê Duyệt An Toàn cho Playbook Rủi Ro Cao (`Human-in-the-Loop Gate`):**
   - Mở rộng trạng thái Playbook thêm `Awaiting Approval` và `Rejected`, cùng metadata phê duyệt (`risk_level`, `requires_approval`, `approved_by`, `approved_at`, `approval_note`).
   - Các Playbook có `RISK_LEVEL` là `High` hoặc `Critical` mặc định được đưa vào trạng thái `Awaiting Approval` để worker nền (`claim_pending_playbook_run`) không tự ý thực thi trước khi chuyên viên duyệt (`Approve & Queue` hoặc `Reject`) trên giao diện `PlaybookBasicView`.

---

## 2. Danh Sách File & Vị Trí Hàm/Class Đã Tạo Mới hoặc Chỉnh Sửa

### A. Backend (Python / Django)

| File | Trạng thái | Hàm / Class / Thành phần | Mô tả |
| :--- | :---: | :--- | :--- |
| [`backend/apps/cases/models.py`](file:///d:/Project/SOC%20platform/agentic-soc-platform/backend/apps/cases/models.py#L198-L280) | **Sửa** | `AiQualityCoverageState`, `AiQualityDirection`, `AiQualityEvaluation` | Model lưu snapshot đối chiếu 5 trường AI vs Human khi đóng Case. |
| [`backend/apps/cases/migrations/0005_aiqualityevaluation.py`](file:///d:/Project/SOC%20platform/agentic-soc-platform/backend/apps/cases/migrations/0005_aiqualityevaluation.py) | **Tạo mới** | `Migration` | Migration tạo bảng `ai_quality_evaluations` và các index truy vấn. |
| [`backend/apps/cases/ai_decision.py`](file:///d:/Project/SOC%20platform/agentic-soc-platform/backend/apps/cases/ai_decision.py#L1-L82) | **Tạo mới** | `extract_report_digest()`, `apply_ai_assessment()` | Sao chép an toàn các trường `*_ai` sang trường quyết định của analyst, giữ nguyên `AuditLog` và lưu ghi chú vào `Comment`. |
| [`backend/apps/cases/ai_quality.py`](file:///d:/Project/SOC%20platform/agentic-soc-platform/backend/apps/cases/ai_quality.py#L1-L433) | **Tạo mới** | `compare_verdict()`, `compare_ordinal_field()`, `select_reference_job()`, `extract_job_ai_values()`, `sync_case_ai_quality_evaluation()`, `safe_sync_case_ai_quality_evaluation()`, `get_case_ai_quality_payload()`, `build_ai_quality_summary()`, `filter_evaluations()`, `serialize_evaluation_row()` | Toàn bộ logic so sánh exact/ordinal, chọn job tham chiếu trước lúc đóng Case, tổng hợp metrics và drilldown. |
| [`backend/apps/cases/signals.py`](file:///d:/Project/SOC%20platform/agentic-soc-platform/backend/apps/cases/signals.py) | **Tạo mới** | `sync_ai_quality_on_case_save()` | Signal `post_save` trên `Case` kích hoạt đồng bộ đánh giá qua `transaction.on_commit`. |
| [`backend/apps/cases/apps.py`](file:///d:/Project/SOC%20platform/agentic-soc-platform/backend/apps/cases/apps.py#L4-L9) | **Sửa** | `CasesConfig.ready()` | Đăng ký `apps.cases.signals`. |
| [`backend/apps/cases/management/commands/rebuild_ai_quality_evaluations.py`](file:///d:/Project/SOC%20platform/agentic-soc-platform/backend/apps/cases/management/commands/rebuild_ai_quality_evaluations.py) | **Tạo mới** | `Command.handle()` | Lệnh backfill/sửa dữ liệu `AiQualityEvaluation` cho các Case đã đóng. |
| [`backend/apps/cases/views.py`](file:///d:/Project/SOC%20platform/agentic-soc-platform/backend/apps/cases/views.py#L204-L314) | **Sửa** | `CaseViewSet.apply_ai()`, `CaseViewSet.analyze()`, `CaseViewSet.ai_quality()`, `AiQualitySummaryView`, `AiQualityEvaluationListView` | API endpoints `/cases/{id}/apply-ai-assessment/`, `/cases/{id}/analyze/`, `/cases/{id}/ai-quality/`, `/ai-quality/summary/`, `/ai-quality/evaluations/`. |
| [`backend/apps/cases/urls.py`](file:///d:/Project/SOC%20platform/agentic-soc-platform/backend/apps/cases/urls.py#L1-L18) | **Sửa** | `urlpatterns` | Đăng ký route `ai-quality/summary/` và `ai-quality/evaluations/`. |
| [`backend/apps/cases/tests.py`](file:///d:/Project/SOC%20platform/agentic-soc-platform/backend/apps/cases/tests.py) | **Tạo mới** | `AiQualityComparisonHelperTests`, `AiDecisionAndQualityIntegrationTests` | Unit tests cho logic so sánh ordinal/verdict, phân quyền, Apply AI và vòng đời Close/Reopen. |
| [`backend/apps/playbooks/models.py`](file:///d:/Project/SOC%20platform/agentic-soc-platform/backend/apps/playbooks/models.py#L10-L43) | **Sửa** | `PlaybookJobStatus`, `Playbook` | Thêm trạng thái `Awaiting Approval`, `Rejected` và các trường metadata phê duyệt. |
| [`backend/apps/playbooks/migrations/0004_playbook_approval_fields.py`](file:///d:/Project/SOC%20platform/agentic-soc-platform/backend/apps/playbooks/migrations/0004_playbook_approval_fields.py) | **Tạo mới** | `Migration` | Migration bổ sung các cột phê duyệt vào bảng `playbooks`. |
| [`backend/apps/agentic/services/playbooks.py`](file:///d:/Project/SOC%20platform/agentic-soc-platform/backend/apps/agentic/services/playbooks.py#L139-L227) | **Sửa** | `create_pending_playbook_run()`, `approve_playbook_run()`, `reject_playbook_run()` | Tự động chặn chạy ngay với playbook `High`/`Critical` và xử lý chuyển trạng thái duyệt/từ chối an toàn transaction. |
| [`backend/apps/playbooks/serializers.py`](file:///d:/Project/SOC%20platform/agentic-soc-platform/backend/apps/playbooks/serializers.py#L7-L56) | **Sửa** | `PlaybookSerializer` | Bổ sung `risk_level`, `requires_approval`, `approved_by`, `approved_by_username`, `approved_at`, `approval_note`. |
| [`backend/apps/playbooks/views.py`](file:///d:/Project/SOC%20platform/agentic-soc-platform/backend/apps/playbooks/views.py#L62-L120) | **Sửa** | `PlaybookViewSet.run()`, `PlaybookViewSet.approve()`, `PlaybookViewSet.reject()` | Hỗ trợ `require_approval` và các endpoint `/playbooks/{id}/approve/`, `/playbooks/{id}/reject/`. |
| [`backend/apps/playbooks/tests.py`](file:///d:/Project/SOC%20platform/agentic-soc-platform/backend/apps/playbooks/tests.py) | **Tạo mới** | `PlaybookApprovalGateTests` | Tests kiểm chứng chặn worker claim trước khi duyệt và luồng approve/reject qua API. |

### B. Frontend (React 19 / TypeScript / Ant Design 6)

| File | Trạng thái | Thành phần / Hàm | Mô tả |
| :--- | :---: | :--- | :--- |
| [`frontend/src/api/aiDecision.ts`](file:///d:/Project/SOC%20platform/agentic-soc-platform/frontend/src/api/aiDecision.ts) | **Tạo mới** | `applyCaseAiAssessment`, `triggerCaseAiAnalysis`, `fetchCaseAiQuality`, `fetchAiQualitySummary`, `fetchAiQualityEvaluations`, `approvePlaybookRun`, `rejectPlaybookRun` | Client API và TypeScript interfaces cho quyết định AI, AI Quality và Playbook Approval. |
| [`frontend/src/types/records.ts`](file:///d:/Project/SOC%20platform/agentic-soc-platform/frontend/src/types/records.ts#L151-L189) | **Sửa** | `RecordTab`, `ResourceConfig` | Thêm callback `onRefresh?: () => void` cho tab và basicView. |
| [`frontend/src/components/RecordDetailModal.tsx`](file:///d:/Project/SOC%20platform/agentic-soc-platform/frontend/src/components/RecordDetailModal.tsx#L185-L405) | **Sửa** | `requestRefresh`, `refreshTick` effect, `contentTabs` | Truyền `onRefresh` cho phép sub-views làm mới bản ghi sau khi mutation thành công. |
| [`frontend/src/config/resources.tsx`](file:///d:/Project/SOC%20platform/agentic-soc-platform/frontend/src/config/resources.tsx#L147-L950) | **Sửa** | `caseSeverityOptions`, `caseImpactPriorityOptions`, `caseConfidenceOptions`, `playbookJobStatusTag`, `cases.editableFields`, `playbooks.columns` | Bật inline-edit 4 trường risk trên Case, bổ sung trạng thái `Awaiting Approval` / `Rejected` và cột `Risk Level` trên Playbooks. |
| [`frontend/src/components/CaseBasicView.tsx`](file:///d:/Project/SOC%20platform/agentic-soc-platform/frontend/src/components/CaseBasicView.tsx) | **Sửa** | `inlineSelectItem`, `aiComparisonTag`, `CaseBasicView` | Inline editing cho `severity`, `confidence`, `impact`, `priority`; AI Decision Assistant Bar + Review & Override Modal. |
| [`frontend/src/components/CasePlaybookRunModal.tsx`](file:///d:/Project/SOC%20platform/agentic-soc-platform/frontend/src/components/CasePlaybookRunModal.tsx#L27-L315) | **Sửa** | `CasePlaybookRunModal` | Export modal để tái sử dụng từ Remediation, hỗ trợ `initialUserInput`, cảnh báo khi chọn Playbook rủi ro `High`/`Critical`. |
| [`frontend/src/components/InvestigationReportView.tsx`](file:///d:/Project/SOC%20platform/agentic-soc-platform/frontend/src/components/InvestigationReportView.tsx#L384-L448) | **Sửa** | `RemediationSection`, `InvestigationReportView` | Thêm nút **Run Playbook** trên mỗi khuyến nghị hành động. |
| [`frontend/src/components/CaseInvestigationView.tsx`](file:///d:/Project/SOC%20platform/agentic-soc-platform/frontend/src/components/CaseInvestigationView.tsx) | **Sửa** | `CaseInvestigationView` | Bảng đối chiếu **AI–Human Assessment Alignment**, nút **Re-run AI Analysis**, **Apply AI Values**, và mở modal chạy Playbook từ Remediation. |
| [`frontend/src/components/PlaybookBasicView.tsx`](file:///d:/Project/SOC%20platform/agentic-soc-platform/frontend/src/components/PlaybookBasicView.tsx) | **Sửa** | `PlaybookBasicView` | Hiển thị banner **Human-in-the-Loop Approval Required** với nút **Approve & Queue** / **Reject** và thông tin người duyệt. |
| [`frontend/src/pages/AIQualitySettings.tsx`](file:///d:/Project/SOC%20platform/agentic-soc-platform/frontend/src/pages/AIQualitySettings.tsx) | **Tạo mới** | `AIQualitySettings` | Dashboard quản trị AI Quality (Coverage, Agreement Rates, Ordinal Alignment, Drilldown). |
| [`frontend/src/pages/SystemSettings.tsx`](file:///d:/Project/SOC%20platform/agentic-soc-platform/frontend/src/pages/SystemSettings.tsx#L51-L60) | **Sửa** | `SystemSettings` | Gắn tab **AI Quality** vào `SystemSettings`. |

---

## 3. Kết Quả Kiểm Thử & Trạng Thái Xác Minh

| Hạng mục kiểm tra | Kết quả | Ghi chú |
|---|---|---|
| `python -m py_compile` (16 files Python tạo mới/chỉnh sửa) | ✅ **Pass** (exit code 0) | Toàn bộ syntax hợp lệ. |
| `ast.parse` (12 files Backend app & tests) | ✅ **Pass** (`AST OK: 12`) | Không có lỗi cú pháp AST. |
| `eslint .` (`frontend/`) | ✅ **Pass** (0 errors, 0 warnings) | Tuân thủ đầy đủ React 19 hooks & TypeScript ESLint rules. |
| `tsc -b` (`frontend/`) | ✅ **Pass** (exit code 0) | Type-checking strict mode thành công. |
| `vite build` (`frontend/`) | ✅ **Pass** (`dist/` built in 52.43s) | Build production bundle thành công (`8128 modules transformed`). |
| Django unit & migration tests (`manage.py test` / `migrate`) | ⏳ **Chưa chạy trực tiếp trên host** | Máy cục bộ đang có Python 3.11 (dự án yêu cầu Python `>=3.14` + PostgreSQL + Redis trong Docker Compose/CI). Cần chạy `uv run python manage.py migrate && uv run python manage.py test apps.cases apps.playbooks` trong Docker/CI khi khởi động stack. |
