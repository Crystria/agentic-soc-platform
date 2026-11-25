# TÀI LIỆU VÀ BÁO CÁO HỆ THỐNG AGENTIC SOC PLATFORM (ASP)

> Bản báo cáo chi tiết toàn diện cấu trúc 3 chương (Cơ sở lý thuyết, Phân tích thiết kế, Triển khai và Đánh giá) đã được biên soạn đầy đủ tại:
> 
> 📄 **[README_BAO_CAO_HE_THONG.md](./README_BAO_CAO_HE_THONG.md)**

---

## Tóm tắt Nhanh Nội dung Báo cáo

### CHƯƠNG 1: CƠ SỞ LÝ THUYẾT
- **1.1.** Tổng quan về SOC, hệ thống SIEM (Wazuh, Splunk, Elastic) và SOAR; Vấn nạn "Bội thực cảnh báo" (Alert Fatigue).
- **1.2.** Kiến trúc Agentic AI & Mô hình Ngôn ngữ Lớn (LLM) trong An ninh mạng: ReAct framework, Chain-of-Thought, Tool Calling và cơ chế RAG.
- **1.3.** Khung tham chiếu MITRE ATT&CK (14 Tactics) và Kỹ thuật Tương quan Cảnh báo (Alert Correlation & Deduplication).
- **1.4.** Kết chương.

### CHƯƠNG 2: PHÂN TÍCH THIẾT KẾ HỆ THỐNG
- **2.1.** Phát biểu bài toán tự động hóa điều tra an ninh mạng.
- **2.2.** Phân tích hiện trạng và so sánh giải pháp truyền thống vs Agentic SOC.
- **2.3.** Phân tích chức năng:
  - Ingestion Webhook qua Redis Stream.
  - Thuật toán băm tương quan `correlation_uid` theo khung thời gian.
  - Tác tử điều tra tự hành AI sinh phán quyết (Verdict, Severity, MITRE Tactic).
  - Kịch bản phản ứng SOAR Playbook và cơ sở tri thức RAG.
  - Ma trận công nghệ (Django, React 19, PostgreSQL, Redis, Wazuh, Docker).
- **2.4.** Thiết kế cơ sở dữ liệu:
  - Sơ đồ thực thể quan hệ ERD (Mermaid).
  - Chi tiết 5 bảng: `alerts`, `cases`, `artifacts`, `playbooks` & `playbook_run_messages`, `knowledge`.
- **2.5.** Xây dựng chương trình:
  - Cấu trúc thư mục mã nguồn.
  - Chi tiết các module: Webhook Ingest, Agentic Analysis, Playbooks Runtime, Frontend Dashboard.
- **2.6.** Kết chương.

### CHƯƠNG 3: TRIỂN KHAI VÀ ĐÁNH GIÁ KẾT QUẢ
- **3.1.** Mô hình triển khai vi dịch vụ Docker Compose, cấu hình Nginx SSL cổng 8443, cấu hình Wazuh SIEM Lab.
- **3.2.** Kết quả thực nghiệm:
  - Kịch bản 1: Đăng nhập và xác thực RBAC.
  - Kịch bản 2: Tiếp nhận cảnh báo & Đánh giá bộ Benchmark 15 kịch bản tấn công (Pass 15/15 - 100%).
  - Kịch bản 3: Tự động điều tra bằng AI Agent, trích xuất thực thể và tra cứu RAG.
  - Kịch bản 4: Kích hoạt SOAR Playbook ngăn chặn, thống kê MTTD/MTTA/MTTR trên Dashboard.
- **3.3.** Nhận xét đánh giá định lượng (giảm 99.7% thời gian điều tra), ưu điểm và định hướng phát triển.
- **3.4.** Kết chương.
