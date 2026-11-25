
## 1. Tổng quan

Agentic SOC Platform là nền tảng hỗ trợ Trung tâm điều hành an ninh mạng (SOC) tiếp nhận, quản lý và điều tra cảnh báo bảo mật. Hệ thống tập trung cảnh báo từ nhiều nguồn, gom các cảnh báo liên quan thành Case, trích xuất Artifact/IOC và hỗ trợ chuyên viên xử lý theo quy trình.

Mục tiêu của dự án là xây dựng một môi trường SOC có thể mở rộng, tích hợp SIEM và các dịch vụ phân tích, đồng thời hỗ trợ tự động hóa một phần công việc điều tra bằng Agent AI và Playbook.

## 2. Kiến trúc và công nghệ

- **Frontend:** React, TypeScript, Vite và Ant Design.
- **Backend:** Django và Django REST Framework; ASGI hỗ trợ các kết nối bất đồng bộ.
- **Lưu trữ và xử lý:** PostgreSQL lưu dữ liệu nghiệp vụ; Redis hỗ trợ hàng đợi và xử lý nền; RustFS cung cấp lưu trữ tương thích S3 cho tệp đính kèm.
- **Triển khai:** Docker Compose đóng gói giao diện, API, worker và các dịch vụ dữ liệu.
- **Mở rộng:** Python Module, Playbook và CLI/API cho phép tích hợp nguồn cảnh báo và tự động hóa thao tác.

Luồng xử lý tổng quát:

```text
SIEM / Webhook → Chuẩn hóa cảnh báo → Alert và Artifact
                                  → Tương quan → Case
                                  → Worker / Agent / Playbook hỗ trợ điều tra
                                  → Chuyên viên xem xét và xử lý trên giao diện
```

## 3. Các chức năng đã xây dựng

### 3.1 Quản lý cảnh báo và Case

- Tiếp nhận dữ liệu cảnh báo từ webhook và các tích hợp SIEM.
- Chuẩn hóa thông tin, mức độ nghiêm trọng và các trường dữ liệu liên quan.
- Trích xuất IOC/Artifact như địa chỉ IP, máy chủ, tài khoản, tiến trình và hash.
- Liên kết cảnh báo liên quan vào Case để chuyên viên theo dõi cùng một sự việc.
- Cung cấp các màn hình làm việc với Dashboard, Alert, Case, Artifact, Enrichment và Knowledge.

### 3.2 Tích hợp và xử lý cảnh báo Wazuh

Dự án có API webhook tiếp nhận cảnh báo Wazuh, module xử lý nền và môi trường lab Wazuh riêng. Luồng tích hợp hỗ trợ đưa dữ liệu qua Redis hoặc xử lý trực tiếp, ánh xạ mức độ cảnh báo và trích xuất thông tin phục vụ điều tra. Các thành phần liên quan nằm trong `backend/apps/webhook/`, `backend/custom/modules/` và `deploy/wazuh-lab/`.

Ngoài Wazuh, tài liệu và cấu hình dự án có các hướng tích hợp webhook, Splunk và ELK/Kibana để thống nhất điểm tiếp nhận và tra cứu thông tin.

### 3.3 Điều tra, làm giàu dữ liệu và tự động hóa

- Tổ chức công việc xử lý bằng Playbook và worker chạy nền.
- Hỗ trợ các luồng phân tích bằng LLM, trích xuất tri thức, bổ sung Threat Intelligence và thông tin CMDB.
- Quản lý Knowledge để lưu lại thông tin có thể tái sử dụng trong các cuộc điều tra sau.
- Cho phép xây dựng Module và Playbook tùy chỉnh bằng Python.
- Cung cấp CLI để truy vấn Case/Alert, thêm bình luận, chạy Playbook và kết nối với nền tảng.

Việc thực thi các chức năng dựa trên LLM hoặc dịch vụ bên ngoài cần được cấu hình nhà cung cấp và thông tin xác thực tương ứng.

### 3.4 Quản trị và cộng tác

Hệ thống có đăng nhập nội bộ và LDAP, phân quyền người dùng, API Key, thông báo Inbox và Audit Log để ghi nhận hoạt động. Giao diện cũng có các trang quản lý người dùng, cấu hình SIEM, LLM, Threat Intelligence, worker và các định nghĩa tùy chỉnh.

## 4. Bộ kịch bản và dữ liệu thử nghiệm

Trong mã nguồn có bộ **15 kịch bản cảnh báo Wazuh có nhãn Ground Truth** tại `backend/benchmark/scenarios_15_ground_truth.json`, công cụ đánh giá tại `backend/benchmark/run_evaluation.py`, cùng script mô phỏng gửi cảnh báo tại `deploy/wazuh-lab/simulate_wazuh_alerts.py`. Repo cũng có một số JSON cảnh báo mẫu và bộ phát sinh sự kiện SIEM giả lập.

Các kịch bản và công cụ trên là dữ liệu phục vụ thử nghiệm/đánh giá; chúng **không tự động được nạp** vào database. Database demo hiện đã có dữ liệu nghiệp vụ. Số liệu dưới đây được đọc trực tiếp từ môi trường đang chạy ngày 13/11/2026:

| Loại dữ liệu | Số bản ghi hiện có |
|---|---:|
| Alert | 11 |
| Case | 8 |
| Artifact | 16 |
| Enrichment | 14 |
| Knowledge | 3 |

Số liệu trên phản ánh trạng thái database tại thời điểm kiểm tra; nguồn và nhãn của các bản ghi hiện có cần được đối chiếu với bộ dữ liệu đã nạp. Tài liệu tiến độ roadmap trong repo ghi nhận bước phân tích/chuẩn hóa offline đạt 15/15 kịch bản. Đây là kết quả được ghi trong tài liệu dự án; cần chạy lại công cụ đánh giá nếu cần tái xác nhận trong buổi nghiệm thu.

## 5. Khởi tạo và kiểm tra bản chạy thử

Bản demo được khởi chạy trên máy cục bộ bằng Docker Compose với các image ASP phiên bản `0.6.0`. Giao diện được giới hạn ở localhost.

- URL giao diện: `https://localhost:8443`
- API health: `/api/health/`
- Migration Django đã hoàn tất.
- Django system check: không phát hiện lỗi.
- Kiểm tra từ máy host: giao diện và API health đều trả về HTTP 200.
- PostgreSQL và Redis báo trạng thái healthy; giao diện, API và ASGI cũng báo healthy. Hầu hết worker đang chạy.
- **Giới hạn đã phát hiện:** worker Playbook đang restart do lỗi PostgreSQL `FOR UPDATE cannot be applied to the nullable side of an outer join` trong bước khôi phục Playbook chạy dở. Vì vậy chưa nên trình diễn thao tác chạy Playbook cho đến khi xử lý và xác minh lại worker này.
- Provider LLM đã được bật và có API key. Lệnh kiểm tra kết nối chưa thành công vì Docker container không phân giải được hostname trong `base_url`; không thể kết luận API key sai. Provider hiện chỉ có tag `fast`, trong khi phân tích Case yêu cầu tag `structured_output`. 8 Case đang có dữ liệu báo cáo AI, nhưng chưa xác minh được một lượt phân tích mới bằng provider vừa cấu hình.
- HTTPS dùng chứng chỉ tự ký cho môi trường demo cục bộ.

## 6. Giới hạn và hướng phát triển tiếp theo

1. Sửa và xác minh worker Playbook để tránh lỗi khóa hàng PostgreSQL khi truy vấn có quan hệ tùy chọn.
2. Sửa hostname/DNS hoặc proxy để container truy cập được endpoint LLM; thêm tag `structured_output` cho provider phục vụ phân tích Case, rồi chạy lại nút kiểm tra provider trong giao diện.
3. Khi kiểm tra provider thành công, tạo một lượt phân tích mới từ một cảnh báo thử nghiệm và lưu kết quả, thời gian phản hồi cùng lỗi (nếu có). Dữ liệu báo cáo AI đã có sẵn trên 8 Case hiện tại chưa đủ chứng minh lượt chạy mới này.
4. Đối chiếu nguồn dữ liệu hiện có; chụp Dashboard, danh sách Case/Alert và trang chi tiết Artifact/Enrichment làm minh chứng.
5. Chạy benchmark 15 kịch bản trên database riêng hoặc bản sao. Các chế độ `ingest` và `http` có thể ghi thêm dữ liệu vào hệ thống đang chạy, nên cần cô lập để tránh trùng lặp với dữ liệu demo.
6. Cập nhật báo cáo bằng ảnh chụp, số liệu sau benchmark và trạng thái worker sau khi sửa.

## 7. Kết luận

Agentic SOC Platform đã có kiến trúc frontend/backend, các dịch vụ lưu trữ và xử lý nền, các màn hình quản lý nghiệp vụ, tích hợp nguồn cảnh báo và công cụ hỗ trợ điều tra/tự động hóa. Bản demo đang chạy và database đã có dữ liệu nghiệp vụ; các kiểm tra cơ bản của giao diện và API đều đạt. Một lượt AI mới chưa được xác minh do endpoint hiện không phân giải được từ Docker và cấu hình thiếu tag `structured_output`; worker Playbook cũng đang restart. Cần xử lý hai điểm này trước khi tuyên bố toàn bộ luồng AI/Playbook đã được trình diễn thành công.

## Tài liệu tham khảo trong repo

- [README dự án](README_ZH.md)
- [Tiến độ roadmap MVP](REPORT_ROADMAP_PROGRESS.md)
- [Backend](backend/readme.md)
- [Hướng dẫn Docker Compose](deploy/asp-compose/README.zh.md)
- [Bộ Ground Truth](backend/benchmark/scenarios_15_ground_truth.json)
- [Công cụ đánh giá](backend/benchmark/run_evaluation.py)
- [Mô phỏng cảnh báo Wazuh](deploy/wazuh-lab/simulate_wazuh_alerts.py)
