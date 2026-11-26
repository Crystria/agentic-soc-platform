import {useCallback, useEffect, useMemo, useState} from 'react'
import {useNavigate} from 'react-router-dom'
import {
  Alert,
  Button,
  Card,
  Col,
  Descriptions,
  Drawer,
  Input,
  Modal,
  Popconfirm,
  Row,
  Select,
  Space,
  Spin,
  Statistic,
  Switch,
  Table,
  Tabs,
  Tag,
  Typography,
} from 'antd'
import type {ColumnsType} from 'antd/es/table'
import {
  EyeOutlined,
  PlayCircleOutlined,
  ReloadOutlined,
  StopOutlined,
} from '@ant-design/icons'
import {Bot, BookOpenText, FileCode2, Workflow} from 'lucide-react'
import {
  type AgenticJobDetail,
  type AgenticJobListItem,
  type AgenticJobStatus,
  type AgenticOverviewResponse,
  type AgenticPromptItem,
  cancelAgenticJob,
  fetchAgenticJobDetail,
  fetchAgenticJobs,
  fetchAgenticOverview,
  fetchAgenticPrompts,
  retryAgenticJob,
  triggerAgenticCaseAnalysis,
} from '../api/agentic'
import IconTabLabel from '../components/IconTabLabel'
import JsonViewer from '../components/JsonViewer'
import {message} from '../utils/appMessage'
import {formatDateTime, severityTag, verdictTag} from '../utils/recordDisplay'
import {
  localizeWithMap,
  PLAYBOOK_JOB_STATUS_LABELS,
  WORKER_STATE_LABELS,
} from '../utils/i18n'
import {fontFamilyMono} from '../utils/typography'

const JOB_STATUS_COLORS: Record<AgenticJobStatus, string> = {
  Pending: 'gold',
  Running: 'processing',
  Success: 'green',
  Failed: 'red',
}

const WORKER_STATE_COLORS: Record<string, string> = {
  Starting: 'processing',
  Idle: 'green',
  Running: 'blue',
  Degraded: 'orange',
  Down: 'red',
}

const STATUS_FILTER_OPTIONS = [
  { label: 'Tất cả trạng thái', value: '' },
  { label: PLAYBOOK_JOB_STATUS_LABELS.Pending, value: 'Pending' },
  { label: PLAYBOOK_JOB_STATUS_LABELS.Running, value: 'Running' },
  { label: PLAYBOOK_JOB_STATUS_LABELS.Success, value: 'Success' },
  { label: PLAYBOOK_JOB_STATUS_LABELS.Failed, value: 'Failed' },
]

function apiErrorMessage(error: unknown, fallback: string) {
  const data = (error as { response?: { data?: unknown } }).response?.data
  if (typeof data === 'string') return data
  if (data && typeof data === 'object' && 'detail' in data) {
    return String((data as { detail?: unknown }).detail || fallback)
  }
  return fallback
}

function formatLatency(latencyMs: number | null) {
  if (latencyMs === null || latencyMs === undefined) return '—'
  if (latencyMs < 1000) return `${latencyMs} ms`
  return `${(latencyMs / 1000).toFixed(2)} s`
}

export default function AgentMonitor() {
  const navigate = useNavigate()
  const [overview, setOverview] = useState<AgenticOverviewResponse | null>(null)
  const [jobs, setJobs] = useState<AgenticJobListItem[]>([])
  const [totalJobs, setTotalJobs] = useState(0)
  const [statusFilter, setStatusFilter] = useState('')
  const [searchText, setSearchText] = useState('')
  const [appliedSearch, setAppliedSearch] = useState('')
  const [page, setPage] = useState(1)
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [prompts, setPrompts] = useState<AgenticPromptItem[]>([])
  const [promptLanguage, setPromptLanguage] = useState('en')
  const [selectedPromptId, setSelectedPromptId] = useState('')
  const [loadingPrompts, setLoadingPrompts] = useState(false)

  const [inspectedJob, setInspectedJob] = useState<AgenticJobDetail | null>(null)
  const [inspectOpen, setInspectOpen] = useState(false)
  const [loadingInspect, setLoadingInspect] = useState(false)

  const [triggerOpen, setTriggerOpen] = useState(false)
  const [triggerCaseId, setTriggerCaseId] = useState('')
  const [triggering, setTriggering] = useState(false)
  const [refreshTick, setRefreshTick] = useState(0)

  const reloadMonitor = useCallback(() => {
    setRefreshTick((tick) => tick + 1)
  }, [])

  useEffect(() => {
    let active = true
    Promise.all([
      fetchAgenticOverview(),
      fetchAgenticJobs({
        status: statusFilter || undefined,
        search: appliedSearch || undefined,
        page,
        page_size: 20,
      }),
    ])
      .then(([overviewData, jobsData]) => {
        if (!active) return
        setOverview(overviewData)
        setJobs(jobsData.results)
        setTotalJobs(jobsData.count)
        setError('')
      })
      .catch((requestError) => {
        if (!active) return
        setError(apiErrorMessage(requestError, 'Không thể tải dữ liệu Giám sát Agent.'))
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
  }, [appliedSearch, page, refreshTick, statusFilter])

  useEffect(() => {
    if (!autoRefresh) return
    const timer = window.setInterval(() => {
      setRefreshTick((tick) => tick + 1)
    }, 10_000)
    return () => window.clearInterval(timer)
  }, [autoRefresh])

  useEffect(() => {
    let active = true
    fetchAgenticPrompts(promptLanguage)
      .then((items) => {
        if (!active) return
        setPrompts(items)
        setSelectedPromptId((current) => (
          current && items.some((item) => item.prompt_id === current)
            ? current
            : items[0]?.prompt_id || ''
        ))
      })
      .catch(() => {
        if (!active) return
        setPrompts([])
      })
      .finally(() => {
        if (active) setLoadingPrompts(false)
      })

    return () => {
      active = false
    }
  }, [promptLanguage])

  const openInspector = async (jobId: string) => {
    setInspectOpen(true)
    setLoadingInspect(true)
    try {
      const detail = await fetchAgenticJobDetail(jobId)
      setInspectedJob(detail)
    } catch (requestError) {
      message.error(apiErrorMessage(requestError, 'Không thể tải chi tiết tác vụ'))
      setInspectOpen(false)
    } finally {
      setLoadingInspect(false)
    }
  }

  const handleRetry = useCallback(async (jobId: string) => {
    try {
      await retryAgenticJob(jobId)
      message.success('Đã đưa tác vụ phân tích vụ việc vào hàng đợi chạy lại')
      reloadMonitor()
    } catch (requestError) {
      message.error(apiErrorMessage(requestError, 'Chạy lại tác vụ thất bại'))
    }
  }, [reloadMonitor])

  const handleCancel = useCallback(async (jobId: string) => {
    try {
      await cancelAgenticJob(jobId)
      message.success('Đã hủy tác vụ đang chờ')
      reloadMonitor()
    } catch (requestError) {
      message.error(apiErrorMessage(requestError, 'Hủy tác vụ thất bại'))
    }
  }, [reloadMonitor])

  const handleTrigger = async () => {
    const trimmed = triggerCaseId.trim()
    if (!trimmed) {
      message.warning('Vui lòng nhập Mã vụ việc (ví dụ: case_000001 hoặc UUID)')
      return
    }
    setTriggering(true)
    try {
      const created = await triggerAgenticCaseAnalysis(trimmed)
      message.success(`Đã đưa phân tích cho ${created.case_readable_id.toUpperCase()} vào hàng đợi`)
      setTriggerOpen(false)
      setTriggerCaseId('')
      reloadMonitor()
    } catch (requestError) {
      message.error(apiErrorMessage(requestError, 'Kích hoạt phân tích vụ việc thất bại'))
    } finally {
      setTriggering(false)
    }
  }

  const selectedPrompt = useMemo(
    () => prompts.find((item) => item.prompt_id === selectedPromptId) || null,
    [prompts, selectedPromptId],
  )

  const jobColumns = useMemo<ColumnsType<AgenticJobListItem>>(() => [
    {
      title: 'Vụ việc',
      key: 'case',
      width: 260,
      fixed: 'left',
      render: (_, row) => (
        <Space orientation="vertical" size={0}>
          <Button
            type="link"
            size="small"
            style={{ padding: 0, height: 'auto', fontFamily: fontFamilyMono }}
            onClick={() => navigate(`/cases/${encodeURIComponent(row.case_id)}`)}
          >
            {row.case_readable_id.toUpperCase()}
          </Button>
          <Typography.Text type="secondary" ellipsis style={{ maxWidth: 230, fontSize: 12 }}>
            {row.case_title}
          </Typography.Text>
        </Space>
      ),
    },
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      width: 110,
      render: (status: AgenticJobStatus) => <Tag color={JOB_STATUS_COLORS[status]}>{localizeWithMap(status, PLAYBOOK_JOB_STATUS_LABELS)}</Tag>,
    },
    { title: 'Nguồn kích hoạt', dataIndex: 'trigger', width: 130, render: (val: string) => val || '—' },
    {
      title: 'Model / Nhà cung cấp',
      key: 'model',
      width: 210,
      render: (_, row) => row.model_name ? (
        <Space orientation="vertical" size={0}>
          <Typography.Text style={{ fontFamily: fontFamilyMono, fontSize: 12 }}>{row.model_name}</Typography.Text>
          <Typography.Text type="secondary" style={{ fontSize: 11 }}>{row.provider_name || '—'}</Typography.Text>
        </Space>
      ) : '—',
    },
    {
      title: 'Kết quả AI',
      key: 'result',
      width: 170,
      render: (_, row) => row.verdict_ai ? (
        <Space size={4} wrap>
          {verdictTag(row.verdict_ai)}
          {row.confidence_ai ? severityTag(row.confidence_ai) : null}
        </Space>
      ) : '—',
    },
    {
      title: 'Tokens',
      key: 'tokens',
      width: 130,
      render: (_, row) => row.total_tokens !== null ? (
        <span style={{ fontFamily: fontFamilyMono, fontSize: 12 }}>
          {row.total_tokens} ({row.input_tokens ?? 0}/{row.output_tokens ?? 0})
        </span>
      ) : '—',
    },
    {
      title: 'Độ trễ',
      dataIndex: 'latency_ms',
      width: 100,
      render: (ms: number | null) => formatLatency(ms),
    },
    {
      title: 'RAG',
      key: 'rag',
      width: 130,
      render: (_, row) => `${row.knowledge_records_count} bản ghi / ${row.knowledge_keywords_count} từ khóa`,
    },
    {
      title: 'Thời gian tạo',
      dataIndex: 'created_at',
      width: 175,
      render: formatDateTime,
    },
    {
      title: 'Thao tác',
      key: 'actions',
      width: 190,
      fixed: 'right',
      render: (_, row) => (
        <Space size={4}>
          <Button size="small" icon={<EyeOutlined />} onClick={() => openInspector(row.id)}>
            Chi tiết
          </Button>
          {row.status === 'Pending' && (
            <Popconfirm title="Hủy tác vụ đang chờ này?" onConfirm={() => handleCancel(row.id)}>
              <Button size="small" danger icon={<StopOutlined />} />
            </Popconfirm>
          )}
          {(row.status === 'Failed' || row.status === 'Success') && (
            <Button size="small" icon={<ReloadOutlined />} onClick={() => handleRetry(row.id)}>
              Chạy lại
            </Button>
          )}
        </Space>
      ),
    },
  ], [handleCancel, handleRetry, navigate])

  const inspectedRagKeywords = useMemo(() => {
    const raw = inspectedJob?.result_json?.knowledge_keywords
    return Array.isArray(raw) ? raw.map((item) => String(item)) : []
  }, [inspectedJob])

  const inspectedRagRecords = useMemo(() => {
    const raw = inspectedJob?.result_json?.knowledge_records
    return Array.isArray(raw) ? raw.filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null) : []
  }, [inspectedJob])

  const inspectedRagRetrieval = useMemo(() => {
    const raw = inspectedJob?.result_json?.knowledge_retrieval
    return raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : null
  }, [inspectedJob])

  const queueTab = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Row gutter={[12, 12]}>
        <Col xs={12} md={4}>
          <Card size="small" loading={loading}>
            <Statistic title="Đang chờ" value={overview?.queue.counts.pending ?? 0} />
          </Card>
        </Col>
        <Col xs={12} md={4}>
          <Card size="small" loading={loading}>
            <Statistic title="Đang chạy" value={overview?.queue.counts.running ?? 0} />
          </Card>
        </Col>
        <Col xs={12} md={4}>
          <Card size="small" loading={loading}>
            <Statistic
              title="Tỷ lệ thành công 24g"
              value={overview?.queue.last_24h.success_rate ?? 0}
              suffix="%"
            />
          </Card>
        </Col>
        <Col xs={12} md={4}>
          <Card size="small" loading={loading}>
            <Statistic
              title="Độ trễ TB / P95"
              value={formatLatency(overview?.queue.last_24h.avg_latency_ms ?? null)}
              suffix={overview?.queue.last_24h.p95_latency_ms !== null && overview?.queue.last_24h.p95_latency_ms !== undefined
                ? ` / ${formatLatency(overview.queue.last_24h.p95_latency_ms)}`
                : ''}
            />
          </Card>
        </Col>
        <Col xs={12} md={4}>
          <Card size="small" loading={loading}>
            <Statistic title="Tokens 24g" value={overview?.queue.last_24h.total_tokens ?? 0} />
          </Card>
        </Col>
        <Col xs={12} md={4}>
          <Card size="small" loading={loading}>
            <Statistic title="Bản ghi tri thức" value={overview?.rag.total_knowledge ?? 0} />
          </Card>
        </Col>
      </Row>

      <Row gutter={[12, 12]}>
        <Col xs={24} lg={12}>
          <Card size="small" title={`Nhà cung cấp LLM (${overview?.llm.enabled ?? 0}/${overview?.llm.total ?? 0} đang bật)`}>
            <Space wrap>
              {Object.entries(overview?.llm.tag_coverage ?? {}).map(([tag, count]) => (
                <Tag key={tag} color={count > 0 ? 'blue' : 'red'}>
                  {tag}: {count}
                </Tag>
              ))}
            </Space>
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card size="small" title="Worker xử lý nền">
            {overview?.workers_available ? (
              <Space wrap>
                {overview.workers.map((worker) => (
                  <Tag key={worker.worker_type} color={WORKER_STATE_COLORS[worker.state] || 'default'}>
                    {worker.display_name}: {localizeWithMap(worker.state, WORKER_STATE_LABELS)}
                  </Tag>
                ))}
              </Space>
            ) : (
              <Typography.Text type="secondary">Không có dữ liệu nhịp tim (heartbeat) của worker.</Typography.Text>
            )}
          </Card>
        </Col>
      </Row>

      <Card
        size="small"
        title="Hàng đợi phân tích vụ việc (CaseAnalysisJob)"
        extra={(
          <Space wrap>
            <Input.Search
              allowClear
              placeholder="Tìm mã vụ việc, tiêu đề, model, lỗi"
              value={searchText}
              onChange={(event) => {
                setSearchText(event.target.value)
                if (!event.target.value) {
                  setPage(1)
                  setAppliedSearch('')
                }
              }}
              onSearch={(val) => {
                setPage(1)
                setAppliedSearch(val.trim())
              }}
              style={{ width: 250 }}
            />
            <Select
              value={statusFilter}
              options={STATUS_FILTER_OPTIONS}
              onChange={(val) => {
                setPage(1)
                setStatusFilter(val)
              }}
              style={{ width: 160 }}
            />
            <Space size={6}>
              <Switch checked={autoRefresh} onChange={setAutoRefresh} />
              <span>Tự động 10 giây</span>
            </Space>
            <Button icon={<ReloadOutlined />} onClick={reloadMonitor}>Làm mới</Button>
            <Button type="primary" icon={<PlayCircleOutlined />} onClick={() => setTriggerOpen(true)}>
              Chạy phân tích
            </Button>
          </Space>
        )}
      >
        <Table<AgenticJobListItem>
          rowKey="id"
          size="small"
          loading={loading}
          columns={jobColumns}
          dataSource={jobs}
          scroll={{ x: 1580 }}
          pagination={{
            current: page,
            pageSize: 20,
            total: totalJobs,
            showSizeChanger: false,
            onChange: setPage,
          }}
        />
      </Card>
    </div>
  )

  const promptTab = (
    <Row gutter={[12, 12]}>
      <Col xs={24} lg={8}>
        <Card
          size="small"
          title="Mẫu Prompt"
          extra={(
            <Select
              size="small"
              value={promptLanguage}
              onChange={(lang) => {
                setLoadingPrompts(true)
                setPromptLanguage(lang)
              }}
              options={[
                { label: 'Tiếng Anh (en)', value: 'en' },
                { label: 'Tiếng Trung (zh)', value: 'zh' },
              ]}
              style={{ width: 145 }}
            />
          )}
        >
          <Table<AgenticPromptItem>
            rowKey="prompt_id"
            size="small"
            loading={loadingPrompts}
            pagination={false}
            dataSource={prompts}
            onRow={(row) => ({
              onClick: () => setSelectedPromptId(row.prompt_id),
              style: {
                cursor: 'pointer',
                background: row.prompt_id === selectedPromptId ? 'rgba(22, 119, 255, 0.14)' : undefined,
              },
            })}
            columns={[
              { title: 'Prompt ID', dataIndex: 'prompt_id', render: (val: string) => <Typography.Text code>{val}</Typography.Text> },
              { title: 'Nguồn', dataIndex: 'source', width: 90, render: (val: string) => <Tag color={val === 'builtin' ? 'blue' : 'purple'}>{val}</Tag> },
              { title: 'Số dòng', dataIndex: 'line_count', width: 80 },
            ]}
          />
        </Card>
      </Col>
      <Col xs={24} lg={16}>
        <Card size="small" title={selectedPrompt ? `${selectedPrompt.prompt_id} (${selectedPrompt.line_count} dòng)` : 'Chọn một mẫu Prompt'}>
          {selectedPrompt ? (
            <pre style={{ margin: 0, maxHeight: '62vh', overflow: 'auto', whiteSpace: 'pre-wrap', fontFamily: fontFamilyMono, fontSize: 12 }}>
              {selectedPrompt.content}
            </pre>
          ) : (
            <Typography.Text type="secondary">Chưa chọn prompt nào.</Typography.Text>
          )}
        </Card>
      </Col>
    </Row>
  )

  const ragAndRuntimeTab = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Row gutter={[12, 12]}>
        <Col xs={24} lg={10}>
          <Card size="small" title="Chi tiết RAG Kho tri thức">
            <Descriptions size="small" column={2}>
              <Descriptions.Item label="Chế độ">
                <Tag color={overview?.rag.mode === 'hybrid' ? 'green' : 'default'}>
                  {(overview?.rag.mode || 'lexical').toUpperCase()}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="Embedding Model">
                {overview?.rag.embedding_model || (overview?.rag.embedding_configured ? 'đã cấu hình' : '—')}
              </Descriptions.Item>
              <Descriptions.Item label="Tổng cộng">{overview?.rag.total_knowledge ?? 0}</Descriptions.Item>
              <Descriptions.Item label="Đã đánh chỉ mục Vector (DB)">{overview?.rag.indexed_knowledge ?? 0}</Descriptions.Item>
              <Descriptions.Item label="Thủ công">{overview?.rag.manual_knowledge ?? 0}</Descriptions.Item>
              <Descriptions.Item label="Từ vụ việc">{overview?.rag.case_knowledge ?? 0}</Descriptions.Item>
              <Descriptions.Item label="Chỉ mục Redis Stack">
                <Tag color={overview?.rag.redis_vector_available ? 'blue' : 'orange'}>
                  {overview?.rag.redis_vector_available
                    ? `${overview?.rag.redis_vector_docs ?? 0} tài liệu (${overview?.rag.redis_vector_dimensions ?? '?'}d)`
                    : 'Dự phòng Postgres'}
                </Tag>
              </Descriptions.Item>
            </Descriptions>
            <div style={{ marginTop: 12 }}>
              <Typography.Text strong>Từ khóa truy xuất gần đây</Typography.Text>
              <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {(overview?.rag.top_keywords.length ?? 0) > 0
                  ? overview?.rag.top_keywords.map((item) => (
                    <Tag key={item.keyword} color="cyan">{item.keyword} ({item.count})</Tag>
                  ))
                  : <Typography.Text type="secondary">Chưa ghi nhận từ khóa nào.</Typography.Text>}
              </div>
            </div>
          </Card>
        </Col>
        <Col xs={24} lg={14}>
          <Card size="small" title="Các module đọc Stream">
            <Table
              rowKey="name"
              size="small"
              pagination={false}
              dataSource={overview?.runtime.modules.items ?? []}
              columns={[
                { title: 'Module', dataIndex: 'name', width: 200 },
                { title: 'Stream', dataIndex: 'stream_name', width: 180, render: (val: string) => <Typography.Text code>{val}</Typography.Text> },
                { title: 'Số luồng', dataIndex: 'thread_num', width: 90 },
                {
                  title: 'Độ dài Stream',
                  key: 'length',
                  render: (_, row) => row.stream_health?.available ? row.stream_health.length : (row.stream_health?.warning || '—'),
                },
              ]}
            />
          </Card>
        </Col>
      </Row>

      <Card size="small" title="Các Playbook đã đăng ký">
        <Table
          rowKey="name"
          size="small"
          pagination={false}
          dataSource={overview?.runtime.playbooks.items ?? []}
          columns={[
            { title: 'Playbook', dataIndex: 'name', width: 220 },
            { title: 'Mức rủi ro', dataIndex: 'risk_level', width: 120, render: (val: string) => severityTag(val) },
            { title: 'Nguồn', dataIndex: 'source', width: 100, render: (val: string) => <Tag color={val === 'official' ? 'blue' : 'purple'}>{val}</Tag> },
            {
              title: 'Thẻ',
              dataIndex: 'tags',
              width: 240,
              render: (tags: string[]) => (tags || []).map((tag) => <Tag key={tag}>{tag}</Tag>),
            },
            { title: 'Mô tả', dataIndex: 'description' },
          ]}
        />
      </Card>
    </div>
  )

  return (
    <div style={{ height: '100%', minHeight: 0, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
      {error ? <Alert type="error" showIcon title={error} /> : null}
      <Tabs
        defaultActiveKey="queue"
        items={[
          {
            key: 'queue',
            label: <IconTabLabel icon={Bot}>Hàng đợi & Giám sát</IconTabLabel>,
            children: queueTab,
          },
          {
            key: 'prompts',
            label: <IconTabLabel icon={FileCode2}>Prompts</IconTabLabel>,
            children: promptTab,
          },
          {
            key: 'rag-runtime',
            label: <IconTabLabel icon={Workflow}>RAG & Runtime</IconTabLabel>,
            children: ragAndRuntimeTab,
          },
        ]}
      />

      <Drawer
        title={inspectedJob ? `Chi tiết tác vụ · ${inspectedJob.case_readable_id.toUpperCase()}` : 'Chi tiết tác vụ'}
        size="large"
        open={inspectOpen}
        onClose={() => setInspectOpen(false)}
      >
        {loadingInspect ? <Spin /> : inspectedJob ? (
          <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
            <Descriptions size="small" bordered column={2}>
              <Descriptions.Item label="Trạng thái">
                <Tag color={JOB_STATUS_COLORS[inspectedJob.status]}>{localizeWithMap(inspectedJob.status, PLAYBOOK_JOB_STATUS_LABELS)}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="Nguồn kích hoạt">{inspectedJob.trigger || '—'}</Descriptions.Item>
              <Descriptions.Item label="Nhà cung cấp">{inspectedJob.provider_name || '—'}</Descriptions.Item>
              <Descriptions.Item label="Model">{inspectedJob.model_name || '—'}</Descriptions.Item>
              <Descriptions.Item label="Độ trễ">{formatLatency(inspectedJob.latency_ms)}</Descriptions.Item>
              <Descriptions.Item label="Tokens">
                {inspectedJob.total_tokens ?? '—'} (vào: {inspectedJob.input_tokens ?? '—'}, ra: {inspectedJob.output_tokens ?? '—'})
              </Descriptions.Item>
              <Descriptions.Item label="Phiên bản Prompt">{inspectedJob.prompt_version || '—'}</Descriptions.Item>
              <Descriptions.Item label="Hoàn thành lúc">{formatDateTime(inspectedJob.completed_at)}</Descriptions.Item>
            </Descriptions>

            {inspectedJob.error && (
              <Alert type="error" showIcon title="Lỗi tác vụ" description={<pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{inspectedJob.error}</pre>} />
            )}

            <Card size="small" title={<IconTabLabel icon={BookOpenText}>Ngữ cảnh RAG</IconTabLabel>}>
              <Space orientation="vertical" style={{ width: '100%' }}>
                {inspectedRagRetrieval ? (
                  <div>
                    <Typography.Text strong>Truy xuất: </Typography.Text>
                    <Tag color={inspectedRagRetrieval.mode === 'hybrid' ? 'green' : 'blue'}>
                      {String(inspectedRagRetrieval.mode || 'lexical').toUpperCase()}
                    </Tag>
                    <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                      từ khóa={String(inspectedRagRetrieval.lexical_hits ?? 0)}, vector={String(inspectedRagRetrieval.semantic_hits ?? 0)} ({String(inspectedRagRetrieval.vector_backend || 'none')})
                    </Typography.Text>
                  </div>
                ) : null}
                <div>
                  <Typography.Text strong>Từ khóa: </Typography.Text>
                  {inspectedRagKeywords.length
                    ? inspectedRagKeywords.map((kw) => <Tag key={kw} color="cyan">{kw}</Tag>)
                    : <Typography.Text type="secondary">Không có</Typography.Text>}
                </div>
                <div>
                  <Typography.Text strong>Bản ghi truy xuất ({inspectedRagRecords.length}): </Typography.Text>
                  {inspectedRagRecords.length
                    ? inspectedRagRecords.map((rec, idx) => (
                      <Tag key={`${String(rec.knowledge_id || idx)}`} color="blue">
                        {String(rec.title || rec.knowledge_id || 'Bản ghi')}
                      </Tag>
                    ))
                    : <Typography.Text type="secondary">Không có</Typography.Text>}
                </div>
              </Space>
            </Card>

            <Card size="small" title="Dữ liệu JSON kết quả phân tích gốc">
              <JsonViewer value={inspectedJob.result_json} maxHeight={420} />
            </Card>
          </Space>
        ) : null}
      </Drawer>

      <Modal
        title="Kích hoạt điều tra vụ việc bằng AI"
        open={triggerOpen}
        onCancel={() => setTriggerOpen(false)}
        onOk={handleTrigger}
        okText="Đưa vào hàng đợi"
        confirmLoading={triggering}
        destroyOnHidden
      >
        <Space orientation="vertical" style={{ width: '100%' }}>
          <span>Nhập Mã vụ việc (ví dụ: case_000001) hoặc UUID vụ việc để đưa tác vụ điều tra AI vào hàng đợi ngay.</span>
          <Input
            value={triggerCaseId}
            onChange={(event) => setTriggerCaseId(event.target.value)}
            placeholder="case_000001"
            onPressEnter={handleTrigger}
          />
        </Space>
      </Modal>
    </div>
  )
}
