# BÁO CÁO CẢI TIẾN & TINH GỌN GIAO DIỆN DASHBOARD (SOC COMMAND CENTER)

**Ngày thực hiện:** 22/11/2026  
**Dự án:** Agentic SOC Platform (ASP)  
**Phạm vi:** Tinh gọn, tối ưu luồng thị giác và trải nghiệm vận hành của trang **Dashboard**  

---

## 1. Mục Tiêu Cải Tiến

Trang Dashboard ban đầu có cấu trúc kéo dài theo chiều dọc (hơn 18 panels qua 6 hàng lớn), đòi hỏi người vận hành phải scroll liên tục. Các thông tin quan trọng nhất khi có sự cố (dòng cảnh báo thời gian thực - Incident Event Stream, Top đối tượng nguy cơ - Risk Artifacts) lại bị đẩy xuống tận đáy màn hình.

Mục tiêu tinh gọn:
- **Nguyên tắc "Command View"**: Nhìn thấy toàn bộ tình trạng an ninh và các chỉ số sống còn ngay tại màn hình đầu tiên (Above the fold).
- **Ưu tiên luồng điều tra (Incident-First)**: Đưa **Biểu đồ xu hướng (Alert Trend)** và **Dòng sự kiện nghiêm trọng (High-Severity Event Stream)** lên vị trí trung tâm ngay dưới chỉ số tư thế rủi ro.
- **Tổ chức thông tin dạng Tab (Progressive Disclosure)**: Gom các biểu đồ chuyên sâu ít phải tra cứu liên tục (Ma trận MITRE ATT&CK, Threat Keywords, MITRE Radar, Product Signals, Coverage & Automation) vào một khung **Deep-Dive Tabbed Panel** duy nhất, giúp giảm hơn **60%** chiều cao cuộn trang.

---

## 2. Chi Tiết Các Chức Năng Đã Tinh Gọn

| Khu vực | Hiện trạng ban đầu | Sau khi tinh gọn | Lợi ích mang lại |
|---|---|---|---|
| **Hero Command Header** | Chiếm banner lớn (~250px) với title to và nhiều khoảng trống | Banner thu gọn thanh lịch (`compact`), giữ nguyên narrative, trạng thái rủi ro, bộ lọc thời gian và 5 pills chỉ số cốt lõi | Tiết kiệm ~120px chiều cao màn hình, hiển thị tập trung |
| **KPI Posture Row** | 6 thẻ KPI + 3 thẻ Mean Time tách làm 2 hàng rời rạc, làm loãng các số liệu ưu tiên | Tách rõ: Hàng trên là **3 KPI rủi ro cốt lõi** (Open Critical Cases, Critical/High Alerts, Automation Success); Hàng dưới là **3 đồng hồ phản ứng** (MTTD, MTTA, MTTR) | Trực quan, số liệu to rõ, không bị dàn trải |
| **Operations Row** | Biểu đồ Alert Trend nằm lẻ loi ở hàng thứ 4 | Đặt **Alert Trend** song song với **High-Severity Event Stream** (có thanh cuộn ticker mượt mà) | Xem được cùng lúc cả độ thị xu hướng và danh sách sự kiện nguy hiểm mà **không cần scroll** |
| **Entity & Triage Row** | Phân tán ở các khu vực khác nhau | Gom thành bộ 3 cân bằng: **Entity Risk Focus** (Top IP/tài khoản nguy cơ) + **Severity Pressure** + **Case Workload State** | Đánh giá ngay bề mặt tấn công và tải xử lý của đội ngũ SOC |
| **Deep-Dive Panel** | Xếp chồng 5 biểu đồ lớn theo chiều dọc (Keywords, Radar, Heatmap, Automation, Coverage) | Gom thành 1 Card duy nhất tích hợp **Ant Design Tabs** gồm 5 tab chuyên sâu | Giảm triệt để việc cuộn chuột, chuyển đổi nhanh giữa các góc nhìn tình báo |

---

## 3. Vị Trí Các File & Hàm/Component Đã Chỉnh Sửa

### 3.1. `frontend/src/pages/Dashboard.tsx`

| Component / Hàm | Vị trí (Dòng) | Nội dung thay đổi |
|---|---|---|
| **Imports** | Dòng 1 - 34 | Bổ sung `Tabs` từ `antd`, thêm icons `Activity`, `BookOpen` từ `lucide-react` phục vụ giao diện tab chuyên sâu. |
| **`generatedAtLabel()`** | Dòng 168 - 171 | Rút gọn format thời gian ngắn gọn hiển thị giờ phút giây thay vì full datetime. |
| **`ChartPanel()`** | Dòng 342 - 348 | Bổ sung prop `extra?: ReactNode` cho phép nhúng badge/actions vào tiêu đề card. |
| **`AlertTrend()`** | Dòng 350 - 363 | Tăng chiều cao biểu đồ từ `190px` lên `230px` để tương thích kích thước chuẩn song song với event stream. |
| **`CoveragePanel()`** | Dòng 633 - 656 | Tích hợp thêm các chỉ số tổng quan hệ thống (`total_cases`, `total_artifacts`, `total_knowledge`) vào danh sách chip thống kê. |
| **`RiskArtifacts()`** | Dòng 658 - 676 | Chuẩn hóa hiển thị tối đa 6 đối tượng nguy cơ hàng đầu dạng thẻ lưới gọn gàng. |
| **`HighlightStream()`** | Dòng 678 - 718 | Bọc trong container `.dashboard-event-stream-container` có scrollbar cyberpunk mượt mà, tối ưu hiển thị live ticker. |
| **`Dashboard()` (Main Page)** | Dòng 768 - 975 | Tái cấu trúc toàn bộ cây layout: <br>1. Hero `.compact`<br>2. Posture Grid với `.posture-kpis.compact-3`<br>3. Operations Main Grid (`AlertTrend` + `HighlightStream`)<br>4. Landscape Triage Grid (`RiskArtifacts` + `SeverityPressure` + `CaseWorkloadState`)<br>5. Deep-Dive Card tích hợp `<Tabs>` 5 tab. |

### 3.2. `frontend/src/pages/Dashboard.css`

| Class / Khối CSS | Vị trí | Tác dụng |
|---|---|---|
| `.dashboard-grid.posture-kpis.compact-3` | Dòng 276 - 279 | Grid 3 cột cho 3 thẻ KPI ưu tiên cao nhất của SOC. |
| `.dashboard-grid.operations-main` | Dòng 285 - 290 | Grid 2 cột chia tỉ lệ 1.2 : 1 kết hợp Alert Trend và Live Event Feed. |
| `.dashboard-grid.landscape-triage` | Dòng 291 - 296 | Grid 3 cột cân đối cho Entity Risk, Mức độ nghiêm trọng và Trạng thái Case. |
| `.dashboard-hero.compact` | Dòng 1033 - 1073 | Style thu gọn hero: giảm padding, giảm kích thước font title từ 32px xuống 24px, thu gọn khoảng cách command pill. |
| `.dashboard-event-stream-container` | Dòng 1083 - 1107 | Cấu hình chiều cao cố định (250px), overflow-y auto với thanh cuộn neon xanh đặc trưng. |
| `.dashboard-card-badge` | Dòng 1109 - 1118 | Badge hiển thị số lượng sự kiện trên góc card. |
| `.dashboard-tabs` & `.dashboard-deepdive-grid` | Dòng 1120 - 1167 | Tùy biến Ant Design Tabs theo phong cách cyberpunk dark theme (hiệu ứng glow, ink-bar gradient, text-shadow). |
| `@media (max-width: 1380px)` & `1180px` | Dòng 1169 - 1208 | Cập nhật responsive chuyển đổi mượt mà giữa màn hình laptop, desktop và tablet. |

---

## 4. Kết Quả Sau Khi Hoàn Thành

1. **Hiệu suất thị giác**: Người trực ca SOC ngay khi mở dashboard sẽ nắm bắt tức thì:
   - Điểm rủi ro tổng hợp (Risk Index) & Posture (Critical / Elevated / Guarded / Stable).
   - Số case nguy cấp chưa xử lý & Cảnh báo Critical/High.
   - Nhịp tim hệ thống: Biểu đồ biến thiên cảnh báo theo thời gian thực + Danh sách sự kiện mới nhất.
2. **Không còn tình trạng cuộn trang mệt mỏi**: Toàn bộ dữ liệu tác chiến gói gọn trên 2 màn hình chuẩn (thay vì 5-6 màn hình như trước).
3. **Giữ nguyên 100% dữ liệu gốc**: Không lược bỏ bất kỳ thông tin nào, toàn bộ các chỉ số chi tiết về MITRE, Keywords, Automation và Coverage đều được tổ chức ngăn nắp vào Tab Deep-Dive.
