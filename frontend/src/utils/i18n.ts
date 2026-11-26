import type {ChoiceOption} from '../types/records'

export const DISPLAY_DATE_LOCALE = 'vi-VN'

export const SEVERITY_LABELS: Record<string, string> = {
  Unknown: 'Không xác định',
  Informational: 'Thông tin',
  Info: 'Thông tin',
  Low: 'Thấp',
  Medium: 'Trung bình',
  High: 'Cao',
  Critical: 'Nghiêm trọng',
}

export const CASE_STATUS_LABELS: Record<string, string> = {
  New: 'Mới',
  'In Progress': 'Đang xử lý',
  'On Hold': 'Tạm hoãn',
  Resolved: 'Đã giải quyết',
  Closed: 'Đã đóng',
  Suppressed: 'Đã ẩn',
  Archived: 'Đã lưu trữ',
  Deleted: 'Đã xóa',
  Unknown: 'Không xác định',
  Other: 'Khác',
}

export const VERDICT_LABELS: Record<string, string> = {
  Unknown: 'Chưa xác định',
  'False Positive': 'Cảnh báo giả',
  'True Positive': 'Cảnh báo thật',
  Disregard: 'Bỏ qua',
  Suspicious: 'Đáng ngờ',
  Benign: 'Lành tính',
  Test: 'Kiểm thử',
  'Insufficient Data': 'Thiếu dữ liệu',
  'Security Risk': 'Rủi ro bảo mật',
  'Managed Externally': 'Xử lý bên ngoài',
  Duplicate: 'Trùng lặp',
  Other: 'Khác',
}

export const KNOWLEDGE_SOURCE_LABELS: Record<string, string> = {
  Manual: 'Thủ công',
  Case: 'Từ vụ việc',
}

export const ARTIFACT_ROLE_LABELS: Record<string, string> = {
  Unknown: 'Không xác định',
  Target: 'Đích',
  Actor: 'Tác nhân',
  Affected: 'Bị ảnh hưởng',
  Related: 'Liên quan',
  Other: 'Khác',
}

export const ALERT_ACTION_LABELS: Record<string, string> = {
  Unknown: 'Không xác định',
  Allowed: 'Cho phép',
  Denied: 'Từ chối',
  Observed: 'Quan sát',
  Modified: 'Đã chỉnh sửa',
  Other: 'Khác',
}

export const ALERT_DISPOSITION_LABELS: Record<string, string> = {
  Unknown: 'Không xác định',
  Allowed: 'Đã cho phép',
  Blocked: 'Đã chặn',
  Quarantined: 'Đã cách ly',
  Isolated: 'Đã cô lập',
  Deleted: 'Đã xóa',
  Dropped: 'Đã loại bỏ',
  'Custom Action': 'Hành động tùy chỉnh',
  Approved: 'Đã phê duyệt',
  Restored: 'Đã khôi phục',
  Exonerated: 'Đã miễn trừ',
  Corrected: 'Đã khắc phục',
  'Partially Corrected': 'Khắc phục một phần',
  Uncorrected: 'Chưa khắc phục',
  Delayed: 'Bị trì hoãn',
  Detected: 'Phát hiện',
  'No Action': 'Không hành động',
  Logged: 'Đã ghi log',
  Tagged: 'Đã gắn thẻ',
  Alert: 'Cảnh báo',
  Count: 'Đã đếm',
  Reset: 'Đặt lại',
  Captcha: 'CAPTCHA',
  Challenge: 'Thử thách xác thực',
  'Access Revoked': 'Đã thu hồi truy cập',
  Rejected: 'Bị từ chối',
  Unauthorized: 'Không có quyền',
  Error: 'Lỗi',
  Other: 'Khác',
}

export const ALERT_ANALYTIC_TYPE_LABELS: Record<string, string> = {
  Unknown: 'Không xác định',
  Rule: 'Quy tắc',
  Behavioral: 'Hành vi',
  Statistical: 'Thống kê',
  'Learning (ML/DL)': 'Học máy (ML/DL)',
  Fingerprinting: 'Dấu vân tay',
  Tagging: 'Gắn thẻ',
  'Keyword Match': 'Khớp từ khóa',
  'Regular Expressions': 'Biểu thức chính quy',
  'Exact Data Match': 'Khớp chính xác',
  'Partial Data Match': 'Khớp một phần',
  'Indexed Data Match': 'Khớp chỉ mục',
  Other: 'Khác',
}

export const ALERT_ANALYTIC_STATE_LABELS: Record<string, string> = {
  Unknown: 'Không xác định',
  Active: 'Đang hoạt động',
  Suppressed: 'Đã ẩn',
  Experimental: 'Thử nghiệm',
  Other: 'Khác',
}

export const ALERT_POLICY_TYPE_LABELS: Record<string, string> = {
  'Identity Policy': 'Chính sách định danh',
  'Resource Policy': 'Chính sách tài nguyên',
  'Service Control Policy': 'Chính sách kiểm soát dịch vụ',
  'Access Control Policy': 'Chính sách kiểm soát truy cập',
  Other: 'Khác',
}

export const PRODUCT_CATEGORY_LABELS: Record<string, string> = {
  ThreatIntelligence: 'Tình báo mối đe dọa',
  Other: 'Khác',
}

export const ENRICHMENT_TYPE_LABELS: Record<string, string> = {
  Unknown: 'Không xác định',
  Other: 'Khác',
  'Threat Intelligence': 'Tình báo mối đe dọa',
  Reputation: 'Độ uy tín',
  'Geo Location': 'Vị trí địa lý',
  'Passive DNS': 'DNS thụ động',
  Certificate: 'Chứng chỉ số',
  'Malware Analysis': 'Phân tích mã độc',
  Vulnerability: 'Lỗ hổng bảo mật',
  Exposure: 'Mức độ phơi nhiễm',
  Asset: 'Tài sản',
  Identity: 'Định danh',
  Authentication: 'Xác thực',
  Authorization: 'Phân quyền',
  Behavior: 'Hành vi',
  Detection: 'Phát hiện',
  Correlation: 'Tương quan',
  History: 'Lịch sử',
  Remediation: 'Khắc phục',
  Observation: 'Quan sát',
  'External Ticket': 'Ticket bên ngoài',
}

export const ARTIFACT_TYPE_LABELS: Record<string, string> = {
  Unknown: 'Không xác định',
  Hostname: 'Tên máy chủ (Hostname)',
  'IP Address': 'Địa chỉ IP',
  'MAC Address': 'Địa chỉ MAC',
  'User Name': 'Tên người dùng',
  'Email Address': 'Địa chỉ Email',
  'URL String': 'Chuỗi URL',
  'File Name': 'Tên tệp',
  Hash: 'Mã băm (Hash)',
  'Process Name': 'Tên tiến trình',
  'Resource UID': 'UID tài nguyên',
  Port: 'Cổng (Port)',
  Subnet: 'Mạng con (Subnet)',
  'Command Line': 'Dòng lệnh',
  Country: 'Quốc gia',
  'Process ID': 'ID tiến trình',
  Endpoint: 'Thiết bị đầu cuối',
  User: 'Người dùng',
  File: 'Tệp tin',
  Process: 'Tiến trình',
  'Geo Location': 'Vị trí địa lý',
  Group: 'Nhóm',
  Account: 'Tài khoản',
  'Script Content': 'Nội dung Script',
  'Serial Number': 'Số sê-ri',
  Resource: 'Tài nguyên',
  Message: 'Thông điệp',
  Advisory: 'Khuyến cáo',
  'File Path': 'Đường dẫn tệp',
  Device: 'Thiết bị',
  'Registry Path': 'Đường dẫn Registry',
  Other: 'Khác',
}

export const PLAYBOOK_JOB_STATUS_LABELS: Record<string, string> = {
  'Awaiting Approval': 'Chờ phê duyệt',
  Success: 'Thành công',
  Failed: 'Thất bại',
  Pending: 'Đang chờ',
  Running: 'Đang chạy',
  Rejected: 'Đã từ chối',
}

export const WORKER_STATE_LABELS: Record<string, string> = {
  Starting: 'Đang khởi động',
  Idle: 'Nhàn rỗi',
  Running: 'Đang chạy',
  Degraded: 'Suy giảm',
  Down: 'Ngừng hoạt động',
}

export const COVERAGE_STATE_LABELS: Record<string, string> = {
  Evaluated: 'Đã đánh giá',
  'No prediction': 'Chưa có dự đoán',
  'Invalid prediction': 'Dự đoán không hợp lệ',
}

export const AI_FIELD_LABELS: Record<string, string> = {
  verdict: 'Phán quyết',
  severity: 'Mức độ nghiêm trọng',
  impact: 'Tác động',
  priority: 'Độ ưu tiên',
  confidence: 'Độ tin cậy',
  summary: 'Tóm tắt',
}

export const USER_ROLE_LABELS: Record<string, string> = {
  admin: 'Quản trị viên',
  user: 'Người dùng',
  viewer: 'Chỉ xem',
}

export const AUDIT_ACTION_LABELS: Record<string, string> = {
  create: 'Tạo mới',
  update: 'Cập nhật',
  delete: 'Xóa',
  linked: 'Liên kết',
  unlinked: 'Hủy liên kết',
  deleted: 'Đã xóa',
  reveal: 'Xem bí mật',
  test: 'Kiểm tra',
}

export const INBOX_KIND_LABELS: Record<string, string> = {
  system: 'Hệ thống',
  user: 'Người dùng',
}

export const RELATIONSHIP_TYPE_LABELS: Record<string, string> = {
  Related: 'Liên quan',
  'Duplicate of': 'Trùng với',
  'Parent of': 'Vụ việc cha của',
}

const CHOICE_LABEL_LOOKUP: Record<string, string> = {
  ...ARTIFACT_TYPE_LABELS,
  ...ENRICHMENT_TYPE_LABELS,
  ...ALERT_POLICY_TYPE_LABELS,
  ...ALERT_ANALYTIC_STATE_LABELS,
  ...ALERT_ANALYTIC_TYPE_LABELS,
  ...ALERT_DISPOSITION_LABELS,
  ...ALERT_ACTION_LABELS,
  ...ARTIFACT_ROLE_LABELS,
  ...KNOWLEDGE_SOURCE_LABELS,
  ...CASE_STATUS_LABELS,
  ...VERDICT_LABELS,
  ...SEVERITY_LABELS,
  ...PLAYBOOK_JOB_STATUS_LABELS,
  ...COVERAGE_STATE_LABELS,
  ...RELATIONSHIP_TYPE_LABELS,
  ...PRODUCT_CATEGORY_LABELS,
}

export function localizeWithMap(value: unknown, lookup: Record<string, string>, fallback = '—'): string {
  if (value === null || value === undefined || value === '') return fallback
  const text = String(value)
  return lookup[text] || text
}

export function localizeChoiceLabel(value: unknown): string {
  if (value === null || value === undefined || value === '') return ''
  const text = String(value)
  return CHOICE_LABEL_LOOKUP[text] || text
}

export function localizeChoiceOptions(
  options?: ChoiceOption[],
  lookup: Record<string, string> = CHOICE_LABEL_LOOKUP,
): ChoiceOption[] {
  if (!options) return []
  return options.map((option) => ({
    ...option,
    label: lookup[String(option.value)] || (typeof option.label === 'string' ? lookup[option.label] || option.label : option.label),
  }))
}

export function localizeAiFieldList(fields: string[]): string {
  return fields.map((field) => AI_FIELD_LABELS[field] || field).join(', ')
}
