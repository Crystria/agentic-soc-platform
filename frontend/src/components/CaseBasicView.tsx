import {type ReactNode, useEffect, useMemo, useState} from 'react'
import type {DescriptionsProps} from 'antd'
import {Alert, Button, Checkbox, Descriptions, Input, Modal, Space, Tag} from 'antd'
import {CheckOutlined, RobotOutlined, SlidersOutlined} from '@ant-design/icons'
import type {ChoiceOption, FieldEditingController} from '../types/records'
import client from '../api/client'
import {type AiAssessmentFieldKey, applyCaseAiAssessment} from '../api/aiDecision'
import {message} from '../utils/appMessage'
import {AI_FIELD_LABELS, localizeAiFieldList, localizeChoiceLabel} from '../utils/i18n'
import {DescriptionValue, EditableDescriptionValue} from './DescriptionValue'
import DetailSectionDivider from './DetailSectionDivider'
import {descriptionStyles} from './descriptionValueStyles'
import {InlineDateTimeEditor, InlineMarkdownEditor, InlineSelectEditor, InlineTagChoiceEditor, InlineUserEditor} from './InlineFieldEditors'
import MarkdownPreview from './MarkdownPreview'
import {caseCategoryTag, emptyValue, emptyValueNode, formatDateTime, formatDurationSeconds, severityTag, statusTag, verdictTag} from '../utils/recordDisplay'
import {comfortableTagProps} from '../utils/tagStyles'
import {editableLabel} from './editableLabel'

type RecordRow = Record<string, unknown>

interface CaseBasicViewProps {
  record: RecordRow
  fieldController?: FieldEditingController
  onRefresh?: () => void
}

const AI_FIELD_OPTIONS: Array<{ key: AiAssessmentFieldKey; aiKey: string; label: string }> = [
  { key: 'verdict', aiKey: 'verdict_ai', label: AI_FIELD_LABELS.verdict },
  { key: 'severity', aiKey: 'severity_ai', label: AI_FIELD_LABELS.severity },
  { key: 'impact', aiKey: 'impact_ai', label: AI_FIELD_LABELS.impact },
  { key: 'priority', aiKey: 'priority_ai', label: AI_FIELD_LABELS.priority },
  { key: 'confidence', aiKey: 'confidence_ai', label: AI_FIELD_LABELS.confidence },
]

const value = (record: RecordRow, key: string) => record[key]
const stringValue = (record: RecordRow, key: string) => emptyValue(value(record, key))
const upperStringValue = (record: RecordRow, key: string) => {
  const displayValue = stringValue(record, key)
  return displayValue === '—' ? displayValue : displayValue.toUpperCase()
}
const mono = (children: string) => <DescriptionValue mono>{children}</DescriptionValue>
const block = (children: string) => <DescriptionValue height="auto" multiline>{children}</DescriptionValue>
const riskTag = (raw: unknown) => severityTag(String(raw || ''))
const verdictColors: Record<string, string> = {
  Unknown: 'default',
  'False Positive': 'green',
  'True Positive': 'red',
  Disregard: 'default',
  Suspicious: 'orange',
  Benign: 'green',
  Test: 'purple',
  'Insufficient Data': 'gold',
  'Security Risk': 'volcano',
  'Managed Externally': 'blue',
  Duplicate: 'cyan',
  Other: 'default',
}
const tags = (items: unknown) => Array.isArray(items) && items.length
  ? <span style={{ display: 'inline-flex', flexWrap: 'wrap', gap: 4 }}>{items.map((item) => <Tag {...comfortableTagProps} key={String(item)} color="blue" style={{ marginInlineEnd: 0 }}>{String(item)}</Tag>)}</span>
  : emptyValueNode()
const verdictChoiceTag = (next: string, selected?: boolean) => next
  ? <Tag {...comfortableTagProps} variant={selected ? 'solid' : 'outlined'} color={verdictColors[next]} style={{ marginInlineEnd: 0 }}>{localizeChoiceLabel(next)}</Tag>
  : emptyValueNode()

function apiErrorMessage(error: unknown, fallback: string) {
  const data = (error as { response?: { data?: unknown } }).response?.data
  if (typeof data === 'string') return data
  if (data && typeof data === 'object' && 'detail' in data) {
    return String((data as { detail?: unknown }).detail || fallback)
  }
  return fallback
}

function Section({ title, items, showTitle = true }: { title?: string; items: DescriptionsProps['items']; showTitle?: boolean }) {
  return (
    <div style={{ marginTop: showTitle ? 16 : 0 }}>
      {showTitle && title && <DetailSectionDivider title={title} />}
      <Descriptions
        size="small"
        layout="vertical"
        colon={false}
        column={4}
        items={items}
        styles={descriptionStyles}
      />
    </div>
  )
}

function textItem(key: string, label: string, children: ReactNode, span?: number) {
  return {
    key,
    label,
    span,
    children: <DescriptionValue>{children}</DescriptionValue>,
  }
}

function aiComparisonTag(humanVal: unknown, aiVal: unknown, renderTag: (v: unknown) => ReactNode) {
  const aiText = String(aiVal || '')
  const humanText = String(humanVal || '')
  if (!aiText) return renderTag(aiVal)
  const diff = Boolean(humanText && humanText !== aiText)
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
      {renderTag(aiVal)}
      {diff ? <Tag color="orange" style={{ marginInlineEnd: 0 }}>Khác biệt</Tag> : null}
    </span>
  )
}

function optionLabel(options: ChoiceOption[], optionValue: unknown, fallback?: string) {
  const rawValue = optionValue === null || optionValue === undefined ? '' : String(optionValue)
  if (!rawValue) return '—'
  return options.find((option) => String(option.value) === rawValue)?.label || fallback || rawValue
}

function inlineSelectItem(
  key: string,
  label: string,
  fieldKey: string,
  controller: FieldEditingController | undefined,
  fallbackNode: ReactNode,
  allowClear = true,
) {
  const fieldState = controller?.getFieldState(fieldKey)
  return {
    key,
    label: fieldState && controller ? editableLabel(label) : label,
    children: fieldState && controller ? (
      <InlineSelectEditor
        value={fieldState.value ? String(fieldState.value) : null}
        disabled={fieldState.saving}
        options={fieldState.options}
        allowClear={allowClear}
        onStart={() => controller.startFieldEdit(fieldKey)}
        onChange={(next) => controller.setFieldDraftValue(fieldKey, next)}
        onComplete={() => controller.finishFieldEdit(fieldKey)}
        onCancel={() => controller.cancelFieldDraft(fieldKey)}
      />
    ) : <DescriptionValue>{fallbackNode}</DescriptionValue>,
  }
}

export default function CaseBasicView({ record, fieldController, onRefresh }: CaseBasicViewProps) {
  const controller = fieldController
  const assigneeState = controller?.getFieldState('assignee')
  const acknowledgedTimeState = controller?.getFieldState('acknowledged_time')
  const closedTimeState = controller?.getFieldState('closed_time')
  const verdictState = controller?.getFieldState('verdict')
  const summaryState = controller?.getFieldState('summary')
  const editable = Boolean(controller)
  const caseId = String(record.id || '')

  const [userOptions, setUserOptions] = useState<ChoiceOption[]>([])
  const [applyingAi, setApplyingAi] = useState(false)
  const [reviewOpen, setReviewOpen] = useState(false)
  const [selectedFields, setSelectedFields] = useState<AiAssessmentFieldKey[]>([])
  const [copyDigest, setCopyDigest] = useState(false)
  const [decisionNote, setDecisionNote] = useState('')

  useEffect(() => {
    if (!editable) return
    let mounted = true
    client.get<ChoiceOption[]>('/auth/user-options/')
      .then(({ data }) => {
        if (mounted) setUserOptions(data)
      })
      .catch(() => {
        if (mounted) setUserOptions([])
      })
    return () => {
      mounted = false
    }
  }, [editable])

  const availableAiFields = useMemo(
    () => AI_FIELD_OPTIONS.filter((item) => Boolean(String(record[item.aiKey] || '').trim())),
    [record],
  )
  const alignedCount = useMemo(
    () => availableAiFields.filter((item) => String(record[item.key] || '') === String(record[item.aiKey] || '')).length,
    [availableAiFields, record],
  )

  const handleAcceptAllAi = async () => {
    if (!caseId) return
    setApplyingAi(true)
    try {
      const { applied_fields: appliedFields } = await applyCaseAiAssessment(caseId, {
        apply_digest_to_summary: !String(record.summary || '').trim(),
      })
      message.success(`Đã áp dụng đánh giá AI (${localizeAiFieldList(appliedFields)})`)
      onRefresh?.()
    } catch (error) {
      message.error(apiErrorMessage(error, 'Không thể áp dụng đánh giá AI'))
    } finally {
      setApplyingAi(false)
    }
  }

  const openReviewModal = () => {
    setSelectedFields(availableAiFields.map((item) => item.key))
    setCopyDigest(!String(record.summary || '').trim())
    setDecisionNote('')
    setReviewOpen(true)
  }

  const submitReviewModal = async () => {
    if (!caseId || !selectedFields.length) {
      message.warning('Chọn ít nhất một trường AI để áp dụng')
      return
    }
    setApplyingAi(true)
    try {
      const { applied_fields: appliedFields } = await applyCaseAiAssessment(caseId, {
        fields: selectedFields,
        apply_digest_to_summary: copyDigest,
        decision_note: decisionNote,
      })
      message.success(`Đã cập nhật quyết định của chuyên viên (${localizeAiFieldList(appliedFields)})`)
      setReviewOpen(false)
      onRefresh?.()
    } catch (error) {
      message.error(apiErrorMessage(error, 'Không thể lưu quyết định có AI hỗ trợ'))
    } finally {
      setApplyingAi(false)
    }
  }

  const assigneeDisplayValue = assigneeState
    ? optionLabel(userOptions, assigneeState.value, stringValue(record, 'assignee_name'))
    : stringValue(record, 'assignee_name')

  const summaryItems: DescriptionsProps['items'] = [
    { key: 'case-id', label: 'Mã vụ việc', children: mono(upperStringValue(record, 'case_id')) },
    inlineSelectItem('status', 'Trạng thái', 'status', controller, statusTag(String(value(record, 'status') || '')), false),
    {
      key: 'assignee',
      label: assigneeState && controller ? editableLabel('Người phụ trách') : 'Người phụ trách',
      children: assigneeState && controller ? (
        <InlineUserEditor
          value={assigneeState.value ? String(assigneeState.value) : null}
          disabled={assigneeState.saving}
          options={userOptions}
          fallbackLabel={assigneeDisplayValue}
          onStart={() => controller.startFieldEdit('assignee')}
          onChange={(next) => controller.setFieldDraftValue('assignee', next)}
          onComplete={() => controller.finishFieldEdit('assignee')}
          onCancel={() => controller.cancelFieldDraft('assignee')}
        />
      ) : <DescriptionValue>{stringValue(record, 'assignee_name')}</DescriptionValue>,
    },
    textItem('spacer', '', null),
    inlineSelectItem('severity', 'Mức độ nghiêm trọng', 'severity', controller, riskTag(value(record, 'severity'))),
    inlineSelectItem('confidence', 'Độ tin cậy', 'confidence', controller, riskTag(value(record, 'confidence'))),
    inlineSelectItem('impact', 'Tác động', 'impact', controller, riskTag(value(record, 'impact'))),
    inlineSelectItem('priority', 'Độ ưu tiên', 'priority', controller, riskTag(value(record, 'priority'))),
    textItem('severity-ai', 'Mức độ nghiêm trọng (AI)', aiComparisonTag(value(record, 'severity'), value(record, 'severity_ai'), riskTag)),
    textItem('confidence-ai', 'Độ tin cậy (AI)', aiComparisonTag(value(record, 'confidence'), value(record, 'confidence_ai'), riskTag)),
    textItem('impact-ai', 'Tác động (AI)', aiComparisonTag(value(record, 'impact'), value(record, 'impact_ai'), riskTag)),
    textItem('priority-ai', 'Độ ưu tiên (AI)', aiComparisonTag(value(record, 'priority'), value(record, 'priority_ai'), riskTag)),
    textItem('category', 'Danh mục', caseCategoryTag(String(value(record, 'category') || ''))),
    { key: 'correlation-uid', label: 'Correlation UID', children: mono(stringValue(record, 'correlation_uid')) },
    textItem('tags', 'Thẻ (Tags)', tags(value(record, 'tags')), 2),
    { key: 'description', label: 'Mô tả', span: 4, children: block(stringValue(record, 'description')) },
    textItem('first-alert-seen-time', 'Cảnh báo đầu tiên', formatDateTime(String(value(record, 'first_alert_seen_time') || ''))),
    textItem('detection-time', 'Thời gian phát hiện (TTD)', formatDurationSeconds(value(record, 'detection_time_seconds'))),
  ]

  const inProcessItems: DescriptionsProps['items'] = [
    {
      key: 'acknowledged-time',
      label: acknowledgedTimeState && controller ? editableLabel('Thời gian tiếp nhận') : 'Thời gian tiếp nhận',
      children: acknowledgedTimeState && controller ? (
        <EditableDescriptionValue
          state={acknowledgedTimeState}
          editor={(
            <InlineDateTimeEditor
              value={acknowledgedTimeState.value ? String(acknowledgedTimeState.value) : null}
              disabled={acknowledgedTimeState.saving}
              autoFocus={false}
              onChange={(next) => controller.setFieldDraftValue('acknowledged_time', next)}
              onComplete={() => controller.finishFieldEdit('acknowledged_time')}
              onCancel={() => controller.cancelFieldDraft('acknowledged_time')}
            />
          )}
        />
      ) : <DescriptionValue>{formatDateTime(String(value(record, 'acknowledged_time') || ''))}</DescriptionValue>,
    },
    textItem('acknowledgement-time', 'Thời gian tiếp nhận (TTA)', formatDurationSeconds(value(record, 'acknowledgement_time_seconds'))),
  ]

  const resolvedItems: DescriptionsProps['items'] = [
    {
      key: 'closed-time',
      label: closedTimeState && controller ? editableLabel('Thời gian đóng') : 'Thời gian đóng',
      children: closedTimeState && controller ? (
        <EditableDescriptionValue
          state={closedTimeState}
          editor={(
            <InlineDateTimeEditor
              value={closedTimeState.value ? String(closedTimeState.value) : null}
              disabled={closedTimeState.saving}
              autoFocus={false}
              onChange={(next) => controller.setFieldDraftValue('closed_time', next)}
              onComplete={() => controller.finishFieldEdit('closed_time')}
              onCancel={() => controller.cancelFieldDraft('closed_time')}
            />
          )}
        />
      ) : <DescriptionValue>{formatDateTime(String(value(record, 'closed_time') || ''))}</DescriptionValue>,
    },
    textItem('response-time', 'Thời gian xử lý (TTR)', formatDurationSeconds(value(record, 'response_time_seconds'))),
    {
      key: 'verdict',
      label: verdictState && controller ? editableLabel('Phán quyết') : 'Phán quyết',
      children: verdictState && controller ? (
        <InlineTagChoiceEditor
          value={String(verdictState.value ?? '')}
          disabled={verdictState.saving}
          options={verdictState.options}
          renderTag={verdictChoiceTag}
          clearLabel="Bỏ chọn"
          onStart={() => controller.startFieldEdit('verdict')}
          onChange={(next) => controller.setFieldDraftValue('verdict', next)}
          onComplete={() => controller.finishFieldEdit('verdict')}
          onCancel={() => controller.cancelFieldDraft('verdict')}
        />
      ) : <DescriptionValue>{verdictTag(String(value(record, 'verdict') || ''))}</DescriptionValue>,
    },
    textItem('verdict-ai', 'Phán quyết (AI)', aiComparisonTag(value(record, 'verdict'), value(record, 'verdict_ai'), (v) => verdictTag(String(v || '')))),
    {
      key: 'summary',
      label: summaryState && controller ? editableLabel('Tóm tắt') : 'Tóm tắt',
      span: 4,
      children: summaryState && controller ? (
        <InlineMarkdownEditor
          value={String(summaryState.value ?? '')}
          disabled={summaryState.saving}
          height="480px"
          onChange={(next) => controller.setFieldDraftValue('summary', next)}
          onCancel={() => controller.cancelFieldDraft('summary')}
        />
      ) : <MarkdownPreview source={stringValue(record, 'summary')} height="480px" />,
    },
  ]

  return (
    <div style={{ padding: '20px 20px 16px', overflow: 'auto', height: '100%', boxSizing: 'border-box' }}>
      {editable && availableAiFields.length > 0 && (
        <Alert
          type={alignedCount === availableAiFields.length ? 'success' : 'info'}
          showIcon
          icon={<RobotOutlined />}
          style={{ marginBottom: 16 }}
          title={`Trợ lý Quyết định AI (${alignedCount}/${availableAiFields.length} trường khớp nhau)`}
          description="Chấp nhận trực tiếp toàn bộ đánh giá của AI hoặc xem xét và ghi đè từng trường kèm ghi chú của chuyên viên."
          action={(
            <Space wrap>
              <Button size="small" icon={<SlidersOutlined />} onClick={openReviewModal} disabled={applyingAi}>
                Xem xét & Ghi đè
              </Button>
              <Button
                size="small"
                type="primary"
                icon={<CheckOutlined />}
                loading={applyingAi}
                onClick={handleAcceptAllAi}
              >
                Chấp nhận tất cả từ AI
              </Button>
            </Space>
          )}
        />
      )}
      <Section showTitle={false} items={summaryItems} />
      <Section title="Đang xử lý & Tạm hoãn" items={inProcessItems} />
      <Section title="Đã giải quyết & Đóng" items={resolvedItems} />

      <Modal
        title="Xem xét & Áp dụng Đánh giá AI"
        open={reviewOpen}
        onCancel={() => setReviewOpen(false)}
        onOk={submitReviewModal}
        okText="Áp dụng mục đã chọn"
        confirmLoading={applyingAi}
        destroyOnHidden
      >
        <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
          <div>
            <div style={{ marginBottom: 8, fontWeight: 600 }}>Các trường sao chép từ đánh giá AI</div>
            <Checkbox.Group
              value={selectedFields}
              onChange={(values) => setSelectedFields(values as AiAssessmentFieldKey[])}
              style={{ display: 'flex', flexDirection: 'column', gap: 8 }}
            >
              {availableAiFields.map((item) => (
                <Checkbox key={item.key} value={item.key}>
                  <Space size={6}>
                    <span>{item.label}:</span>
                    <Tag color="blue">{localizeChoiceLabel(record[item.aiKey]) || '—'}</Tag>
                    <span style={{ color: 'rgba(255,255,255,0.45)' }}>
                      (hiện tại: {localizeChoiceLabel(record[item.key]) || 'Chưa chọn'})
                    </span>
                  </Space>
                </Checkbox>
              ))}
            </Checkbox.Group>
          </div>
          <Checkbox checked={copyDigest} onChange={(event) => setCopyDigest(event.target.checked)}>
            Sao chép bản tóm tắt điều tra AI vào Tóm tắt vụ việc
          </Checkbox>
          <div>
            <div style={{ marginBottom: 6, fontWeight: 600 }}>Ghi chú quyết định (tùy chọn, sẽ lưu vào Bình luận vụ việc)</div>
            <Input.TextArea
              rows={3}
              value={decisionNote}
              onChange={(event) => setDecisionNote(event.target.value)}
              placeholder="Giải thích lý do bạn chấp nhận hoặc ghi đè khuyến nghị từ AI..."
            />
          </div>
        </Space>
      </Modal>
    </div>
  )
}
