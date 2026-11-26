import {Button, Descriptions} from 'antd'
import DetailSectionDivider from './DetailSectionDivider'
import JsonViewer from './JsonViewer'
import {localizeChoiceLabel} from '../utils/i18n'
import {alertActionTag, alertAnalyticTypeTag, alertDispositionTag, choiceTag, emptyValue, formatDateTime, productCategoryTag, severityTag, statusTag} from '../utils/recordDisplay'
import TagList from './TagList'
import {monoTextStyle} from '../utils/typography'

type RecordRow = Record<string, unknown>

interface AlertBasicViewProps {
  record: RecordRow
  onOpenResource?: (resourceKey: string, rowId: string | number) => void
}

const value = (record: RecordRow, key: string) => record[key]
const stringValue = (record: RecordRow, key: string) => emptyValue(value(record, key))
const upperStringValue = (record: RecordRow, key: string) => {
  const displayValue = stringValue(record, key)
  return displayValue === '—' ? displayValue : displayValue.toUpperCase()
}
const mono = (children: string) => <span style={monoTextStyle}>{children}</span>
const block = (children: string) => <div style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{children}</div>
function Section({ title, children, showTitle = true }: { title: string; children: React.ReactNode; showTitle?: boolean }) {
  return (
    <div style={{ marginTop: showTitle ? 16 : 0 }}>
      {showTitle && (
        <DetailSectionDivider title={title} />
      )}
      <Descriptions
        size="small"
        layout="vertical"
        colon={false}
        column={4}
      >
        {children}
      </Descriptions>
    </div>
  )
}

export default function AlertBasicView({ record, onOpenResource }: AlertBasicViewProps) {
  const caseRowId = value(record, 'case_id') as string | number | null | undefined
  const caseReadableId = upperStringValue(record, 'case_readable_id')
  const caseDisplayId = caseReadableId !== '—'
    ? caseReadableId
    : upperStringValue(record, 'case_id')
  const canOpenCase = Boolean(caseRowId !== null && caseRowId !== undefined && onOpenResource)

  return (
    <div style={{ padding: '20px 20px 16px', overflow: 'auto', height: '100%', boxSizing: 'border-box' }}>
      <Section title="Cơ bản" showTitle={false}>
        <Descriptions.Item label="Mã cảnh báo">{mono(upperStringValue(record, 'alert_id'))}</Descriptions.Item>
        <Descriptions.Item label="Vụ việc">
          {canOpenCase && caseRowId !== null && caseRowId !== undefined ? (
            <Button
              type="link"
              size="small"
              style={{ padding: 0, height: 'auto' }}
              onClick={() => onOpenResource?.('cases', caseRowId)}
            >
              {caseDisplayId}
            </Button>
          ) : caseDisplayId}
        </Descriptions.Item>
        <Descriptions.Item label="Ghi nhận lần đầu">{formatDateTime(String(value(record, 'first_seen_time') || ''))}</Descriptions.Item>
        <Descriptions.Item label="Ghi nhận gần nhất">{formatDateTime(String(value(record, 'last_seen_time') || ''))}</Descriptions.Item>
        <Descriptions.Item label="Mức nghiêm trọng">{severityTag(String(value(record, 'severity') || ''))}</Descriptions.Item>
        <Descriptions.Item label="Độ tin cậy">{severityTag(String(value(record, 'confidence') || ''))}</Descriptions.Item>
        <Descriptions.Item label="Tác động">{severityTag(String(value(record, 'impact') || ''))}</Descriptions.Item>
        <Descriptions.Item label="Mức rủi ro">{severityTag(String(value(record, 'risk_level') || ''))}</Descriptions.Item>
        <Descriptions.Item label="Nhãn (Labels)" span={4}><TagList items={value(record, 'labels')} /></Descriptions.Item>
        <Descriptions.Item label="Mô tả" span={4}>{block(stringValue(record, 'desc'))}</Descriptions.Item>
      </Section>

      <Section title="Tương quan">
        <Descriptions.Item label="Mã quy tắc (Rule ID)">{mono(stringValue(record, 'rule_id'))}</Descriptions.Item>
        <Descriptions.Item label="Tên quy tắc (Rule)">{stringValue(record, 'rule_name')}</Descriptions.Item>
        <Descriptions.Item label="Correlation UID" span="filled">{mono(stringValue(record, 'correlation_uid'))}</Descriptions.Item>
      </Section>

      <Section title="MITRE ATT&CK và ATLAS">
        <Descriptions.Item label="Chiến thuật (Tactic)">{stringValue(record, 'tactic')}</Descriptions.Item>
        <Descriptions.Item label="Kỹ thuật (Technique)">{stringValue(record, 'technique')}</Descriptions.Item>
        <Descriptions.Item label="Kỹ thuật con">{stringValue(record, 'sub_technique')}</Descriptions.Item>
        <Descriptions.Item label="Giảm thiểu (Mitigation)">{stringValue(record, 'mitigation')}</Descriptions.Item>
      </Section>

      <Section title="Trạng thái, Xử lý & Khắc phục">
        <Descriptions.Item label="Kết quả xử lý nguồn">{alertDispositionTag(String(value(record, 'disposition') || ''))}</Descriptions.Item>
        <Descriptions.Item label="Hành động">{alertActionTag(String(value(record, 'action') || ''))}</Descriptions.Item>
        <Descriptions.Item label="Trạng thái" span="filled">{statusTag(String(value(record, 'status') || ''))}</Descriptions.Item>
        <Descriptions.Item label="Chi tiết trạng thái" span={4}>{block(stringValue(record, 'status_detail'))}</Descriptions.Item>
        <Descriptions.Item label="Khắc phục" span={4}>{block(stringValue(record, 'remediation'))}</Descriptions.Item>
      </Section>

      <Section title="Sản phẩm & Nguồn dữ liệu">
        <Descriptions.Item label="Danh mục sản phẩm">{productCategoryTag(String(value(record, 'product_category') || ''))}</Descriptions.Item>
        <Descriptions.Item label="Hãng sản xuất">{choiceTag(String(value(record, 'product_vendor') || ''), 'cyan')}</Descriptions.Item>
        <Descriptions.Item label="Tên sản phẩm">{choiceTag(String(value(record, 'product_name') || ''), 'cyan')}</Descriptions.Item>
        <Descriptions.Item label="Tính năng sản phẩm">{choiceTag(String(value(record, 'product_feature') || ''), 'cyan')}</Descriptions.Item>
        <Descriptions.Item label="Source URL">{mono(stringValue(record, 'src_url'))}</Descriptions.Item>
        <Descriptions.Item label="Source UID">{mono(stringValue(record, 'source_uid'))}</Descriptions.Item>
        <Descriptions.Item label="Nguồn dữ liệu" span={2}><TagList items={value(record, 'data_sources')} color="cyan" /></Descriptions.Item>
      </Section>

      <Section title="Phân tích & Chính sách">
        <Descriptions.Item label="Tên bộ phân tích">{stringValue(record, 'analytic_name')}</Descriptions.Item>
        <Descriptions.Item label="Loại phân tích">{alertAnalyticTypeTag(String(value(record, 'analytic_type') || ''))}</Descriptions.Item>
        <Descriptions.Item label="Trạng thái bộ phân tích" span="filled">{choiceTag(localizeChoiceLabel(value(record, 'analytic_state')) || '', 'green')}</Descriptions.Item>
        <Descriptions.Item label="Mô tả bộ phân tích" span={4}>{block(stringValue(record, 'analytic_desc'))}</Descriptions.Item>
        <Descriptions.Item label="Tên chính sách">{stringValue(record, 'policy_name')}</Descriptions.Item>
        <Descriptions.Item label="Loại chính sách">{choiceTag(localizeChoiceLabel(value(record, 'policy_type')) || '', 'volcano')}</Descriptions.Item>
        <Descriptions.Item label="Mô tả chính sách" span={2}>{stringValue(record, 'policy_desc')}</Descriptions.Item>
      </Section>

      <Section title="Dữ liệu thô / Chưa ánh xạ">
        <Descriptions.Item label="Log gốc (Raw)" span={2}>
          <JsonViewer value={record.raw_data} maxHeight="none" />
        </Descriptions.Item>
        <Descriptions.Item label="Trường chưa ánh xạ" span={2}>
          <JsonViewer value={record.unmapped} maxHeight="none" />
        </Descriptions.Item>
      </Section>
    </div>
  )
}
