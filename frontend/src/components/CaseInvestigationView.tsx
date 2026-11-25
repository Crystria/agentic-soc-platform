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
    return String((data as { detail?: unknown }).detail || 'Failed to load investigation report')
  }
  return 'Failed to load investigation report'
}

function agreementTag(row: AiQualityFieldComparison) {
  if (row.agrees === true) return <Tag color="green">Match</Tag>
  if (row.agrees === false) return <Tag color="orange">Mismatch</Tag>
  return <Tag>Not evaluable</Tag>
}

function directionLabel(row: AiQualityFieldComparison) {
  if (!row.direction || row.distance === null) return '—'
  if (row.direction === 'match') return 'Exact (0)'
  return `${row.direction === 'overestimate' ? 'AI higher' : 'AI lower'} (${row.distance})`
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
      message.success(`Applied AI assessment (${appliedFields.join(', ')})`)
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
      message.success(`Queued AI investigation job (${job.status})`)
    } catch (analyzeError) {
      message.error(errorMessage(analyzeError))
    } finally {
      setAnalyzing(false)
    }
  }

  const comparisonColumns = useMemo<ColumnsType<AiQualityFieldComparison>>(() => [
    { title: 'Field', dataIndex: 'label', width: 120 },
    {
      title: 'AI Value',
      dataIndex: 'ai_value',
      width: 160,
      render: (val: string) => val ? <Tag color="blue">{val}</Tag> : '—',
    },
    {
      title: 'Human Value',
      dataIndex: 'human_value',
      width: 160,
      render: (val: string) => val ? <Tag>{val}</Tag> : '—',
    },
    {
      title: 'Agreement',
      key: 'agreement',
      width: 140,
      render: (_, row) => agreementTag(row),
    },
    {
      title: 'Direction / Distance',
      key: 'direction',
      width: 180,
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
          action={<Button size="small" icon={<ReloadOutlined />} onClick={loadReport}>Retry</Button>}
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
                <span>AI–Human Assessment Alignment</span>
                <Tag color={quality.coverage_state === 'Evaluated' ? 'green' : 'gold'}>
                  {quality.is_preview ? `Preview · ${quality.coverage_state}` : quality.coverage_state}
                </Tag>
              </Space>
            )}
            extra={canWrite ? (
              <Space wrap>
                <Button size="small" icon={<ReloadOutlined />} loading={analyzing} onClick={handleTriggerAnalysis}>
                  Re-run AI Analysis
                </Button>
                {hasAiValues && (
                  <Button
                    size="small"
                    type="primary"
                    icon={<CheckOutlined />}
                    loading={applying}
                    onClick={handleApplyAi}
                  >
                    Apply AI Values
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
