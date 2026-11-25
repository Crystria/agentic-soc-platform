import {type ReactNode, useState} from 'react'
import type {DescriptionsProps} from 'antd'
import {Alert, Button, Descriptions, Input, Space} from 'antd'
import {CheckOutlined, CloseOutlined, SafetyCertificateOutlined} from '@ant-design/icons'
import {approvePlaybookRun, rejectPlaybookRun} from '../api/aiDecision'
import {useAuthStore} from '../stores/auth'
import {message} from '../utils/appMessage'
import {DescriptionValue} from './DescriptionValue'
import {descriptionStyles} from './descriptionValueStyles'
import {emptyValue, formatDateTime, formatDurationSeconds, severityTag} from '../utils/recordDisplay'
import {monoTextStyle} from '../utils/typography'
import PlaybookRunMessagesView from './PlaybookRunMessagesView'

type RecordRow = Record<string, unknown>

interface PlaybookBasicViewProps {
  record: RecordRow
  onOpenResource?: (resourceKey: string, rowId: string | number) => void
  onRefresh?: () => void
  renderStatus: (value: unknown) => ReactNode
}

const value = (record: RecordRow, key: string) => record[key]
const stringValue = (record: RecordRow, key: string) => emptyValue(value(record, key))
const upperStringValue = (record: RecordRow, key: string) => {
  const displayValue = stringValue(record, key)
  return displayValue === '—' ? displayValue : displayValue.toUpperCase()
}

function apiErrorMessage(error: unknown, fallback: string) {
  const data = (error as { response?: { data?: unknown } }).response?.data
  if (typeof data === 'string') return data
  if (data && typeof data === 'object' && 'detail' in data) {
    return String((data as { detail?: unknown }).detail || fallback)
  }
  return fallback
}

function SummarySection({items}: {items: DescriptionsProps['items']}) {
  return (
    <Descriptions
      size="small"
      layout="vertical"
      colon={false}
      column={4}
      items={items}
      styles={descriptionStyles}
    />
  )
}

function item(key: string, label: string, children: ReactNode, span?: number) {
  return {
    key,
    label,
    span,
    children: <DescriptionValue>{children}</DescriptionValue>,
  }
}

function blockItem(key: string, label: string, children: string) {
  return {
    key,
    label,
    span: 4,
    children: <DescriptionValue minHeight={96} height="auto" multiline>{children}</DescriptionValue>,
  }
}

export default function PlaybookBasicView({ record, onOpenResource, onRefresh, renderStatus }: PlaybookBasicViewProps) {
  const user = useAuthStore((s) => s.user)
  const canDecide = Boolean(user && user.role !== 'viewer')
  const [approvalNote, setApprovalNote] = useState('')
  const [submittingAction, setSubmittingAction] = useState<'approve' | 'reject' | null>(null)

  const playbookRunId = String(value(record, 'id') || '')
  const jobStatus = String(value(record, 'job_status') || '')
  const riskLevel = String(value(record, 'risk_level') || '')
  const caseRowId = value(record, 'case_id') as string | number | null | undefined
  const caseReadableId = upperStringValue(record, 'case_readable_id')
  const caseLabel = caseReadableId === '—'
    ? upperStringValue(record, 'case_id')
    : caseReadableId
  const canOpenCase = Boolean(caseRowId !== null && caseRowId !== undefined && onOpenResource)

  const handleDecision = async (decision: 'approve' | 'reject') => {
    if (!playbookRunId) return
    setSubmittingAction(decision)
    try {
      if (decision === 'approve') {
        await approvePlaybookRun(playbookRunId, approvalNote)
        message.success('Playbook approved and queued for execution')
      } else {
        await rejectPlaybookRun(playbookRunId, approvalNote)
        message.success('Playbook run rejected')
      }
      setApprovalNote('')
      onRefresh?.()
    } catch (error) {
      message.error(apiErrorMessage(error, `Failed to ${decision} playbook run`))
    } finally {
      setSubmittingAction(null)
    }
  }

  const caseLink = canOpenCase && caseRowId !== null && caseRowId !== undefined ? (
    <Button
      type="link"
      size="small"
      style={{ padding: 0, height: 'auto' }}
      onClick={() => onOpenResource?.('cases', caseRowId)}
    >
      {caseLabel}
    </Button>
  ) : caseLabel

  const summaryItems: DescriptionsProps['items'] = [
    { key: 'playbook-id', label: 'Playbook ID', children: <DescriptionValue mono>{upperStringValue(record, 'playbook_id')}</DescriptionValue> },
    item('status', 'Status', renderStatus(value(record, 'job_status'))),
    item('risk-level', 'Risk Level', severityTag(riskLevel)),
    item('case', 'Case', caseLink),
    item('user', 'Requested By', stringValue(record, 'user_username')),
    item('name', 'Name', stringValue(record, 'name')),
    item('approved-by', 'Reviewed By', stringValue(record, 'approved_by_username')),
    item('approved-at', 'Reviewed Time', formatDateTime(String(value(record, 'approved_at') || ''))),
    { key: 'job-id', label: 'Job ID', children: <DescriptionValue><span style={monoTextStyle}>{stringValue(record, 'job_id')}</span></DescriptionValue> },
    item('started-at', 'Started Time', formatDateTime(String(value(record, 'started_at') || ''))),
    item('finished-at', 'Finished Time', formatDateTime(String(value(record, 'finished_at') || ''))),
    item('duration', 'Duration', formatDurationSeconds(value(record, 'duration_seconds'))),
  ]

  const inputItems: DescriptionsProps['items'] = [
    blockItem('user-input', 'User Input', stringValue(record, 'user_input')),
    blockItem('approval-note', 'Approval Note', stringValue(record, 'approval_note')),
    blockItem('remark', 'Remark', stringValue(record, 'remark')),
  ]

  return (
    <div style={{ padding: '20px 20px 16px', overflow: 'auto', height: '100%', boxSizing: 'border-box' }}>
      {jobStatus === 'Awaiting Approval' && (
        <Alert
          type="warning"
          showIcon
          icon={<SafetyCertificateOutlined />}
          style={{ marginBottom: 16 }}
          title={`Human-in-the-Loop Approval Required (${riskLevel || 'High'} Risk)`}
          description={(
            <Space orientation="vertical" style={{ width: '100%', marginTop: 6 }}>
              <span>This playbook will remain paused until an analyst approves or rejects execution.</span>
              {canDecide && (
                <Space wrap style={{ width: '100%' }}>
                  <Input
                    value={approvalNote}
                    onChange={(event) => setApprovalNote(event.target.value)}
                    placeholder="Optional approval or rejection rationale"
                    style={{ width: 320 }}
                    disabled={submittingAction !== null}
                  />
                  <Button
                    type="primary"
                    icon={<CheckOutlined />}
                    loading={submittingAction === 'approve'}
                    disabled={submittingAction === 'reject'}
                    onClick={() => handleDecision('approve')}
                  >
                    Approve & Queue
                  </Button>
                  <Button
                    danger
                    icon={<CloseOutlined />}
                    loading={submittingAction === 'reject'}
                    disabled={submittingAction === 'approve'}
                    onClick={() => handleDecision('reject')}
                  >
                    Reject
                  </Button>
                </Space>
              )}
            </Space>
          )}
        />
      )}
      <SummarySection items={summaryItems} />
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(320px, 2fr) minmax(0, 3fr)',
        gap: 24,
        alignItems: 'start',
        marginTop: 24,
      }}>
        <div style={{minWidth: 0}}>
          <Descriptions
            size="small"
            layout="vertical"
            colon={false}
            column={4}
            items={inputItems}
            styles={descriptionStyles}
          />
        </div>
        <div style={{minWidth: 0}}>
          <PlaybookRunMessagesView playbookRunId={playbookRunId} refreshToken={record} />
        </div>
      </div>
    </div>
  )
}
