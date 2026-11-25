import {useEffect, useMemo, useState} from 'react'
import {Alert, Card, Col, Row, Select, Space, Statistic, Switch, Table, Tag, Typography} from 'antd'
import type {ColumnsType} from 'antd/es/table'
import {
  type AiQualityEvaluationItem,
  type AiQualityFieldAgreement,
  type AiQualityOrdinalStat,
  type AiQualitySummaryResponse,
  fetchAiQualityEvaluations,
  fetchAiQualitySummary,
} from '../api/aiDecision'
import {formatDateTime} from '../utils/recordDisplay'

const DAY_OPTIONS = [
  { label: 'Last 7 days', value: 7 },
  { label: 'Last 30 days', value: 30 },
  { label: 'Last 90 days', value: 90 },
  { label: 'Last 180 days', value: 180 },
]

const COVERAGE_OPTIONS = [
  { label: 'All states', value: '' },
  { label: 'Evaluated', value: 'Evaluated' },
  { label: 'No prediction', value: 'No prediction' },
  { label: 'Invalid prediction', value: 'Invalid prediction' },
]

const SEVERITY_OPTIONS = [
  { label: 'All severities', value: '' },
  { label: 'Critical', value: 'Critical' },
  { label: 'High', value: 'High' },
  { label: 'Medium', value: 'Medium' },
  { label: 'Low', value: 'Low' },
  { label: 'Informational', value: 'Informational' },
]

function errorMessage(error: unknown) {
  const detail = (error as { response?: { data?: { detail?: unknown } } }).response?.data?.detail
  return typeof detail === 'string' ? detail : 'Failed to load AI quality metrics.'
}

export default function AIQualitySettings() {
  const [days, setDays] = useState(30)
  const [coverageState, setCoverageState] = useState('')
  const [humanSeverity, setHumanSeverity] = useState('')
  const [onlyMismatches, setOnlyMismatches] = useState(false)
  const [page, setPage] = useState(1)
  const [summary, setSummary] = useState<AiQualitySummaryResponse | null>(null)
  const [samples, setSamples] = useState<AiQualityEvaluationItem[]>([])
  const [totalSamples, setTotalSamples] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    const params = {
      days,
      coverage_state: coverageState || undefined,
      human_severity: humanSeverity || undefined,
      only_mismatches: onlyMismatches || undefined,
      page,
      page_size: 20,
    }

    Promise.all([fetchAiQualitySummary(params), fetchAiQualityEvaluations(params)])
      .then(([summaryData, evalData]) => {
        if (!active) return
        setSummary(summaryData)
        setSamples(evalData.results)
        setTotalSamples(evalData.count)
        setError('')
      })
      .catch((requestError) => {
        if (!active) return
        setError(errorMessage(requestError))
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
  }, [coverageState, days, humanSeverity, onlyMismatches, page])

  const agreementColumns = useMemo<ColumnsType<AiQualityFieldAgreement>>(() => [
    { title: 'Field', dataIndex: 'label', width: 140 },
    {
      title: 'Agreement Rate',
      dataIndex: 'agreement_rate',
      width: 140,
      render: (value: number | null) => value === null ? '—' : `${value}%`,
    },
    {
      title: 'Agreed / Evaluable',
      key: 'counts',
      render: (_, row) => `${row.agreed_count} / ${row.evaluable_count}`,
    },
  ], [])

  const ordinalColumns = useMemo<ColumnsType<AiQualityOrdinalStat>>(() => [
    { title: 'Field', dataIndex: 'label', width: 120 },
    { title: 'Samples', dataIndex: 'sample_count', width: 90 },
    {
      title: 'Mean Distance',
      dataIndex: 'mean_absolute_distance',
      width: 120,
      render: (value: number | null) => value === null ? '—' : value,
    },
    { title: 'Match', dataIndex: 'match_count', width: 80 },
    { title: 'AI Higher', dataIndex: 'overestimate_count', width: 95 },
    { title: 'AI Lower', dataIndex: 'underestimate_count', width: 95 },
  ], [])

  const sampleColumns = useMemo<ColumnsType<AiQualityEvaluationItem>>(() => [
    {
      title: 'Case',
      dataIndex: 'case_readable_id',
      width: 120,
      render: (val: string) => <Typography.Text code>{String(val || '').toUpperCase()}</Typography.Text>,
    },
    { title: 'Title', dataIndex: 'case_title', width: 240, ellipsis: true },
    {
      title: 'Coverage',
      dataIndex: 'coverage_state',
      width: 140,
      render: (val: string) => <Tag color={val === 'Evaluated' ? 'green' : 'gold'}>{val}</Tag>,
    },
    {
      title: 'Verdict (AI vs Human)',
      key: 'verdict',
      width: 240,
      render: (_, row) => (
        <Space size={4}>
          <Tag color="blue">{row.fields.verdict.ai_value || '—'}</Tag>
          <span>/</span>
          <Tag>{row.fields.verdict.human_value || '—'}</Tag>
          {row.fields.verdict.agrees === false ? <Tag color="orange">Mismatch</Tag> : null}
        </Space>
      ),
    },
    {
      title: 'Severity (AI vs Human)',
      key: 'severity',
      width: 220,
      render: (_, row) => (
        <Space size={4}>
          <Tag color="blue">{row.fields.severity.ai_value || '—'}</Tag>
          <span>/</span>
          <Tag>{row.fields.severity.human_value || '—'}</Tag>
        </Space>
      ),
    },
    {
      title: 'Closed At',
      dataIndex: 'closed_at',
      width: 180,
      render: formatDateTime,
    },
  ], [])

  const agreementRows = summary ? Object.values(summary.field_agreements) : []
  const ordinalRows = summary ? Object.values(summary.ordinal_stats) : []

  return (
    <div style={{ height: '100%', overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Space wrap>
        <Select value={days} options={DAY_OPTIONS} onChange={(val) => { setPage(1); setDays(val) }} style={{ width: 150 }} />
        <Select value={coverageState} options={COVERAGE_OPTIONS} onChange={(val) => { setPage(1); setCoverageState(val) }} style={{ width: 170 }} />
        <Select value={humanSeverity} options={SEVERITY_OPTIONS} onChange={(val) => { setPage(1); setHumanSeverity(val) }} style={{ width: 160 }} />
        <Space size={8}>
          <Switch checked={onlyMismatches} onChange={(checked) => { setPage(1); setOnlyMismatches(checked) }} />
          <span>Only Mismatches</span>
        </Space>
      </Space>

      {error ? <Alert type="error" showIcon title={error} /> : null}

      <Row gutter={[12, 12]}>
        <Col xs={12} md={6}>
          <Card size="small" loading={loading}>
            <Statistic title="Closed Cases" value={summary?.coverage.total_closed ?? 0} />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card size="small" loading={loading}>
            <Statistic
              title="Prediction Coverage"
              value={summary?.coverage.coverage_rate ?? 0}
              suffix="%"
            />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card size="small" loading={loading}>
            <Statistic title="No Prediction" value={summary?.coverage.no_prediction ?? 0} />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card size="small" loading={loading}>
            <Statistic title="Invalid Prediction" value={summary?.coverage.invalid_prediction ?? 0} />
          </Card>
        </Col>
      </Row>

      <Row gutter={[12, 12]}>
        <Col xs={24} lg={11}>
          <Card size="small" title="AI–Human Agreement Rates">
            <Table<AiQualityFieldAgreement>
              rowKey="field"
              size="small"
              loading={loading}
              pagination={false}
              columns={agreementColumns}
              dataSource={agreementRows}
            />
          </Card>
        </Col>
        <Col xs={24} lg={13}>
          <Card size="small" title="Ordinal Alignment & Distance">
            <Table<AiQualityOrdinalStat>
              rowKey="field"
              size="small"
              loading={loading}
              pagination={false}
              columns={ordinalColumns}
              dataSource={ordinalRows}
            />
          </Card>
        </Col>
      </Row>

      <Card size="small" title="Closed Case Evaluations">
        <Table<AiQualityEvaluationItem>
          rowKey="id"
          size="small"
          loading={loading}
          columns={sampleColumns}
          dataSource={samples}
          scroll={{ x: 1080 }}
          pagination={{
            current: page,
            pageSize: 20,
            total: totalSamples,
            showSizeChanger: false,
            onChange: setPage,
          }}
        />
      </Card>
    </div>
  )
}
