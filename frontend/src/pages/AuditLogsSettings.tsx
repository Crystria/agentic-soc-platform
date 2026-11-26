import {useMemo, useState} from 'react'
import type {Dayjs} from 'dayjs'
import dayjs from 'dayjs'
import {Button, DatePicker, Descriptions, Space, Tooltip, Typography} from 'antd'
import {ExportOutlined} from '@ant-design/icons'
import DataTable from '../components/DataTable'
import JsonViewer from '../components/JsonViewer'
import RecordDetailModal from '../components/RecordDetailModal'
import client from '../api/client'
import {getResourceConfig} from '../config/resources'
import type {OpenResourceOptions, ResourceColumn, ResourceConfig, ResourceFilterConfig, AdvancedFilterFieldConfig} from '../types/records'
import {message} from '../utils/appMessage'
import {choiceTag, emptyValue, formatDateTime} from '../utils/recordDisplay'
import {AUDIT_ACTION_LABELS, localizeWithMap} from '../utils/i18n'
import {monoTextStyle} from '../utils/typography'

const { RangePicker } = DatePicker

type RecordRow = Record<string, unknown>
type RangeValue = [Dayjs, Dayjs] | null

const actionColors: Record<string, string> = {
  create: 'green',
  update: 'blue',
  delete: 'red',
  linked: 'cyan',
  unlinked: 'orange',
  deleted: 'red',
  reveal: 'purple',
  test: 'gold',
}

const actionOptions = [
  'create',
  'update',
  'delete',
  'linked',
  'unlinked',
  'deleted',
  'reveal',
  'test',
].map((value) => ({ label: AUDIT_ACTION_LABELS[value] || value, value }))

const resourceTypeOptions = [
  { label: 'Vụ việc', value: 'case' },
  { label: 'Cảnh báo', value: 'alert' },
  { label: 'Thực thể', value: 'artifact' },
  { label: 'Làm giàu dữ liệu', value: 'enrichment' },
  { label: 'Playbook', value: 'playbook' },
  { label: 'Tri thức', value: 'knowledge' },
  { label: 'Người dùng', value: 'user' },
  { label: 'Nhà cung cấp LLM', value: 'llmproviderconfig' },
  { label: 'Cài đặt AlienVault OTX', value: 'threatintelalienvaultotxconfig' },
  { label: 'Cài đặt OpenCTI', value: 'threatintelopencticonfig' },
  { label: 'Cài đặt Splunk', value: 'siemsplunkconfig' },
  { label: 'Cài đặt ELK', value: 'siemelkconfig' },
  { label: 'Cài đặt LDAP', value: 'ldapconfig' },
  { label: 'Cấu hình Runtime', value: 'runtimeconfig' },
]

const linkableResourceKeys = new Set(['cases', 'alerts', 'artifacts', 'enrichments', 'playbooks', 'knowledge', 'users', 'llm-providers'])

const endpoint = '/settings/audit-logs/'
const searchPlaceholder = 'Mã nhật ký, tác nhân, hành động, tài nguyên, mã đối tượng, trường, thay đổi, metadata'

const filters: ResourceFilterConfig[] = [
  { key: 'action', label: 'Hành động', valueType: 'select', options: actionOptions, width: 132 },
  { key: 'actor', label: 'Người thực hiện', valueType: 'user', options: [{ label: 'Hệ thống', value: 'system' }], width: 180 },
  { key: 'resource_type', label: 'Loại tài nguyên', valueType: 'select', options: resourceTypeOptions, width: 200 },
]

const advancedFilters: AdvancedFilterFieldConfig[] = [
  { key: 'action', label: 'Hành động', valueType: 'select', options: actionOptions },
  { key: 'actor', label: 'Người thực hiện', valueType: 'user', options: [{ label: 'Hệ thống', value: 'system' }] },
  { key: 'resource_type', label: 'Loại tài nguyên', valueType: 'select', options: resourceTypeOptions },
  { key: 'object_id', label: 'Mã đối tượng', valueType: 'text' },
  { key: 'field', label: 'Trường / Quan hệ', valueType: 'text' },
  { key: 'relation', label: 'Quan hệ', valueType: 'text' },
  { key: 'related_resource', label: 'Tài nguyên liên quan', valueType: 'text' },
  { key: 'related_id', label: 'Mã liên quan', valueType: 'text' },
  { key: 'related_label', label: 'Nhãn liên quan', valueType: 'text' },
  { key: 'changes', label: 'Changes JSON', valueType: 'text' },
  { key: 'metadata', label: 'Metadata JSON', valueType: 'text' },
  { key: 'created_at', label: 'Thời gian tạo', valueType: 'date' },
]

const value = (record: RecordRow, key: string) => record[key]
const textValue = (record: RecordRow, key: string) => emptyValue(value(record, key))
const actorDisplay = (record: RecordRow) => {
  const actorName = String(value(record, 'actor_name') || '')
  const actor = String(value(record, 'actor') || '')
  return actorName || actor || 'Hệ thống'
}
const actionTag = (rawValue: unknown) => {
  const action = String(rawValue || '')
  return choiceTag(localizeWithMap(action, AUDIT_ACTION_LABELS), actionColors[action] || 'default')
}
const date = (field: string) => (_: unknown, record: RecordRow) => formatDateTime(String(value(record, field) || ''))
const mono = (content: unknown) => (
  <Typography.Text copyable={Boolean(content)} style={monoTextStyle}>
    {emptyValue(content)}
  </Typography.Text>
)
const canOpenResource = (resourceKey: unknown, rowId: unknown, action?: unknown) => (
  typeof resourceKey === 'string'
  && linkableResourceKeys.has(resourceKey)
  && rowId !== null
  && rowId !== undefined
  && rowId !== ''
  && !['delete', 'deleted'].includes(String(action || ''))
)

function AuditLogBasicView({
  record,
  onOpenResource,
}: {
  record: RecordRow
  onOpenResource?: (resourceKey: string, rowId: string | number, options?: OpenResourceOptions) => void
}) {
  const objectResourceKey = String(value(record, 'resource_key') || '')
  const objectId = value(record, 'object_id') as string | number | null | undefined
  const relatedResourceKey = String(value(record, 'related_resource') || '')
  const relatedId = value(record, 'related_id') as string | number | null | undefined
  const action = value(record, 'action')

  return (
    <div style={{ padding: '20px 20px 16px', overflow: 'auto', height: '100%', boxSizing: 'border-box' }}>
      <Space direction="vertical" size={16} style={{ width: '100%' }}>
        <Descriptions column={2} size="small" bordered>
          <Descriptions.Item label="Mã nhật ký">{mono(value(record, 'readable_id'))}</Descriptions.Item>
          <Descriptions.Item label="Thời gian">{formatDateTime(String(value(record, 'created_at') || ''))}</Descriptions.Item>
          <Descriptions.Item label="Hành động">{actionTag(action)}</Descriptions.Item>
          <Descriptions.Item label="Người thực hiện">{actorDisplay(record)}</Descriptions.Item>
          <Descriptions.Item label="Loại tài nguyên">{textValue(record, 'resource_label')}</Descriptions.Item>
          <Descriptions.Item label="Mã đối tượng">
            {canOpenResource(objectResourceKey, objectId, action) ? (
              <Button type="link" size="small" style={{ padding: 0, height: 'auto', ...monoTextStyle }} onClick={() => onOpenResource?.(objectResourceKey, objectId!)}>
                {textValue(record, 'object_id')}
              </Button>
            ) : mono(value(record, 'object_id'))}
          </Descriptions.Item>
          <Descriptions.Item label="Trường / Quan hệ">{textValue(record, 'field_summary')}</Descriptions.Item>
          <Descriptions.Item label="Tài nguyên liên quan">{textValue(record, 'related_resource')}</Descriptions.Item>
          <Descriptions.Item label="Bản ghi liên quan">
            {canOpenResource(relatedResourceKey, relatedId, action) ? (
              <Button type="link" size="small" style={{ padding: 0, height: 'auto' }} onClick={() => onOpenResource?.(relatedResourceKey, relatedId!)}>
                {textValue(record, 'related_label') !== '—' ? textValue(record, 'related_label') : textValue(record, 'related_id')}
              </Button>
            ) : textValue(record, 'related_label') !== '—' ? textValue(record, 'related_label') : mono(value(record, 'related_id'))}
          </Descriptions.Item>
          <Descriptions.Item label="Tóm tắt" span={2}>{textValue(record, 'summary')}</Descriptions.Item>
        </Descriptions>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 16, alignItems: 'start' }}>
          <div style={{ minWidth: 0 }}>
            <Typography.Title level={5}>Thay đổi</Typography.Title>
            <JsonViewer value={value(record, 'display_changes') || value(record, 'changes')} maxHeight="none" />
          </div>
          <div style={{ minWidth: 0 }}>
            <Typography.Title level={5}>Metadata</Typography.Title>
            <JsonViewer value={value(record, 'metadata')} maxHeight="none" />
          </div>
        </div>
      </Space>
    </div>
  )
}

function exportFilename(disposition: string | undefined) {
  const match = disposition?.match(/filename="?([^"]+)"?/)
  return match?.[1] || `audit-logs-${dayjs().format('YYYYMMDD-HHmmss')}.csv`
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

export default function AuditLogsSettings() {
  const [createdRange, setCreatedRange] = useState<RangeValue>(() => [dayjs().subtract(24, 'hour'), dayjs()])
  const [selectedAuditLogId, setSelectedAuditLogId] = useState<string | number | null>(null)
  const [exporting, setExporting] = useState(false)
  const [relatedDetail, setRelatedDetail] = useState<{
    config: ResourceConfig
    rowId: string | number
  } | null>(null)

  const baseParams = useMemo(() => {
    if (!createdRange?.[0] && !createdRange?.[1]) return {}
    return {
      created_after: createdRange?.[0]?.toISOString(),
      created_before: createdRange?.[1]?.toISOString(),
    }
  }, [createdRange])

  const columns = useMemo<ResourceColumn<RecordRow>[]>(() => [
    { key: 'readable_id', title: 'Mã nhật ký', dataIndex: 'readable_id', width: 150, required: true, defaultVisible: true, fixed: 'left', openRecord: true, uppercase: true },
    { key: 'created_at', title: 'Thời gian', dataIndex: 'created_at', width: 180, defaultVisible: true, sorter: true, render: date('created_at') },
    { key: 'action', title: 'Hành động', dataIndex: 'action', width: 120, defaultVisible: true, sorter: true, render: actionTag },
    { key: 'actor_name', title: 'Người thực hiện', dataIndex: 'actor_name', width: 180, defaultVisible: true, sorter: true, render: (_v, record) => actorDisplay(record) },
    { key: 'resource_label', title: 'Loại tài nguyên', dataIndex: 'resource_label', width: 180, defaultVisible: true },
    {
      key: 'object_id',
      title: 'Mã đối tượng',
      dataIndex: 'object_id',
      width: 360,
      defaultVisible: true,
      sorter: true,
      render: (raw, record) => canOpenResource(value(record, 'resource_key'), raw, value(record, 'action')) ? emptyValue(raw) : mono(raw),
      openResource: {
        resourceKey: (record) => canOpenResource(value(record, 'resource_key'), value(record, 'object_id'), value(record, 'action')) ? String(value(record, 'resource_key')) : null,
        rowId: (record) => value(record, 'object_id') as string | number | null | undefined,
      },
    },
    { key: 'field_summary', title: 'Trường / Quan hệ', dataIndex: 'field_summary', width: 180, defaultVisible: true },
    {
      key: 'related_label',
      title: 'Bản ghi liên quan',
      dataIndex: 'related_label',
      width: 240,
      defaultVisible: true,
      render: (_raw, record) => textValue(record, 'related_label') !== '—' ? textValue(record, 'related_label') : textValue(record, 'related_id'),
      openResource: {
        resourceKey: (record) => canOpenResource(value(record, 'related_resource'), value(record, 'related_id'), value(record, 'action')) ? String(value(record, 'related_resource')) : null,
        rowId: (record) => value(record, 'related_id') as string | number | null | undefined,
      },
    },
    { key: 'summary', title: 'Tóm tắt', dataIndex: 'summary', width: 520, defaultVisible: true },
    { key: 'changes_json', title: 'Changes JSON', dataIndex: 'changes_json', width: 480 },
    { key: 'metadata_json', title: 'Metadata JSON', dataIndex: 'metadata_json', width: 480 },
  ], [])

  const detailConfig = useMemo<ResourceConfig<RecordRow>>(() => ({
    key: 'audit-logs',
    label: 'Nhật ký hệ thống',
    endpoint,
    rowKey: 'id',
    searchPlaceholder,
    columns,
    filters,
    advancedFilters,
    basicView: (record, options) => <AuditLogBasicView record={record} onOpenResource={options?.onOpenResource} />,
    showShare: false,
    showActivity: false,
    basicSections: [],
    tabs: [],
  }), [columns])

  const openRelatedDetail = (resourceKey: string, rowId: string | number) => {
    if (!linkableResourceKeys.has(resourceKey)) return
    setRelatedDetail({ config: getResourceConfig(resourceKey), rowId })
  }

  const exportCsv = async (params: Record<string, string | number | boolean | undefined>) => {
    const exportParams = { ...params }
    delete exportParams.page
    delete exportParams.page_size
    setExporting(true)
    try {
      const response = await client.get(`${endpoint}export/`, {
        params: exportParams,
        responseType: 'blob',
      })
      downloadBlob(response.data, exportFilename(response.headers['content-disposition']))
      message.success('Đã xuất nhật ký hệ thống')
    } catch {
      message.error('Xuất nhật ký hệ thống thất bại')
    } finally {
      setExporting(false)
    }
  }

  return (
    <div style={{ height: '100%', minHeight: 0 }}>
      <DataTable
        endpoint={endpoint}
        tableKey="audit-logs"
        savedFiltersKey="audit-logs"
        rowKey="id"
        columns={columns}
        filters={filters}
        advancedFilters={advancedFilters}
        searchPlaceholder={searchPlaceholder}
        baseParams={baseParams}
        filterActions={(
          <RangePicker
            showTime
            allowClear
            value={createdRange}
            onChange={(next) => setCreatedRange(next as RangeValue)}
            style={{ width: 360 }}
          />
        )}
        readOnly
        fillParent
        onRowClick={(record) => setSelectedAuditLogId(value(record, 'id') as string | number)}
        onOpenResource={openRelatedDetail}
        actions={({ params }) => (
          <Tooltip title="Xuất CSV">
            <Button icon={<ExportOutlined />} loading={exporting} onClick={() => exportCsv(params)} />
          </Tooltip>
        )}
      />
      <RecordDetailModal
        config={detailConfig}
        rowId={selectedAuditLogId}
        open={selectedAuditLogId !== null}
        onClose={() => setSelectedAuditLogId(null)}
        onOpenResource={openRelatedDetail}
      />
      {relatedDetail && (
        <RecordDetailModal
          config={relatedDetail.config}
          rowId={relatedDetail.rowId}
          open
          onOpenResource={openRelatedDetail}
          onClose={() => setRelatedDetail(null)}
        />
      )}
    </div>
  )
}
