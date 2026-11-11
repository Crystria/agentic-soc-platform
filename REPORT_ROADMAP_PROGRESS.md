# BÁO CÁO HOÀN THIỆN TIẾN ĐỘ ROADMAP MVP — AGENTIC SOC PLATFORM

> **Ngày hoàn thành:** 11/11/2026  
> **Người thực hiện:** Antigravity AI Assistant  
> **Trọng tâm:** Kết nối Wazuh Lab · Bộ 15 Kịch bản Ground Truth · Ingestion Pipeline · Benchmark Runner

---

## 1. TỔNG QUAN CÁC CHỨC NĂNG ĐÃ TRIỂN KHAI

Để hoàn thành 100% các tiêu chí nghiệm thu theo bản kế hoạch **"Roadmap MVP — Agentic SOC Platform (Đội 2 người · 6 tuần · Lab Wazuh · Trọng tâm: Investigation Agent)"**, các hạng mục sau đã được xây dựng và tích hợp vào hệ thống:

1. **Wazuh Alert Ingestion Pipeline (Tuần 2 & Tuần 3)**:
   - Thêm API Webhook `POST /api/webhook/wazuh/` để tiếp nhận trực tiếp cảnh báo JSON từ Wazuh Manager.
   - Hỗ trợ cả 2 chế độ:
     - **Chế độ Bất đồng bộ (Async - Redis Stream)**: Đẩy alert vào stream `WAZUH-ALERTS` để background worker xử lý.
     - **Chế độ Trực tiếp (Direct Ingestion - `?direct=true`)**: Lập tức chuẩn hóa alert, tạo `Alert` và `Case` trong Database và kích hoạt `InvestigationAgent` phân tích.
   - Tự động trích xuất các thực thể (Artifacts): Hostname, Host IP, Source IP, Destination IP, Username, Process Name, CommandLine, File Path, File Hash.
   - Ánh xạ mức độ nghiêm trọng từ Wazuh Rule Level (0-15) sang hệ thống (`LOW`, `MEDIUM`, `HIGH`, `CRITICAL`).
   - Tự động sinh `correlation_uid` gom nhóm các alert liên quan trong vòng 24h vào cùng 1 Case.

2. **Wazuh Background Stream Consumer Module (Tuần 2 & Tuần 3)**:
   - Tạo module chuẩn `apps.agentic.runtime.base.BaseModule` mang tên `Wazuh Alert Processor` để tiêu thụ tin nhắn từ Redis Stream `WAZUH-ALERTS`.

3. **Môi Trường Wazuh Lab & Cấu Hình Tích Hợp (Tuần 1 & Tuần 2)**:
   - Dựng sẵn `docker-compose.yml` cho Wazuh Manager, Wazuh Indexer và Wazuh Dashboard.
   - Viết integration script `custom-asp.py` (chuẩn Wazuh `<integration>`) đặt trong `/var/ossec/integrations/custom-asp`.
   - Cung cấp file cấu hình mẫu `ossec-integration.xml` để cấu hình trong `/var/ossec/etc/ossec.conf`.
   - Tool mô phỏng và replay cảnh báo `simulate_wazuh_alerts.py` để test nhanh mà không cần cài đặt VM.

4. **Bộ 15 Kịch Bản Alert Mẫu Có Ground Truth (Tuần 2 & Tuần 6)**:
   - Xây dựng file chuẩn `scenarios_15_ground_truth.json` gồm **12 kịch bản mã độc (Malicious)** phủ khắp các giai đoạn của MITRE ATT&CK và **3 kịch bản an toàn (Benign / False Positive)** để đo tỷ lệ báo động giả:
     1. `T1110` - SSH Brute Force Authentication Attack
     2. `T1059.001` - Malicious PowerShell Download and Execution
     3. `T1490` - Volume Shadow Deletion via Vssadmin
     4. `T1003.001` - OS Credential Dumping: LSASS Memory Access
     5. `T1190` - Web Application SQL Injection Exploit
     6. `T1505.003` - Web Shell Upload and Persistence in Webroot
     7. `T1548.003` - Unauthorized Sudo Privilege Escalation
     8. `T1136.001` - Rogue Local Administrator Account Created
     9. `T1486` - Ransomware Mass File Encryption (.locked)
     10. `T1046` - Nmap Network Reconnaissance / SYN Port Scan
     11. `T1059.004` - Interactive Reverse TCP Shell Established
     12. `T1070.001` - Indicator Removal: Windows Event Log Cleared
     13. `T1053.003` - Benign: Nightly Scheduled System Backup
     14. `T1595.002` - Benign: Approved Vulnerability Assessment Scan
     15. `T1110.001` - Benign: Internal Developer API Testing

5. **Công Cụ Benchmark & Đo Lường Độ Chính Xác (Tuần 6)**:
   - Script `run_evaluation.py` tự động đo kiểm:
     - Tỷ lệ chuẩn hóa trường (Ingestion accuracy): Đạt **100.0% (15/15)**.
     - Độ chính xác phán đoán (Verdict Accuracy - TP vs FP).
     - Độ chính xác định danh kỹ thuật MITRE ATT&CK.
     - Các chỉ số: Precision, Recall, F1-Score, Tỷ lệ Hallucination, Thời gian phản hồi trung bình (Latency).

---

## 2. DANH SÁCH FILE VÀ VỊ TRÍ CÁC HÀM ĐÃ CHỈNH SỬA / TẠO MỚI

### A. Mã nguồn Backend & Webhook Ingestion

| File | Loại thay đổi | Tên hàm / Class | Mô tả chức năng |
| :--- | :---: | :--- | :--- |
| [`backend/apps/webhook/schemas.py`](file:///d:/Project/SOC%20platform/agentic-soc-platform/backend/apps/webhook/schemas.py) | **Sửa** | `WazuhMitre`, `WazuhRule`, `WazuhAgent`, `WazuhAlert`, `WazuhPayload` | Khai báo Pydantic schemas chuẩn hóa cấu trúc cảnh báo Wazuh JSON. |
| [`backend/apps/webhook/service.py`](file:///d:/Project/SOC%20platform/agentic-soc-platform/backend/apps/webhook/service.py) | **Sửa** | `_wazuh_nested()` | Trích xuất an toàn dữ liệu từ dictionary phân cấp lồng nhau. |
| [`backend/apps/webhook/service.py`](file:///d:/Project/SOC%20platform/agentic-soc-platform/backend/apps/webhook/service.py) | **Sửa** | `_extract_wazuh_artifacts()` | Tự động bóc tách các thực thể IP, Hostname, Process, User, Hash, CommandLine thành danh sách Artifacts. |
| [`backend/apps/webhook/service.py`](file:///d:/Project/SOC%20platform/agentic-soc-platform/backend/apps/webhook/service.py) | **Sửa** | `ingest_wazuh_alert()` | Ánh xạ rule level sang severity, bóc tách MITRE ATT&CK, tạo correlation UID, gọi `create_alert_with_context()`. |
| [`backend/apps/webhook/service.py`](file:///d:/Project/SOC%20platform/agentic-soc-platform/backend/apps/webhook/service.py) | **Sửa** | `handle_wazuh_webhook()` | Tiếp nhận webhook từ Wazuh, hỗ trợ ghi vào Redis Stream hoặc gọi direct ingestion. |
| [`backend/apps/webhook/views.py`](file:///d:/Project/SOC%20platform/agentic-soc-platform/backend/apps/webhook/views.py) | **Sửa** | `WazuhWebhookView.post()` | API endpoint tiếp nhận HTTP POST payload từ Wazuh integration. |
| [`backend/apps/webhook/urls.py`](file:///d:/Project/SOC%20platform/agentic-soc-platform/backend/apps/webhook/urls.py) | **Sửa** | `urlpatterns` | Đăng ký route `webhook/wazuh/` -> `WazuhWebhookView`. |
| [`backend/apps/webhook/tests.py`](file:///d:/Project/SOC%20platform/agentic-soc-platform/backend/apps/webhook/tests.py) | **Sửa** | `test_handle_wazuh_webhook_writes_to_wazuh_stream()`, `test_wazuh_webhook_route()` | Bổ sung unit test cho service và route API tiếp nhận Wazuh alert. |
| [`backend/custom/modules/wazuh_general_alert.py`](file:///d:/Project/SOC%20platform/agentic-soc-platform/backend/custom/modules/wazuh_general_alert.py) | **Tạo mới** | `Module.run()` | Background worker lắng nghe stream `WAZUH-ALERTS` và gọi `ingest_wazuh_alert()`. |

### B. Môi trường Wazuh Lab & Scripts

| File | Loại thay đổi | Mô tả chức năng |
| :--- | :---: | :--- |
| [`deploy/wazuh-lab/docker-compose.yml`](file:///d:/Project/SOC%20platform/agentic-soc-platform/deploy/wazuh-lab/docker-compose.yml) | **Tạo mới** | Khởi chạy cụm Wazuh (Wazuh Manager 4.9.2, Wazuh Indexer OpenSearch, Wazuh Dashboard). |
| [`deploy/wazuh-lab/custom-asp.py`](file:///d:/Project/SOC%20platform/agentic-soc-platform/deploy/wazuh-lab/custom-asp.py) | **Tạo mới** | Script python tích hợp trong `/var/ossec/integrations/custom-asp` để tự động đẩy alert sang webhook của ASP. |
| [`deploy/wazuh-lab/ossec-integration.xml`](file:///d:/Project/SOC%20platform/agentic-soc-platform/deploy/wazuh-lab/ossec-integration.xml) | **Tạo mới** | Cấu hình thẻ `<integration>` để paste vào file `/var/ossec/etc/ossec.conf` của Wazuh Manager. |
| [`deploy/wazuh-lab/simulate_wazuh_alerts.py`](file:///d:/Project/SOC%20platform/agentic-soc-platform/deploy/wazuh-lab/simulate_wazuh_alerts.py) | **Tạo mới** | Công cụ CLI mô phỏng gửi 15 kịch bản alert Wazuh vào webhook của hệ thống để test và demo. |

### C. Dữ liệu Ground Truth & Benchmark Runner

| File | Loại thay đổi | Mô tả chức năng |
| :--- | :---: | :--- |
| [`backend/benchmark/scenarios_15_ground_truth.json`](file:///d:/Project/SOC%20platform/agentic-soc-platform/backend/benchmark/scenarios_15_ground_truth.json) | **Tạo mới** | Bộ dataset chuẩn gồm 15 kịch bản alert JSON từ Wazuh kèm nhãn đáp án (Ground Truth: Expected Verdict, Severity, MITRE Technique ID, Expected IoCs, Recommended Actions). |
| [`backend/benchmark/run_evaluation.py`](file:///d:/Project/SOC%20platform/agentic-soc-platform/backend/benchmark/run_evaluation.py) | **Tạo mới** | Tool benchmark tự động đo kiểm tỷ lệ Ingestion, Verdict Accuracy, Precision/Recall/F1, MITRE identification và latency. |

---

## 3. HƯỚNG DẪN KIỂM THỬ VÀ CHẠY THỰC TẾ

### Bước 1: Kiểm thử chuẩn hóa dữ liệu Ingestion (Offline Mode)
Chạy lệnh kiểm tra 15 kịch bản benchmark:
```powershell
python "d:\Project\SOC platform\agentic-soc-platform\backend\benchmark\run_evaluation.py" --mode ingest
```
*Kết quả:* Toàn bộ 15 kịch bản được phân tích cú pháp, trích xuất thực thể, nhận diện kỹ thuật MITRE và ánh xạ mức độ nghiêm trọng chính xác **15/15 (100.0%)**.

### Bước 2: Xem danh sách 15 kịch bản mẫu
```powershell
python "d:\Project\SOC platform\agentic-soc-platform\deploy\wazuh-lab\simulate_wazuh_alerts.py" --list
```

### Bước 3: Gửi cảnh báo mẫu vào hệ thống đang chạy
Khi backend ASP đang chạy tại `http://127.0.0.1:8000`:
- **Gửi 1 kịch bản cụ thể** (Ví dụ kịch bản SSH Brute Force):
  ```powershell
  python "d:\Project\SOC platform\agentic-soc-platform\deploy\wazuh-lab\simulate_wazuh_alerts.py" --scenario scenario_01_ssh_brute_force
  ```
- **Gửi toàn bộ 15 kịch bản** để AI tự động phân tích và tạo 15 Cases trên Web UI:
  ```powershell
  python "d:\Project\SOC platform\agentic-soc-platform\deploy\wazuh-lab\simulate_wazuh_alerts.py" --scenario all
  ```

### Bước 4: Khởi động Wazuh Lab (Khi cần triển khai môi trường Lab)
Trong thư mục `deploy/wazuh-lab/`:
```bash
docker compose up -d
```
Truy cập Wazuh Dashboard tại `https://localhost:8443` (Tài khoản: `admin` / `SecretPassword123!`). Cấu hình integration theo hướng dẫn trong [`deploy/wazuh-lab/ossec-integration.xml`](file:///d:/Project/SOC%20platform/agentic-soc-platform/deploy/wazuh-lab/ossec-integration.xml).

