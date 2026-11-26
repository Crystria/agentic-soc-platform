import {type ReactNode} from 'react'
import {Card, Flex, Typography} from 'antd'
import {
  alertActionTag,
  alertAnalyticTypeTag,
  alertDispositionTag,
  artifactRoleTag,
  caseCategoryTag,
  choiceTag,
  enrichmentTypeTag,
  knowledgeSourceTag,
  localizedChoiceTag,
  productCategoryTag,
  severityTag,
  statusTag,
  verdictTag,
} from '../utils/recordDisplay'
import {
  ALERT_ANALYTIC_STATE_LABELS,
  ALERT_POLICY_TYPE_LABELS,
  ARTIFACT_TYPE_LABELS,
  AUDIT_ACTION_LABELS,
  INBOX_KIND_LABELS,
  localizeWithMap,
  PLAYBOOK_JOB_STATUS_LABELS,
  USER_ROLE_LABELS,
} from '../utils/i18n'

type TagPreviewField = {
  title: string
  values: string[]
  render: (value: string) => ReactNode
  note?: string
}

type TagPreviewGroup = {
  title: string
  fields: TagPreviewField[]
}

const severityValues = ['Unknown', 'Informational', 'Low', 'Medium', 'High', 'Critical']
const confidenceValues = ['Unknown', 'Low', 'Medium', 'High']
const impactValues = ['Unknown', 'Low', 'Medium', 'High', 'Critical']
const priorityValues = ['Unknown', 'Low', 'Medium', 'High', 'Critical']
const riskLevelValues = ['Info', 'Low', 'Medium', 'High', 'Critical', 'Other']
const alertStatusValues = ['Unknown', 'New', 'In Progress', 'Suppressed', 'Resolved', 'Archived', 'Deleted', 'Other']
const caseCategoryValues = ['DLP', 'Email', 'OT', 'Proxy', 'UEBA', 'ThreatIntelligence', 'IAM', 'EDR', 'NDR', 'Cloud', 'SIEM', 'WAF', 'Other']
const verdictValues = ['Unknown', 'False Positive', 'True Positive', 'Disregard', 'Suspicious', 'Benign', 'Test', 'Insufficient Data', 'Security Risk', 'Managed Externally', 'Duplicate', 'Other']
const alertDispositionValues = ['Unknown', 'Allowed', 'Blocked', 'Quarantined', 'Isolated', 'Deleted', 'Dropped', 'Custom Action', 'Approved', 'Restored', 'Exonerated', 'Corrected', 'Partially Corrected', 'Uncorrected', 'Delayed', 'Detected', 'No Action', 'Logged', 'Tagged', 'Alert', 'Count', 'Reset', 'Captcha', 'Challenge', 'Access Revoked', 'Rejected', 'Unauthorized', 'Error', 'Other']
const alertActionValues = ['Unknown', 'Allowed', 'Denied', 'Observed', 'Modified', 'Other']
const alertAnalyticTypeValues = ['Unknown', 'Rule', 'Behavioral', 'Statistical', 'Learning (ML/DL)', 'Fingerprinting', 'Tagging', 'Keyword Match', 'Regular Expressions', 'Exact Data Match', 'Partial Data Match', 'Indexed Data Match', 'Other']
const alertAnalyticStateValues = ['Unknown', 'Active', 'Suppressed', 'Experimental', 'Other']
const alertPolicyTypeValues = ['Identity Policy', 'Resource Policy', 'Service Control Policy', 'Access Control Policy', 'Other']
const productCategoryValues = ['DLP', 'Email', 'OT', 'Proxy', 'UEBA', 'ThreatIntelligence', 'IAM', 'EDR', 'NDR', 'Cloud', 'SIEM', 'WAF', 'Other']
const artifactTypeValues = ['Unknown', 'Hostname', 'IP Address', 'MAC Address', 'User Name', 'Email Address', 'URL String', 'File Name', 'Hash', 'Process Name', 'Resource UID', 'Port', 'Subnet', 'Command Line', 'Country', 'Process ID', 'HTTP User-Agent', 'CWE', 'CVE', 'User Credential ID', 'Endpoint', 'User', 'Email', 'Uniform Resource Locator', 'File', 'Process', 'Geo Location', 'Container', 'Registry', 'Fingerprint', 'Group', 'Account', 'Script Content', 'Serial Number', 'Resource', 'Message', 'Advisory', 'File Path', 'Device', 'Registry Path', 'Other']
const artifactNameValues = ['Unknown', 'Other', 'Source', 'Destination', 'Client', 'Server', 'Actor', 'Target', 'Affected', 'Related', 'Observed', 'Request', 'Response', 'Source IP', 'Destination IP', 'Client IP', 'Server IP', 'Remote IP', 'Local IP', 'NAT IP', 'Proxy IP', 'Forwarded IP', 'DNS Server IP', 'DHCP Server IP', 'VPN IP', 'Source Port', 'Destination Port', 'Client Port', 'Server Port', 'Source MAC', 'Destination MAC', 'Device MAC', 'Domain', 'Source Domain', 'Destination Domain', 'Request Domain', 'DNS Query Name', 'DNS Answer', 'DNS Record', 'URL', 'Request URL', 'Referrer URL', 'Redirect URL', 'Landing URL', 'Phishing URL', 'Callback URL', 'Download URL', 'HTTP Method', 'HTTP User-Agent', 'HTTP Host', 'HTTP Path', 'HTTP Query', 'HTTP Status Code', 'HTTP Request Body', 'HTTP Response Body', 'User', 'User Name', 'User ID', 'User SID', 'User UPN', 'User Email', 'Source User', 'Destination User', 'Actor User', 'Target User', 'Affected User', 'Executing User', 'Logon User', 'Login User', 'Principal User', 'Initiating User', 'Requesting User', 'Owner User', 'Account', 'Account ID', 'Account Name', 'Service Account', 'Admin Account', 'Cloud Account', 'AWS Account ID', 'Azure Tenant ID', 'Azure Subscription ID', 'GCP Project ID', 'Credential ID', 'Access Key ID', 'API Key ID', 'Token ID', 'Session ID', 'Host', 'Hostname', 'Host ID', 'Source Host', 'Destination Host', 'Affected Host', 'Target Host', 'Device', 'Device ID', 'Device Name', 'Endpoint', 'Endpoint ID', 'Asset ID', 'Agent ID', 'Sensor ID', 'Operating System', 'Host OS', 'Host IP', 'Host MAC', 'Host Serial Number', 'Process', 'Process Name', 'Process ID', 'Process Path', 'Process Executable', 'Process Command Line', 'Process Hash', 'Parent Process', 'Parent Process Name', 'Parent Process ID', 'Parent Process Path', 'Parent Process Command Line', 'Parent Process Hash', 'Child Process', 'Child Process Name', 'Child Process ID', 'Child Process Command Line', 'Acting Process', 'Target Process', 'Injected Process', 'File', 'File Name', 'File Path', 'File Extension', 'File Directory', 'File Size', 'File Hash', 'File MD5', 'File SHA1', 'File SHA256', 'File SHA512', 'File Imphash', 'File Signature', 'File Publisher', 'File Owner', 'Download File', 'Attachment File', 'Dropped File', 'Target File', 'Email', 'Sender Email', 'Recipient Email', 'CC Email', 'BCC Email', 'Reply-To Email', 'Return-Path Email', 'Mail From', 'Mail To', 'Mail Subject', 'Mail Message ID', 'Mail Attachment', 'Mail URL', 'Mail Domain', 'Sender Domain', 'Recipient Domain', 'Cloud Resource', 'Cloud Resource ID', 'Cloud Resource Name', 'Cloud Resource ARN', 'Cloud Region', 'Cloud Zone', 'Cloud Service', 'Cloud Role', 'Cloud Policy', 'Cloud Policy ARN', 'Cloud Instance ID', 'Cloud Bucket', 'Cloud Storage Object', 'Cloud Function', 'CloudTrail Event ID', 'Cloud Request ID', 'IAM User', 'IAM Role', 'IAM Group', 'IAM Policy', 'IAM Policy ARN', 'IAM Permission', 'IAM Action', 'IAM Resource', 'Assumed Role', 'Access Key', 'Secret Key ID', 'Permission Set', 'Registry Key', 'Registry Value', 'Registry Path', 'Registry Data', 'Windows Service', 'Scheduled Task', 'WMI Object', 'COM Object', 'Named Pipe', 'Mutex', 'Container', 'Container ID', 'Container Name', 'Container Image', 'Container Image ID', 'Pod', 'Pod Name', 'Namespace', 'Kubernetes Cluster', 'Kubernetes Node', 'Kubernetes Service Account', 'CVE', 'CWE', 'CPE', 'CVSS Score', 'Vulnerable Product', 'Malware Name', 'Malware Family', 'Threat Actor', 'Threat Campaign', 'Attack Technique', 'Attack Tactic', 'IOC', 'YARA Rule', 'Sigma Rule']
const artifactRoleValues = ['Unknown', 'Target', 'Actor', 'Affected', 'Related', 'Other']
const enrichmentTypeValues = ['Unknown', 'Other', 'Threat Intelligence', 'Reputation', 'Geo Location', 'WHOIS', 'DNS', 'Passive DNS', 'Certificate', 'Sandbox', 'Malware Analysis', 'Vulnerability', 'Exposure', 'Asset', 'CMDB', 'Identity', 'Authentication', 'Authorization', 'Behavior', 'Detection', 'Correlation', 'History', 'Remediation', 'Observation', 'External Ticket']
const enrichmentProviderSamples = ['Unknown', 'Other', 'Jira', 'ServiceNow', 'Slack', 'ASP', 'Internal', 'AlienVaultOTX', 'VirusTotal', 'AbuseIPDB', 'Splunk', 'Elastic', 'Microsoft Sentinel', 'CrowdStrike', 'Okta', 'AWS', 'Azure', 'Google Cloud', 'Cloudflare', 'Qualys', 'Tenable', 'MANUAL']
const playbookTagValues = ['System', 'LLM', 'Case', 'Knowledge', 'CMDB', 'Threat Intel', 'Enrichment', 'Custom']
const llmTagValues = ['fast', 'powerful', 'tool_calling', 'structured_output']

const fixedColorTag = (color: string) => (value: string) => choiceTag(value, color)
const localizedColorTag = (lookup: Record<string, string>, color: string) => (value: string) => localizedChoiceTag(value, lookup, color)
const sourceTag = (value: string) => choiceTag(value === 'custom' ? 'Tùy chỉnh' : 'Chính thức', value === 'custom' ? 'blue' : 'gold')
const playbookTag = (value: string) => {
  const colors: Record<string, string> = { System: 'gold', LLM: 'purple', Case: 'green', Knowledge: 'magenta', CMDB: 'geekblue', 'Threat Intel': 'volcano', Enrichment: 'cyan', Custom: 'blue' }
  return choiceTag(value, colors[value] || 'blue')
}
const siemBackendTag = (value: string) => choiceTag(value, ({ ELK: 'orange', Splunk: 'green' } as Record<string, string>)[value] || 'default')
const auditActionTag = (value: string) => choiceTag(localizeWithMap(value, AUDIT_ACTION_LABELS), ({ create: 'green', update: 'blue', delete: 'red', linked: 'cyan', unlinked: 'orange', deleted: 'red' } as Record<string, string>)[value] || 'default')
const inboxKindTag = (value: string) => choiceTag(localizeWithMap(value, INBOX_KIND_LABELS), value === 'system' ? 'purple' : 'blue')
const userRoleTag = (value: string) => choiceTag(localizeWithMap(value, USER_ROLE_LABELS), ({ admin: 'purple', user: 'blue', viewer: 'default' } as Record<string, string>)[value])
const authTypeTag = (value: string) => choiceTag(value === 'ldap' ? 'LDAP' : 'Nội bộ', value === 'ldap' ? 'geekblue' : 'green')
const activeStatusTag = (value: string) => choiceTag(value === 'true' ? 'Hoạt động' : 'Vô hiệu', value === 'true' ? 'green' : 'red')
const llmProviderStatusTag = (value: string) => choiceTag(value === 'true' ? 'Bật' : 'Tắt', value === 'true' ? 'green' : 'default')
const llmTag = (value: string) => choiceTag(value, ({ fast: 'blue', powerful: 'purple', tool_calling: 'geekblue', structured_output: 'green' } as Record<string, string>)[value] || 'default')
const statusLabelTag = (value: string) => choiceTag(localizeWithMap(value, PLAYBOOK_JOB_STATUS_LABELS), ({ Success: 'green', Failed: 'red', Pending: 'gold', Running: 'processing' } as Record<string, string>)[value] || 'default')

const tagPreviewGroups: TagPreviewGroup[] = [
  {
    title: 'Vụ việc',
    fields: [
      { title: 'Danh mục vụ việc', values: caseCategoryValues, render: caseCategoryTag },
      { title: 'Mức độ nghiêm trọng / (AI)', values: severityValues, render: severityTag },
      { title: 'Độ tin cậy / (AI)', values: confidenceValues, render: severityTag },
      { title: 'Tác động / (AI)', values: impactValues, render: severityTag },
      { title: 'Độ ưu tiên / (AI)', values: priorityValues, render: severityTag },
      { title: 'Phán quyết / (AI)', values: verdictValues, render: verdictTag },
      { title: 'Thẻ vụ việc', values: ['triage', 'vip', 'needs-review'], render: fixedColorTag('blue'), note: 'Danh sách thẻ tự do; hiển thị các giá trị mẫu.' },
    ],
  },
  {
    title: 'Cảnh báo',
    fields: [
      { title: 'Trạng thái cảnh báo', values: alertStatusValues, render: statusTag },
      { title: 'Mức độ nghiêm trọng', values: severityValues, render: severityTag },
      { title: 'Độ tin cậy', values: confidenceValues, render: severityTag },
      { title: 'Tác động', values: impactValues, render: severityTag },
      { title: 'Mức rủi ro', values: riskLevelValues, render: severityTag },
      { title: 'Xử lý (Disposition)', values: alertDispositionValues, render: alertDispositionTag },
      { title: 'Hành động', values: alertActionValues, render: alertActionTag },
      { title: 'Danh mục sản phẩm', values: productCategoryValues, render: productCategoryTag },
      { title: 'Loại phân tích', values: alertAnalyticTypeValues, render: alertAnalyticTypeTag },
      { title: 'Trạng thái phân tích', values: alertAnalyticStateValues, render: localizedColorTag(ALERT_ANALYTIC_STATE_LABELS, 'green') },
      { title: 'Loại chính sách', values: alertPolicyTypeValues, render: localizedColorTag(ALERT_POLICY_TYPE_LABELS, 'volcano') },
      { title: 'Hãng / Tên / Tính năng sản phẩm', values: ['Elastic', 'Microsoft Sentinel', 'Defender XDR'], render: fixedColorTag('blue'), note: 'Trường sản phẩm nhập tự do; hiển thị giá trị mẫu.' },
      { title: 'Nhãn cảnh báo', values: ['phishing', 'endpoint', 'critical-path'], render: fixedColorTag('blue'), note: 'Danh sách thẻ tự do; hiển thị giá trị mẫu.' },
      { title: 'Nguồn dữ liệu', values: ['edr', 'siem', 'proxy'], render: fixedColorTag('cyan'), note: 'Danh sách thẻ tự do; hiển thị giá trị mẫu.' },
    ],
  },
  {
    title: 'Thực thể và Làm giàu dữ liệu',
    fields: [
      { title: 'Loại thực thể', values: artifactTypeValues, render: localizedColorTag(ARTIFACT_TYPE_LABELS, 'geekblue') },
      { title: 'Tên thực thể', values: artifactNameValues, render: fixedColorTag('cyan') },
      { title: 'Vai trò thực thể', values: artifactRoleValues, render: artifactRoleTag },
      { title: 'Loại làm giàu dữ liệu', values: enrichmentTypeValues, render: enrichmentTypeTag },
      { title: 'Nhà cung cấp làm giàu dữ liệu', values: enrichmentProviderSamples, render: fixedColorTag('purple'), note: 'Danh sách nhà cung cấp dài; phần xem trước liệt kê các nhãn phổ biến thường dùng màu tím.' },
    ],
  },
  {
    title: 'Tri thức, Playbook, Người dùng và Cài đặt',
    fields: [
      { title: 'Nguồn tri thức', values: ['Manual', 'Case'], render: knowledgeSourceTag },
      { title: 'Thẻ tri thức', values: ['runbook', 'case-note', 'retention'], render: fixedColorTag('blue'), note: 'Danh sách thẻ tự do; hiển thị giá trị mẫu.' },
      { title: 'Trạng thái tác vụ Playbook', values: ['Success', 'Failed', 'Pending', 'Running'], render: statusLabelTag },
      { title: 'Nguồn định nghĩa Playbook', values: ['official', 'custom'], render: sourceTag },
      { title: 'Thẻ định nghĩa Playbook', values: playbookTagValues, render: playbookTag },
      { title: 'Vai trò người dùng', values: ['admin', 'user', 'viewer'], render: userRoleTag },
      { title: 'Kiểu xác thực', values: ['local', 'ldap'], render: authTypeTag },
      { title: 'Trạng thái người dùng', values: ['true', 'false'], render: activeStatusTag },
      { title: 'Trạng thái nhà cung cấp LLM', values: ['true', 'false'], render: llmProviderStatusTag },
      { title: 'Thẻ nhà cung cấp LLM', values: llmTagValues, render: llmTag },
    ],
  },
  {
    title: 'Bảng điều khiển tùy chỉnh và Giao diện hệ thống',
    fields: [
      { title: 'SIEM YAML Backend', values: ['ELK', 'Splunk'], render: siemBackendTag },
      { title: 'SIEM YAML Key Field', values: ['Trường khóa'], render: fixedColorTag('blue') },
      { title: 'Hành động nhật ký (Audit)', values: ['create', 'update', 'delete', 'linked', 'unlinked', 'deleted'], render: auditActionTag },
      { title: 'Loại tin nhắn Hộp thư', values: ['system', 'user'], render: inboxKindTag },
      { title: 'Loại thực thể rủi ro trên Tổng quan', values: ['IP Address', 'Hostname', 'User'], render: localizedColorTag(ARTIFACT_TYPE_LABELS, 'blue'), note: 'Dữ liệu lấy thực tế từ Tổng quan; đây là giá trị mẫu.' },
      { title: 'Vai trò thực thể rủi ro trên Tổng quan', values: artifactRoleValues, render: fixedColorTag('purple'), note: 'Tổng quan dùng thẻ tím cho giá trị vai trò.' },
    ],
  },
]

function TagPreviewSection({ field }: { field: TagPreviewField }) {
  return (
    <Card size="small" title={field.title} styles={{ body: { padding: 12 } }}>
      <Flex wrap gap={8}>
        {field.values.map((value) => (
          <span key={`${field.title}-${value}`}>{field.render(value)}</span>
        ))}
      </Flex>
      {field.note ? <Typography.Text type="secondary" style={{ display: 'block', marginTop: 8 }}>{field.note}</Typography.Text> : null}
    </Card>
  )
}

export default function TagPreviewSettings() {
  return (
    <div style={{ height: '100%', minHeight: 0, overflow: 'auto' }}>
      <Flex vertical gap={16}>
        {tagPreviewGroups.map((group) => (
          <Card key={group.title} title={group.title}>
            <Flex vertical gap={12}>
              {group.fields.map((field) => (
                <TagPreviewSection key={field.title} field={field} />
              ))}
            </Flex>
          </Card>
        ))}
      </Flex>
    </div>
  )
}
