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
  { label: 'All statuses', value: '' },
  { label: 'Pending', value: 'Pending' },
  { label: 'Running', value: 'Running' },
  { label: 'Success', value: 'Success' },
  { label: 'Failed', value: 'Failed' },
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
        setError(apiErrorMessage(requestError, 'Failed to load Agent Monitor telemetry.'))
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
      message.error(apiErrorMessage(requestError, 'Failed to load job details'))
      setInspectOpen(false)
    } finally {
      setLoadingInspect(false)
    }
  }

  const handleRetry = useCallback(async (jobId: string) => {
    try {
      await retryAgenticJob(jobId)
      message.success('Case analysis retry queued')
      reloadMonitor()
    } catch (requestError) {
      message.error(apiErrorMessage(requestError, 'Failed to retry job'))
    }
  }, [reloadMonitor])

  const handleCancel = useCallback(async (jobId: string) => {
    try {
      await cancelAgenticJob(jobId)
      message.success('Pending job cancelled')
      reloadMonitor()
    } catch (requestError) {
      message.error(apiErrorMessage(requestError, 'Failed to cancel job'))
    }
  }, [reloadMonitor])

  const handleTrigger = async () => {
    const trimmed = triggerCaseId.trim()
    if (!trimmed) {
      message.warning('Enter a Case ID (e.g. case_000001 or UUID)')
      return
    }
    setTriggering(true)
    try {
      const created = await triggerAgenticCaseAnalysis(trimmed)
      message.success(`Queued analysis for ${created.case_readable_id.toUpperCase()}`)
      setTriggerOpen(false)
      setTriggerCaseId('')
      reloadMonitor()
    } catch (requestError) {
      message.error(apiErrorMessage(requestError, 'Failed to trigger Case analysis'))
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
      title: 'Case',
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
      title: 'Status',
      dataIndex: 'status',
      width: 110,
      render: (status: AgenticJobStatus) => <Tag color={JOB_STATUS_COLORS[status]}>{status}</Tag>,
    },
    { title: 'Trigger', dataIndex: 'trigger', width: 130, render: (val: string) => val || '—' },
    {
      title: 'Model / Provider',
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
      title: 'AI Result',
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
      title: 'Latency',
      dataIndex: 'latency_ms',
      width: 100,
      render: (ms: number | null) => formatLatency(ms),
    },
    {
      title: 'RAG',
      key: 'rag',
      width: 110,
      render: (_, row) => `${row.knowledge_records_count} rec / ${row.knowledge_keywords_count} kw`,
    },
    {
      title: 'Created',
      dataIndex: 'created_at',
      width: 175,
      render: formatDateTime,
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 190,
      fixed: 'right',
      render: (_, row) => (
        <Space size={4}>
          <Button size="small" icon={<EyeOutlined />} onClick={() => openInspector(row.id)}>
            Inspect
          </Button>
          {row.status === 'Pending' && (
            <Popconfirm title="Cancel this pending job?" onConfirm={() => handleCancel(row.id)}>
              <Button size="small" danger icon={<StopOutlined />} />
            </Popconfirm>
          )}
          {(row.status === 'Failed' || row.status === 'Success') && (
            <Button size="small" icon={<ReloadOutlined />} onClick={() => handleRetry(row.id)}>
              Retry
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

  const queueTab = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Row gutter={[12, 12]}>
        <Col xs={12} md={4}>
          <Card size="small" loading={loading}>
            <Statistic title="Pending" value={overview?.queue.counts.pending ?? 0} />
          </Card>
        </Col>
        <Col xs={12} md={4}>
          <Card size="small" loading={loading}>
            <Statistic title="Running" value={overview?.queue.counts.running ?? 0} />
          </Card>
        </Col>
        <Col xs={12} md={4}>
          <Card size="small" loading={loading}>
            <Statistic
              title="24h Success Rate"
              value={overview?.queue.last_24h.success_rate ?? 0}
              suffix="%"
            />
          </Card>
        </Col>
        <Col xs={12} md={4}>
          <Card size="small" loading={loading}>
            <Statistic
              title="Avg / P95 Latency"
              value={formatLatency(overview?.queue.last_24h.avg_latency_ms ?? null)}
              suffix={overview?.queue.last_24h.p95_latency_ms !== null && overview?.queue.last_24h.p95_latency_ms !== undefined
                ? ` / ${formatLatency(overview.queue.last_24h.p95_latency_ms)}`
                : ''}
            />
          </Card>
        </Col>
        <Col xs={12} md={4}>
          <Card size="small" loading={loading}>
            <Statistic title="24h Tokens" value={overview?.queue.last_24h.total_tokens ?? 0} />
          </Card>
        </Col>
        <Col xs={12} md={4}>
          <Card size="small" loading={loading}>
            <Statistic title="Knowledge Records" value={overview?.rag.total_knowledge ?? 0} />
          </Card>
        </Col>
      </Row>

      <Row gutter={[12, 12]}>
        <Col xs={24} lg={12}>
          <Card size="small" title={`LLM Providers (${overview?.llm.enabled ?? 0}/${overview?.llm.total ?? 0} enabled)`}>
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
          <Card size="small" title="Background Workers">
            {overview?.workers_available ? (
              <Space wrap>
                {overview.workers.map((worker) => (
                  <Tag key={worker.worker_type} color={WORKER_STATE_COLORS[worker.state] || 'default'}>
                    {worker.display_name}: {worker.state}
                  </Tag>
                ))}
              </Space>
            ) : (
              <Typography.Text type="secondary">Worker heartbeat stream unavailable.</Typography.Text>
            )}
          </Card>
        </Col>
      </Row>

      <Card
        size="small"
        title="CaseAnalysisJob Queue"
        extra={(
          <Space wrap>
            <Input.Search
              allowClear
              placeholder="Search Case ID, title, model, error"
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
              style={{ width: 140 }}
            />
            <Space size={6}>
              <Switch checked={autoRefresh} onChange={setAutoRefresh} />
              <span>Auto 10s</span>
            </Space>
            <Button icon={<ReloadOutlined />} onClick={reloadMonitor}>Refresh</Button>
            <Button type="primary" icon={<PlayCircleOutlined />} onClick={() => setTriggerOpen(true)}>
              Trigger Analysis
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
          title="Prompt Templates"
          extra={(
            <Select
              size="small"
              value={promptLanguage}
              onChange={(lang) => {
                setLoadingPrompts(true)
                setPromptLanguage(lang)
              }}
              options={[
                { label: 'English (en)', value: 'en' },
                { label: 'Chinese (zh)', value: 'zh' },
              ]}
              style={{ width: 130 }}
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
              { title: 'Source', dataIndex: 'source', width: 90, render: (val: string) => <Tag color={val === 'builtin' ? 'blue' : 'purple'}>{val}</Tag> },
              { title: 'Lines', dataIndex: 'line_count', width: 70 },
            ]}
          />
        </Card>
      </Col>
      <Col xs={24} lg={16}>
        <Card size="small" title={selectedPrompt ? `${selectedPrompt.prompt_id} (${selectedPrompt.line_count} lines)` : 'Select a prompt'}>
          {selectedPrompt ? (
            <pre style={{ margin: 0, maxHeight: '62vh', overflow: 'auto', whiteSpace: 'pre-wrap', fontFamily: fontFamilyMono, fontSize: 12 }}>
              {selectedPrompt.content}
            </pre>
          ) : (
            <Typography.Text type="secondary">No prompt selected.</Typography.Text>
          )}
        </Card>
      </Col>
    </Row>
  )

  const ragAndRuntimeTab = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Row gutter={[12, 12]}>
        <Col xs={24} lg={10}>
          <Card size="small" title="Knowledge Base RAG Breakdown">
            <Descriptions size="small" column={3}>
              <Descriptions.Item label="Total">{overview?.rag.total_knowledge ?? 0}</Descriptions.Item>
              <Descriptions.Item label="Manual">{overview?.rag.manual_knowledge ?? 0}</Descriptions.Item>
              <Descriptions.Item label="Case-Derived">{overview?.rag.case_knowledge ?? 0}</Descriptions.Item>
            </Descriptions>
            <div style={{ marginTop: 12 }}>
              <Typography.Text strong>Recent Retrieved Keywords</Typography.Text>
              <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {(overview?.rag.top_keywords.length ?? 0) > 0
                  ? overview?.rag.top_keywords.map((item) => (
                    <Tag key={item.keyword} color="cyan">{item.keyword} ({item.count})</Tag>
                  ))
                  : <Typography.Text type="secondary">No keywords recorded yet.</Typography.Text>}
              </div>
            </div>
          </Card>
        </Col>
        <Col xs={24} lg={14}>
          <Card size="small" title="Stream Consumer Modules">
            <Table
              rowKey="name"
              size="small"
              pagination={false}
              dataSource={overview?.runtime.modules.items ?? []}
              columns={[
                { title: 'Module', dataIndex: 'name', width: 200 },
                { title: 'Stream', dataIndex: 'stream_name', width: 180, render: (val: string) => <Typography.Text code>{val}</Typography.Text> },
                { title: 'Threads', dataIndex: 'thread_num', width: 80 },
                {
                  title: 'Stream Length',
                  key: 'length',
                  render: (_, row) => row.stream_health?.available ? row.stream_health.length : (row.stream_health?.warning || '—'),
                },
              ]}
            />
          </Card>
        </Col>
      </Row>

      <Card size="small" title="Registered Playbooks">
        <Table
          rowKey="name"
          size="small"
          pagination={false}
          dataSource={overview?.runtime.playbooks.items ?? []}
          columns={[
            { title: 'Playbook', dataIndex: 'name', width: 220 },
            { title: 'Risk Level', dataIndex: 'risk_level', width: 120, render: (val: string) => severityTag(val) },
            { title: 'Source', dataIndex: 'source', width: 100, render: (val: string) => <Tag color={val === 'official' ? 'blue' : 'purple'}>{val}</Tag> },
            {
              title: 'Tags',
              dataIndex: 'tags',
              width: 240,
              render: (tags: string[]) => (tags || []).map((tag) => <Tag key={tag}>{tag}</Tag>),
            },
            { title: 'Description', dataIndex: 'description' },
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
            label: <IconTabLabel icon={Bot}>Queue & Telemetry</IconTabLabel>,
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
        title={inspectedJob ? `Job Inspector · ${inspectedJob.case_readable_id.toUpperCase()}` : 'Job Inspector'}
        size="large"
        open={inspectOpen}
        onClose={() => setInspectOpen(false)}
      >
        {loadingInspect ? <Spin /> : inspectedJob ? (
          <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
            <Descriptions size="small" bordered column={2}>
              <Descriptions.Item label="Status">
                <Tag color={JOB_STATUS_COLORS[inspectedJob.status]}>{inspectedJob.status}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="Trigger">{inspectedJob.trigger || '—'}</Descriptions.Item>
              <Descriptions.Item label="Provider">{inspectedJob.provider_name || '—'}</Descriptions.Item>
              <Descriptions.Item label="Model">{inspectedJob.model_name || '—'}</Descriptions.Item>
              <Descriptions.Item label="Latency">{formatLatency(inspectedJob.latency_ms)}</Descriptions.Item>
              <Descriptions.Item label="Tokens">
                {inspectedJob.total_tokens ?? '—'} (in: {inspectedJob.input_tokens ?? '—'}, out: {inspectedJob.output_tokens ?? '—'})
              </Descriptions.Item>
              <Descriptions.Item label="Prompt Version">{inspectedJob.prompt_version || '—'}</Descriptions.Item>
              <Descriptions.Item label="Completed">{formatDateTime(inspectedJob.completed_at)}</Descriptions.Item>
            </Descriptions>

            {inspectedJob.error && (
              <Alert type="error" showIcon title="Job Error" description={<pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{inspectedJob.error}</pre>} />
            )}

            <Card size="small" title={<IconTabLabel icon={BookOpenText}>RAG Context</IconTabLabel>}>
              <Space orientation="vertical" style={{ width: '100%' }}>
                <div>
                  <Typography.Text strong>Keywords: </Typography.Text>
                  {inspectedRagKeywords.length
                    ? inspectedRagKeywords.map((kw) => <Tag key={kw} color="cyan">{kw}</Tag>)
                    : <Typography.Text type="secondary">None</Typography.Text>}
                </div>
                <div>
                  <Typography.Text strong>Retrieved Records ({inspectedRagRecords.length}): </Typography.Text>
                  {inspectedRagRecords.length
                    ? inspectedRagRecords.map((rec, idx) => (
                      <Tag key={`${String(rec.knowledge_id || idx)}`} color="blue">
                        {String(rec.title || rec.knowledge_id || 'Record')}
                      </Tag>
                    ))
                    : <Typography.Text type="secondary">None</Typography.Text>}
                </div>
              </Space>
            </Card>

            <Card size="small" title="Raw Analysis Record JSON">
              <JsonViewer value={inspectedJob.result_json} maxHeight={420} />
            </Card>
          </Space>
        ) : null}
      </Drawer>

      <Modal
        title="Trigger Case AI Investigation"
        open={triggerOpen}
        onCancel={() => setTriggerOpen(false)}
        onOk={handleTrigger}
        okText="Queue Analysis"
        confirmLoading={triggering}
        destroyOnHidden
      >
        <Space orientation="vertical" style={{ width: '100%' }}>
          <span>Enter the Case ID (for example: case_000001) or Case UUID to enqueue an immediate AI investigation job.</span>
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
