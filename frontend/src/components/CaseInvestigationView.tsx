import {useCallback, useEffect, useMemo, useRef, useState} from 'react'
import {Alert, Button, Card, Space, Spin, Table, Tag} from 'antd'
import {CheckOutlined, ReloadOutlined, RobotOutlined} from '@ant-design/icons'
import type {ColumnsType} from 'antd/es/table'
import client from '../api/client'
import {
  type AiQualityFieldComparison,
  type CaseAiQualityPayload,
  applyCaseAiAssessment,
  fetchCaseAiQuality,
  triggerCaseAiAnalysis,
} from '../api/aiDecision'
import {useAuthStore} from '../stores/auth'
import {message} from '../utils/appMessage'
import {
  AI_FIELD_LABELS,
  COVERAGE_STATE_LABELS,
  PLAYBOOK_JOB_STATUS_LABELS,
  localizeAiFieldList,
  localizeChoiceLabel,
  localizeWithMap,
} from '../utils/i18n'
import {CasePlaybookRunModal} from './CasePlaybookRunModal'
import InvestigationReportView from './InvestigationReportView'

interface CaseInvestigationViewProps {
  caseId: string
  hasSummary?: boolean
  onRefresh?: () => void
}

interface CaseInvestigationResponse {
  investigation_report_ai_json: unknown
}

function errorMessage(error: unknown) {
  const data = (error as { response?: { data?: unknown } }).response?.data
  if (typeof data === 'string') return data
  if (data && typeof data === 'object' && 'detail' in data) {
    return String((data as { detail?: unknown }).detail || 'Không thể tải báo cáo điều tra')
  }
  return 'Không thể tải báo cáo điều tra'
}

function agreementTag(row: AiQualityFieldComparison) {
  if (row.agrees === true) return <Tag color="green">Khớp</Tag>
  if (row.agrees === false) return <Tag color="orange">Lệch</Tag>
  return <Tag>Chưa thể đánh giá</Tag>
}

function directionLabel(row: AiQualityFieldComparison) {
  if (!row.direction || row.distance === null) return '—'
  if (row.direction === 'match') return 'Chính xác (0)'
  return `${row.direction === 'overestimate' ? 'AI đánh giá cao hơn' : 'AI đánh giá thấp hơn'} (${row.distance})`
}

export default function CaseInvestigationView({ caseId, hasSummary = false, onRefresh }: CaseInvestigationViewProps) {
  const user = useAuthStore((s) => s.user)
  const canWrite = Boolean(user && user.role !== 'viewer')
  const [value, setValue] = useState<unknown>('')
  const [quality, setQuality] = useState<CaseAiQualityPayload | null>(null)
  const [loading, setLoading] = useState(false)
  const [applying, setApplying] = useState(false)
  const [analyzing, setAnalyzing] = useState(false)
  const [remediationPrompt, setRemediationPrompt] = useState<string | null>(null)
  const [error, setError] = useState('')
  const requestIdRef = useRef(0)

  const loadReport = useCallback(() => {
    if (!caseId) return
    const requestId = requestIdRef.current + 1
    requestIdRef.current = requestId
    setLoading(true)
    setError('')

    Promise.all([
      client.get<CaseInvestigationResponse>(`/cases/${encodeURIComponent(caseId)}/investigation/`),
      fetchCaseAiQuality(caseId).catch(() => null),
    ])
      .then(([investigationResp, qualityResp]) => {
        if (requestId !== requestIdRef.current) return
        setValue(investigationResp.data.investigation_report_ai_json || '')
        setQuality(qualityResp)
      })
      .catch((loadError) => {
        if (requestId !== requestIdRef.current) return
        setValue('')
        setQuality(null)
        setError(errorMessage(loadError))
      })
      .finally(() => {
        if (requestId === requestIdRef.current) setLoading(false)
      })
  }, [caseId])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadReport()
    return () => {
      requestIdRef.current += 1
    }
  }, [loadReport])

  const hasAiValues = useMemo(
    () => Boolean(quality?.fields.some((item) => Boolean(item.ai_value))),
    [quality],
  )

  const handleApplyAi = async () => {
    if (!caseId) return
    setApplying(true)
    try {
      const { applied_fields: appliedFields } = await applyCaseAiAssessment(caseId, {
        apply_digest_to_summary: !hasSummary,
      })
      message.success(`Đã áp dụng đánh giá AI (${localizeAiFieldList(appliedFields)})`)
      onRefresh?.()
      loadReport()
    } catch (applyError) {
      message.error(errorMessage(applyError))
    } finally {
      setApplying(false)
    }
  }

  const handleTriggerAnalysis = async () => {
    if (!caseId) return
    setAnalyzing(true)
    try {
      const job = await triggerCaseAiAnalysis(caseId)
      message.success(`Đã xếp hàng đợi tác vụ điều tra AI (${localizeWithMap(job.status, PLAYBOOK_JOB_STATUS_LABELS, job.status)})`)
    } catch (analyzeError) {
      message.error(errorMessage(analyzeError))
    } finally {
      setAnalyzing(false)
    }
  }

  const comparisonColumns = useMemo<ColumnsType<AiQualityFieldComparison>>(() => [
    {
      title: 'Trường',
      dataIndex: 'label',
      width: 140,
      render: (val: string, row) => AI_FIELD_LABELS[row.field] || val,
    },
    {
      title: 'Giá trị AI',
      dataIndex: 'ai_value',
      width: 170,
      render: (val: string) => val ? <Tag color="blue">{localizeChoiceLabel(val)}</Tag> : '—',
    },
    {
      title: 'Chuyên viên chọn',
      dataIndex: 'human_value',
      width: 170,
      render: (val: string) => val ? <Tag>{localizeChoiceLabel(val)}</Tag> : '—',
    },
    {
      title: 'Độ khớp',
      key: 'agreement',
      width: 150,
      render: (_, row) => agreementTag(row),
    },
    {
      title: 'Xu hướng / Độ lệch',
      key: 'direction',
      width: 200,
      render: (_, row) => directionLabel(row),
    },
  ], [])

  if (loading) return <Spin style={{ margin: 32 }} />
  if (error) {
    return (
      <div style={{ padding: 20 }}>
        <Alert
          type="error"
          showIcon
          title={error}
          action={<Button size="small" icon={<ReloadOutlined />} onClick={loadReport}>Thử lại</Button>}
        />
      </div>
    )
  }

  return (
    <div style={{ height: '100%', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
      {quality && (
        <div style={{ padding: '16px 20px 0' }}>
          <Card
            size="small"
            title={(
              <Space size={8}>
                <RobotOutlined />
                <span>Đối chiếu Đánh giá AI – Chuyên viên</span>
                <Tag color={quality.coverage_state === 'Evaluated' ? 'green' : 'gold'}>
                  {quality.is_preview
                    ? `Xem trước · ${localizeWithMap(quality.coverage_state, COVERAGE_STATE_LABELS, quality.coverage_state)}`
                    : localizeWithMap(quality.coverage_state, COVERAGE_STATE_LABELS, quality.coverage_state)}
                </Tag>
              </Space>
            )}
            extra={canWrite ? (
              <Space wrap>
                <Button size="small" icon={<ReloadOutlined />} loading={analyzing} onClick={handleTriggerAnalysis}>
                  Chạy lại phân tích AI
                </Button>
                {hasAiValues && (
                  <Button
                    size="small"
                    type="primary"
                    icon={<CheckOutlined />}
                    loading={applying}
                    onClick={handleApplyAi}
                  >
                    Áp dụng giá trị AI
                  </Button>
                )}
              </Space>
            ) : null}
          >
            <Table<AiQualityFieldComparison>
              rowKey="field"
              size="small"
              pagination={false}
              columns={comparisonColumns}
              dataSource={quality.fields}
            />
          </Card>
        </div>
      )}

      <div style={{ flex: 1, minHeight: 0 }}>
        <InvestigationReportView
          value={value}
          onRunRemediation={canWrite ? (rec) => {
            const actionType = String(rec.action_type || 'Remediation')
            const description = String(rec.description || '')
            setRemediationPrompt(`[${actionType}] ${description}`.trim())
          } : undefined}
        />
      </div>

      {remediationPrompt !== null && (
        <CasePlaybookRunModal
          open
          caseId={caseId}
          initialUserInput={remediationPrompt}
          onClose={() => setRemediationPrompt(null)}
          onSubmitted={() => {
            onRefresh?.()
            loadReport()
          }}
        />
      )}
    </div>
  )
}
