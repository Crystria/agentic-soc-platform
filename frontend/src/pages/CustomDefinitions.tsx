import {useCallback, useEffect, useMemo, useState} from 'react'
import {Alert, Button, Descriptions, Drawer, Empty, Flex, Input, InputNumber, List, Select, Space, Table, Tabs, Tag, Typography} from 'antd'
import {message} from '../utils/appMessage'
import {ReloadOutlined} from '@ant-design/icons'
import type {ColumnsType} from 'antd/es/table'
import {Boxes, BrainCircuit, DatabaseZap, KeyRound} from 'lucide-react'
import client from '../api/client'
import JsonViewer from '../components/JsonViewer'
import IconTabLabel from '../components/IconTabLabel'
import OverflowTags from '../components/OverflowTags'
import CustomVariablesSettings from './CustomVariablesSettings'
import {comfortableTagProps} from '../utils/tagStyles'
import {severityTag} from '../utils/recordDisplay'

type SourceType = 'official' | 'custom'
type SourceFilter = 'all' | SourceType

interface DefinitionError {
  path: string
  error: string
}

interface SectionResult<T> {
  section: string
  success: boolean
  counts: {
    items: number
    errors: number
  }
  items: T[]
  errors: DefinitionError[]
}

interface StreamGroup {
  name: string
  consumers: number
  pending: number
  last_delivered_id: string
}

interface StreamHealth {
  available: boolean
  length: number
  first_id: string
  last_id: string
  groups: StreamGroup[]
  warning: string
}

interface ModuleDefinition {
  name: string
  description: string
  path: string
  stream_name: string
  thread_num: number
  stream_health: StreamHealth
}

interface PlaybookDefinition {
  name: string
  description: string
  tags: string[]
  risk_level: 'Low' | 'Medium' | 'High' | 'Critical'
  source: SourceType
  path: string
}

interface SiemField {
  name: string
  type: string
  description: string
  is_key_field: boolean
  sample_values: unknown[]
}

interface SiemDefinition {
  name: string
  backend: 'ELK' | 'Splunk'
  description: string
  path: string
  field_count: number
  key_field_count: number
  fields: SiemField[]
}

interface StreamMessage {
  message_id: string
  data: unknown
}

interface StreamMessagesResponse {
  stream_name: string
  consumer_group: string
  limit: number
  messages: StreamMessage[]
}

interface StreamMessageResponse {
  stream_name: string
  message_id: string
  message: StreamMessage | Record<string, never>
}

function apiErrorMessage(error: unknown, fallback: string) {
  const data = (error as { response?: { data?: unknown } }).response?.data
  if (typeof data === 'string') return data
  if (data && typeof data === 'object') {
    const detail = (data as { detail?: unknown }).detail
    if (typeof detail === 'string') return detail
    return JSON.stringify(data)
  }
  return fallback
}

function sourceOptions(): Array<{ label: string; value: SourceFilter }> {
  return [
    { label: 'Tất cả nguồn', value: 'all' },
    { label: 'Chính thức', value: 'official' },
    { label: 'Tùy chỉnh', value: 'custom' },
  ]
}

function SourceTag({ source }: { source: SourceType }) {
  return <Tag {...comfortableTagProps} color={source === 'custom' ? 'blue' : 'gold'}>{source === 'custom' ? 'Tùy chỉnh' : 'Chính thức'}</Tag>
}

function PathText({ path }: { path: string }) {
  return (
    <Typography.Text type="secondary" style={{ fontSize: 12 }} ellipsis={{ tooltip: path }}>
      {path}
    </Typography.Text>
  )
}

function filterBySource<T extends { source: SourceType }>(items: T[], source: SourceFilter) {
  return source === 'all' ? items : items.filter((item) => item.source === source)
}

const PLAYBOOK_TAG_COLORS: Record<string, string> = {
  System: 'gold',
  LLM: 'purple',
  Case: 'green',
  Knowledge: 'magenta',
  CMDB: 'geekblue',
  'Threat Intel': 'volcano',
  Enrichment: 'cyan',
  Custom: 'blue',
}

const SIEM_BACKEND_COLORS: Record<string, string> = {
  ELK: 'orange',
  Splunk: 'green',
}

function includesSearch(values: unknown[], search: string) {
  const keyword = search.trim().toLowerCase()
  if (!keyword) return true
  return values.some((value) => String(value || '').toLowerCase().includes(keyword))
}

function DefinitionErrors({ errors }: { errors: DefinitionError[] }) {
  if (!errors.length) return null
  return (
    <Flex vertical gap={8} style={{ width: '100%', marginBottom: 12 }}>
      {errors.map((error) => (
        <Alert key={`${error.path}-${error.error}`} type="error" showIcon title={error.path} description={error.error} />
      ))}
    </Flex>
  )
}

function useDefinitionSection<T>(endpoint: string, label: string) {
  const [result, setResult] = useState<SectionResult<T> | null>(null)
  const [loading, setLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const { data } = await client.get<SectionResult<T>>(endpoint)
      setResult(data)
    } catch (error) {
      message.error(apiErrorMessage(error, `Không thể tải ${label}`))
      setResult(null)
    } finally {
      setLoading(false)
    }
  }, [endpoint, label])

  const refresh = useCallback(async () => {
    setRefreshing(true)
    try {
      const { data } = await client.post<SectionResult<T>>(endpoint)
      setResult(data)
      if (data.success) {
        message.success(`Đã làm mới ${label}`)
      } else {
        message.warning(`${label} đã làm mới với ${data.counts.errors} lỗi`)
      }
    } catch (error) {
      message.error(apiErrorMessage(error, `Làm mới ${label} thất bại`))
    } finally {
      setRefreshing(false)
    }
  }, [endpoint, label])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load()
  }, [load])

  return { result, loading, refreshing, load, refresh }
}

function SectionToolbar({
  search,
  onSearchChange,
  source,
  onSourceChange,
  onReload,
  onRefresh,
  loading,
  refreshing,
  extra,
}: {
  search: string
  onSearchChange: (value: string) => void
  source?: SourceFilter
  onSourceChange?: (value: SourceFilter) => void
  onReload: () => void
  onRefresh: () => void
  loading: boolean
  refreshing: boolean
  extra?: React.ReactNode
}) {
  return (
    <Space wrap style={{ marginBottom: 12 }}>
      <Button type="primary" onClick={onRefresh} loading={refreshing}>Làm mới / Kiểm tra</Button>
      <Button icon={<ReloadOutlined />} onClick={onReload} loading={loading}>Tải lại</Button>
      {source && onSourceChange ? <Select<SourceFilter> value={source} options={sourceOptions()} onChange={onSourceChange} style={{ width: 160 }} /> : null}
      {extra}
      <Input.Search allowClear placeholder="Tìm kiếm" value={search} onChange={(event) => onSearchChange(event.target.value)} style={{ width: 280 }} />
    </Space>
  )
}

function ModuleDrawer({ module, open, onClose }: { module: ModuleDefinition | null; open: boolean; onClose: () => void }) {
  const [messages, setMessages] = useState<StreamMessage[]>([])
  const [messageLimit, setMessageLimit] = useState(5)
  const [messageId, setMessageId] = useState('')
  const [selectedMessage, setSelectedMessage] = useState<StreamMessage | Record<string, never> | null>(null)
  const [loadingMessages, setLoadingMessages] = useState(false)
  const [messageError, setMessageError] = useState('')
  const streamName = module?.stream_name || ''

  const loadRecent = useCallback(async () => {
    if (!streamName) return
    setLoadingMessages(true)
    setMessageError('')
    try {
      const { data } = await client.get<StreamMessagesResponse>('/custom/modules/stream/messages/', {
        params: { stream_name: streamName, limit: messageLimit },
      })
      setMessages(data.messages)
    } catch (error) {
      setMessages([])
      setMessageError(apiErrorMessage(error, 'Không thể tải thông điệp stream'))
    } finally {
      setLoadingMessages(false)
    }
  }, [messageLimit, streamName])

  useEffect(() => {
    if (!open || !streamName) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMessages([])
    setSelectedMessage(null)
    setMessageId('')
    loadRecent()
  }, [loadRecent, open, streamName])

  const loadById = async () => {
    if (!module?.stream_name || !messageId.trim()) return
    setLoadingMessages(true)
    setMessageError('')
    try {
      const { data } = await client.get<StreamMessageResponse>('/custom/modules/stream/message/', {
        params: { stream_name: module.stream_name, message_id: messageId.trim() },
      })
      setSelectedMessage(data.message)
    } catch (error) {
      setSelectedMessage(null)
      setMessageError(apiErrorMessage(error, 'Không thể tải thông điệp stream'))
    } finally {
      setLoadingMessages(false)
    }
  }

  return (
    <Drawer title={module?.name || 'Module'} open={open} onClose={onClose} size="min(920px, calc(100vw - 48px))">
      {module ? (
        <Flex vertical gap={16} style={{ width: '100%' }}>
          <Descriptions size="small" column={1} bordered items={[
            { key: 'description', label: 'Mô tả', children: module.description || '—' },
            { key: 'stream', label: 'Stream', children: <Typography.Text copyable>{module.stream_name}</Typography.Text> },
            { key: 'threads', label: 'Số luồng', children: module.thread_num },
            { key: 'path', label: 'Đường dẫn', children: <PathText path={module.path} /> },
          ]} />

          <Descriptions size="small" title="Tình trạng Stream" column={2} bordered items={[
            { key: 'available', label: 'Khả dụng', children: module.stream_health.available ? 'Có' : 'Không' },
            { key: 'length', label: 'Độ dài', children: module.stream_health.length },
            { key: 'first', label: 'ID đầu', children: module.stream_health.first_id || '—' },
            { key: 'last', label: 'ID cuối', children: module.stream_health.last_id || '—' },
          ]} />
          {module.stream_health.warning ? <Alert type="warning" showIcon title={module.stream_health.warning} /> : null}
          {module.stream_health.groups.length ? (
            <Table<StreamGroup>
              size="small"
              rowKey="name"
              pagination={false}
              dataSource={module.stream_health.groups}
              columns={[
                { title: 'Nhóm', dataIndex: 'name' },
                { title: 'Consumer', dataIndex: 'consumers', width: 120 },
                { title: 'Đang chờ', dataIndex: 'pending', width: 120 },
                { title: 'Phân phối gần nhất', dataIndex: 'last_delivered_id', width: 220 },
              ]}
            />
          ) : null}

          <div>
            <Typography.Text strong>Thông điệp gần đây</Typography.Text>
            <Space style={{ marginLeft: 12 }}>
              <InputNumber min={1} max={20} value={messageLimit} onChange={(value) => setMessageLimit(Number(value || 5))} />
              <Button onClick={loadRecent} loading={loadingMessages}>Tải gần đây</Button>
            </Space>
          </div>
          {messageError ? <Alert type="error" showIcon title={messageError} /> : null}
          <List
            loading={loadingMessages}
            dataSource={messages}
            locale={{ emptyText: <Empty description="Không có thông điệp" /> }}
            renderItem={(item) => (
              <List.Item>
                <Flex vertical gap={4} style={{ width: '100%' }}>
                  <Typography.Text code>{item.message_id}</Typography.Text>
                  <JsonViewer value={item.data} maxHeight={260} />
                </Flex>
              </List.Item>
            )}
          />

          <div>
            <Typography.Text strong>Đọc theo Message ID</Typography.Text>
            <Input.Search
              allowClear
              enterButton="Đọc"
              value={messageId}
              onChange={(event) => setMessageId(event.target.value)}
              onSearch={loadById}
              style={{ marginTop: 8 }}
              placeholder="1700000000000-0"
            />
          </div>
          {selectedMessage ? <JsonViewer value={selectedMessage} maxHeight={320} /> : null}
        </Flex>
      ) : null}
    </Drawer>
  )
}

function ModulesTab() {
  const { result, loading, refreshing, load, refresh } = useDefinitionSection<ModuleDefinition>('/custom/modules/', 'Modules')
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<ModuleDefinition | null>(null)
  const rows = useMemo(() => (
    (result?.items || []).filter((item) => includesSearch([
      item.name,
      item.description,
      item.stream_name,
      item.path,
    ], search))
  ), [result?.items, search])

  const columns = useMemo<ColumnsType<ModuleDefinition>>(() => [
    { title: 'Module', dataIndex: 'name', width: 340, render: (name: string) => <Typography.Text strong>{name}</Typography.Text> },
    { title: 'Mô tả', dataIndex: 'description', ellipsis: true },
    { title: 'Stream', dataIndex: 'stream_name', width: 380, ellipsis: true },
    { title: 'Số luồng', dataIndex: 'thread_num', width: 100 },
    { title: 'Độ dài', width: 100, render: (_, record) => record.stream_health.length },
    { title: 'ID cuối', width: 180, render: (_, record) => record.stream_health.last_id || '—' },
    { title: 'Đường dẫn', dataIndex: 'path', width: 280, render: (path: string) => <PathText path={path} /> },
  ], [])

  return (
    <>
      <SectionToolbar
        search={search}
        onSearchChange={setSearch}
        onReload={load}
        onRefresh={refresh}
        loading={loading}
        refreshing={refreshing}
      />
      <DefinitionErrors errors={result?.errors || []} />
      <Table<ModuleDefinition>
        size="small"
        rowKey="path"
        loading={loading}
        columns={columns}
        dataSource={rows}
        onRow={(record) => ({ onClick: () => setSelected(record), style: { cursor: 'pointer' } })}
        locale={{ emptyText: loading ? <span /> : <Empty description="Chưa nạp module nào" /> }}
        scroll={{ x: 1600 }}
      />
      <ModuleDrawer module={selected} open={selected !== null} onClose={() => setSelected(null)} />
    </>
  )
}

function PlaybooksTab() {
  const { result, loading, refreshing, load, refresh } = useDefinitionSection<PlaybookDefinition>('/custom/playbooks/', 'Playbook')
  const [source, setSource] = useState<SourceFilter>('all')
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<PlaybookDefinition | null>(null)
  const rows = useMemo(() => (
    filterBySource(result?.items || [], source).filter((item) => includesSearch([
      item.name,
      item.description,
      item.risk_level,
      item.path,
      ...item.tags,
    ], search))
  ), [result?.items, search, source])

  const columns = useMemo<ColumnsType<PlaybookDefinition>>(() => [
    { title: 'Playbook', dataIndex: 'name', width: 260, render: (name: string) => <Typography.Text strong>{name}</Typography.Text> },
    { title: 'Nguồn', dataIndex: 'source', width: 110, render: (value: SourceType) => <SourceTag source={value} /> },
    { title: 'Mức rủi ro', dataIndex: 'risk_level', width: 110, render: (value: string) => severityTag(value) },
    {
      title: 'Thẻ',
      dataIndex: 'tags',
      width: 260,
      render: (tags: string[]) => <OverflowTags items={tags} getColor={(tag) => PLAYBOOK_TAG_COLORS[tag] || 'blue'} />,
    },
    { title: 'Mô tả', dataIndex: 'description', ellipsis: true },
    { title: 'Đường dẫn', dataIndex: 'path', width: 300, render: (path: string) => <PathText path={path} /> },
  ], [])

  return (
    <>
      <SectionToolbar
        search={search}
        onSearchChange={setSearch}
        source={source}
        onSourceChange={setSource}
        onReload={load}
        onRefresh={refresh}
        loading={loading}
        refreshing={refreshing}
      />
      <DefinitionErrors errors={result?.errors || []} />
      <Table<PlaybookDefinition>
        size="small"
        rowKey="path"
        loading={loading}
        columns={columns}
        dataSource={rows}
        onRow={(record) => ({ onClick: () => setSelected(record), style: { cursor: 'pointer' } })}
        locale={{ emptyText: loading ? <span /> : <Empty description="Chưa nạp playbook nào" /> }}
        scroll={{ x: 1300 }}
      />
      <Drawer title={selected?.name || 'Playbook'} open={selected !== null} onClose={() => setSelected(null)} size="min(760px, calc(100vw - 48px))">
        {selected ? (
          <Flex vertical gap={16} style={{ width: '100%' }}>
            <Space>
              <SourceTag source={selected.source} />
              {severityTag(selected.risk_level)}
              {(selected.tags || []).map((tag) => <Tag {...comfortableTagProps} key={tag} color={PLAYBOOK_TAG_COLORS[tag] || 'blue'}>{tag}</Tag>)}
            </Space>
            <Typography.Paragraph style={{ whiteSpace: 'pre-wrap' }}>{selected.description || 'Không có mô tả.'}</Typography.Paragraph>
            <Descriptions size="small" column={1} bordered items={[
              { key: 'path', label: 'Đường dẫn', children: <PathText path={selected.path} /> },
            ]} />
          </Flex>
        ) : null}
      </Drawer>
    </>
  )
}

function SiemTab() {
  const { result, loading, refreshing, load, refresh } = useDefinitionSection<SiemDefinition>('/custom/siem/', 'SIEM YAML')
  const [backend, setBackend] = useState<'all' | 'ELK' | 'Splunk'>('all')
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<SiemDefinition | null>(null)
  const rows = useMemo(() => (
    (result?.items || [])
      .filter((item) => backend === 'all' || item.backend === backend)
      .filter((item) => includesSearch([item.name, item.backend, item.description, item.path], search))
  ), [backend, result?.items, search])

  const columns = useMemo<ColumnsType<SiemDefinition>>(() => [
    { title: 'Index', dataIndex: 'name', width: 220, render: (name: string) => <Typography.Text strong>{name}</Typography.Text> },
    { title: 'Backend', dataIndex: 'backend', width: 120, render: (value: string) => <Tag {...comfortableTagProps} color={SIEM_BACKEND_COLORS[value] || 'default'}>{value}</Tag> },
    { title: 'Mô tả', dataIndex: 'description', ellipsis: true },
    { title: 'Số trường', dataIndex: 'field_count', width: 100 },
    { title: 'Trường khóa', dataIndex: 'key_field_count', width: 120 },
    { title: 'Đường dẫn', dataIndex: 'path', width: 300, render: (path: string) => <PathText path={path} /> },
  ], [])

  const fieldColumns = useMemo<ColumnsType<SiemField>>(() => [
    { title: 'Tên', dataIndex: 'name', width: 220 },
    { title: 'Kiểu', dataIndex: 'type', width: 120 },
    { title: 'Trường khóa', dataIndex: 'is_key_field', width: 110, render: (value: boolean) => value ? <Tag color="blue">Trường khóa</Tag> : '—' },
    { title: 'Mô tả', dataIndex: 'description' },
    {
      title: 'Giá trị mẫu',
      dataIndex: 'sample_values',
      width: 260,
      render: (values: unknown[]) => (
        <Typography.Text type="secondary" ellipsis={{ tooltip: JSON.stringify(values || []) }}>
          {JSON.stringify(values || [])}
        </Typography.Text>
      ),
    },
  ], [])

  return (
    <>
      <SectionToolbar
        search={search}
        onSearchChange={setSearch}
        onReload={load}
        onRefresh={refresh}
        loading={loading}
        refreshing={refreshing}
        extra={(
          <Select<'all' | 'ELK' | 'Splunk'>
            value={backend}
            onChange={(value) => setBackend(value)}
            style={{ width: 150 }}
            options={[
              { label: 'Tất cả backend', value: 'all' },
              { label: 'ELK', value: 'ELK' },
              { label: 'Splunk', value: 'Splunk' },
            ]}
          />
        )}
      />
      <DefinitionErrors errors={result?.errors || []} />
      <Table<SiemDefinition>
        size="small"
        rowKey="path"
        loading={loading}
        columns={columns}
        dataSource={rows}
        onRow={(record) => ({ onClick: () => setSelected(record), style: { cursor: 'pointer' } })}
        locale={{ emptyText: loading ? <span /> : <Empty description="Chưa nạp SIEM YAML nào" /> }}
        scroll={{ x: 1400 }}
      />
      <Drawer title={selected?.name || 'SIEM YAML'} open={selected !== null} onClose={() => setSelected(null)} size="min(1080px, calc(100vw - 48px))">
        {selected ? (
          <Flex vertical gap={16} style={{ width: '100%' }}>
            <Descriptions size="small" column={1} bordered items={[
              { key: 'backend', label: 'Backend', children: <Tag {...comfortableTagProps} color={SIEM_BACKEND_COLORS[selected.backend] || 'default'}>{selected.backend}</Tag> },
              { key: 'description', label: 'Mô tả', children: selected.description || '—' },
              { key: 'path', label: 'Đường dẫn', children: <PathText path={selected.path} /> },
            ]} />
            <Table<SiemField>
              size="small"
              rowKey="name"
              columns={fieldColumns}
              dataSource={selected.fields || []}
              pagination={false}
              scroll={{ x: 900, y: 520 }}
            />
          </Flex>
        ) : null}
      </Drawer>
    </>
  )
}

export default function CustomDefinitions() {
  return (
    <div style={{ height: '100%', minHeight: 0, overflow: 'auto' }}>
      <Tabs
        items={[
          { key: 'modules', label: <IconTabLabel icon={Boxes}>Modules</IconTabLabel>, children: <ModulesTab /> },
          { key: 'playbooks', label: <IconTabLabel icon={BrainCircuit}>Playbook</IconTabLabel>, children: <PlaybooksTab /> },
          { key: 'siem', label: <IconTabLabel icon={DatabaseZap}>SIEM YAML</IconTabLabel>, children: <SiemTab /> },
          { key: 'variables', label: <IconTabLabel icon={KeyRound}>Biến tùy chỉnh</IconTabLabel>, children: <CustomVariablesSettings /> },
        ]}
      />
    </div>
  )
}
