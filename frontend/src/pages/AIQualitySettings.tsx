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
import {
  AI_FIELD_LABELS,
  COVERAGE_STATE_LABELS,
  localizeChoiceLabel,
  localizeWithMap,
  SEVERITY_LABELS,
} from '../utils/i18n'

const DAY_OPTIONS = [
  { label: '7 ngày qua', value: 7 },
  { label: '30 ngày qua', value: 30 },
  { label: '90 ngày qua', value: 90 },
  { label: '180 ngày qua', value: 180 },
]

const COVERAGE_OPTIONS = [
  { label: 'Tất cả trạng thái', value: '' },
  { label: COVERAGE_STATE_LABELS.Evaluated, value: 'Evaluated' },
  { label: COVERAGE_STATE_LABELS['No prediction'], value: 'No prediction' },
  { label: COVERAGE_STATE_LABELS['Invalid prediction'], value: 'Invalid prediction' },
]

const SEVERITY_OPTIONS = [
  { label: 'Tất cả mức độ', value: '' },
  { label: SEVERITY_LABELS.Critical, value: 'Critical' },
  { label: SEVERITY_LABELS.High, value: 'High' },
  { label: SEVERITY_LABELS.Medium, value: 'Medium' },
  { label: SEVERITY_LABELS.Low, value: 'Low' },
  { label: SEVERITY_LABELS.Informational, value: 'Informational' },
]

function errorMessage(error: unknown) {
  const detail = (error as { response?: { data?: { detail?: unknown } } }).response?.data?.detail
  return typeof detail === 'string' ? detail : 'Không thể tải chỉ số chất lượng AI.'
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
    { title: 'Trường dữ liệu', dataIndex: 'field', width: 140, render: (val: string, row) => AI_FIELD_LABELS[val] || row.label },
    {
      title: 'Tỷ lệ đồng thuận',
      dataIndex: 'agreement_rate',
      width: 140,
      render: (value: number | null) => value === null ? '—' : `${value}%`,
    },
    {
      title: 'Đồng thuận / Đánh giá được',
      key: 'counts',
      render: (_, row) => `${row.agreed_count} / ${row.evaluable_count}`,
    },
  ], [])

  const ordinalColumns = useMemo<ColumnsType<AiQualityOrdinalStat>>(() => [
    { title: 'Trường dữ liệu', dataIndex: 'field', width: 120, render: (val: string, row) => AI_FIELD_LABELS[val] || row.label },
    { title: 'Số mẫu', dataIndex: 'sample_count', width: 90 },
    {
      title: 'Khoảng cách TB',
      dataIndex: 'mean_absolute_distance',
      width: 120,
      render: (value: number | null) => value === null ? '—' : value,
    },
    { title: 'Khớp', dataIndex: 'match_count', width: 80 },
    { title: 'AI cao hơn', dataIndex: 'overestimate_count', width: 95 },
    { title: 'AI thấp hơn', dataIndex: 'underestimate_count', width: 95 },
  ], [])

  const sampleColumns = useMemo<ColumnsType<AiQualityEvaluationItem>>(() => [
    {
      title: 'Vụ việc',
      dataIndex: 'case_readable_id',
      width: 120,
      render: (val: string) => <Typography.Text code>{String(val || '').toUpperCase()}</Typography.Text>,
    },
    { title: 'Tiêu đề', dataIndex: 'case_title', width: 240, ellipsis: true },
    {
      title: 'Độ phủ',
      dataIndex: 'coverage_state',
      width: 140,
      render: (val: string) => <Tag color={val === 'Evaluated' ? 'green' : 'gold'}>{localizeWithMap(val, COVERAGE_STATE_LABELS)}</Tag>,
    },
    {
      title: 'Phán quyết (AI / Người)',
      key: 'verdict',
      width: 240,
      render: (_, row) => (
        <Space size={4}>
          <Tag color="blue">{row.fields.verdict.ai_value ? localizeChoiceLabel(row.fields.verdict.ai_value) : '—'}</Tag>
          <span>/</span>
          <Tag>{row.fields.verdict.human_value ? localizeChoiceLabel(row.fields.verdict.human_value) : '—'}</Tag>
          {row.fields.verdict.agrees === false ? <Tag color="orange">Lệch</Tag> : null}
        </Space>
      ),
    },
    {
      title: 'Mức độ (AI / Người)',
      key: 'severity',
      width: 220,
      render: (_, row) => (
        <Space size={4}>
          <Tag color="blue">{row.fields.severity.ai_value ? localizeChoiceLabel(row.fields.severity.ai_value) : '—'}</Tag>
          <span>/</span>
          <Tag>{row.fields.severity.human_value ? localizeChoiceLabel(row.fields.severity.human_value) : '—'}</Tag>
        </Space>
      ),
    },
    {
      title: 'Đóng lúc',
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
          <span>Chỉ hiện sai lệch</span>
        </Space>
      </Space>

      {error ? <Alert type="error" showIcon title={error} /> : null}

      <Row gutter={[12, 12]}>
        <Col xs={12} md={6}>
          <Card size="small" loading={loading}>
            <Statistic title="Vụ việc đã đóng" value={summary?.coverage.total_closed ?? 0} />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card size="small" loading={loading}>
            <Statistic
              title="Tỷ lệ có dự đoán AI"
              value={summary?.coverage.coverage_rate ?? 0}
              suffix="%"
            />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card size="small" loading={loading}>
            <Statistic title="Chưa có dự đoán" value={summary?.coverage.no_prediction ?? 0} />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card size="small" loading={loading}>
            <Statistic title="Dự đoán không hợp lệ" value={summary?.coverage.invalid_prediction ?? 0} />
          </Card>
        </Col>
      </Row>

      <Row gutter={[12, 12]}>
        <Col xs={24} lg={11}>
          <Card size="small" title="Tỷ lệ đồng thuận AI – Chuyên viên">
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
          <Card size="small" title="Căn chỉnh & sai số theo thứ tự">
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

      <Card size="small" title="Đánh giá các vụ việc đã đóng">
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
