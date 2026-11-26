import {
    ApiOutlined,
    BlockOutlined,
    CheckCircleOutlined,
    FileTextOutlined,
    PauseCircleOutlined,
    PlayCircleOutlined,
    PlusCircleOutlined,
    StopOutlined,
    SyncOutlined,
    UserOutlined,
} from '@ant-design/icons'
import {BookOpenText, BrainCircuit, BriefcaseBusiness, Fingerprint, Link2, Siren, WandSparkles} from 'lucide-react'
import AlertBasicView from '../components/AlertBasicView'
import ArtifactBasicView from '../components/ArtifactBasicView'
import CaseBasicView from '../components/CaseBasicView'
import CaseInvestigationView from '../components/CaseInvestigationView'
import CaseKnowledgeView from '../components/CaseKnowledgeView'
import CasePlaybookAction from '../components/CasePlaybookRunModal'
import CaseRelationshipsView from '../components/CaseRelationshipsView'
import EnrichmentBasicView from '../components/EnrichmentBasicView'
import KnowledgeBasicView from '../components/KnowledgeBasicView'
import OverflowTags from '../components/OverflowTags'
import PlaybookBasicView from '../components/PlaybookBasicView'
import RelatedEnrichmentsTable, {type EnrichmentTargetType} from '../components/RelatedEnrichmentsTable'
import RelatedRecordsTable from '../components/RelatedRecordsTable'
import UserAvatar from '../components/UserAvatar'
import type {AdvancedFilterFieldConfig, OpenResourceOptions, ResourceColumn, ResourceConfig} from '../types/records'
import {typography} from '../utils/typography'
import {
    alertActionTag,
    alertAnalyticTypeTag,
    alertDispositionTag,
    artifactRoleTag,
    caseCategoryTag,
    choiceTag,
    emptyValue,
    emptyValueNode,
    enrichmentTypeTag,
    formatDateTime,
    formatDurationSeconds,
    knowledgeSourceTag,
    localizedChoiceTag,
    productCategoryTag,
    severityTag,
    statusTag,
    verdictTag
} from '../utils/recordDisplay'
import {
    ALERT_ANALYTIC_STATE_LABELS,
    ALERT_POLICY_TYPE_LABELS,
    ARTIFACT_TYPE_LABELS,
    CASE_STATUS_LABELS,
    localizeWithMap,
    PLAYBOOK_JOB_STATUS_LABELS,
    SEVERITY_LABELS,
    USER_ROLE_LABELS,
    VERDICT_LABELS,
} from '../utils/i18n'

type RecordRow = Record<string, unknown>
type RecordTabRenderOptions = {
    onOpenResource?: (resourceKey: string, rowId: string | number, options?: OpenResourceOptions) => void
    onChanged?: () => void
    onRefresh?: () => void
}

const lucideIconProps = {size: '1em', strokeWidth: 2}
const value = (record: RecordRow, key: string) => record[key]
const stringValue = (record: RecordRow, key: string) => emptyValue(value(record, key))
const viewRelatedLabel = (count: unknown) => (
    <span style={{display: 'inline-flex', alignItems: 'center', gap: 4}}>
        <BlockOutlined/>
        {`Xem (${Number(count || 0)})`}
    </span>
)
const playbookCaseLabel = (record: RecordRow) => {
    const readableId = stringValue(record, 'case_readable_id')
    const title = stringValue(record, 'case_title')
    if (readableId === '—') return title
    if (title === '—') return readableId
    return `${readableId.toUpperCase()} / ${title}`
}
const linkedObjectResourceKey = (record: RecordRow) => {
    const model = String(value(record, 'content_type_model') || '')
    const resources: Record<string, string> = {
        case: 'cases',
        alert: 'alerts',
        artifact: 'artifacts',
    }
    return resources[model]
}
const upperStringValue = (record: RecordRow, key: string) => {
    const displayValue = stringValue(record, key)
    return displayValue === '—' ? displayValue : displayValue.toUpperCase()
}
const date = (field: string) => (_: unknown, record: RecordRow) => formatDateTime(String(value(record, field) || ''))
const confidenceTag = (v: unknown) => severityTag(String(v || ''))
const priorityTag = (v: unknown) => severityTag(String(v || ''))
const userRoleTag = (v: unknown) => {
    const role = String(v || '')
    const colors: Record<string, string> = {admin: 'purple', user: 'blue', viewer: 'default'}
    return choiceTag(localizeWithMap(role, USER_ROLE_LABELS, ''), colors[role])
}
const authTypeTag = (v: unknown) => {
    const authType = String(v || '')
    return choiceTag(authType === 'ldap' ? 'LDAP' : 'Nội bộ', authType === 'ldap' ? 'geekblue' : 'green')
}
const activeStatusTag = (v: unknown) => {
    const active = v === true || v === 'true'
    return choiceTag(active ? 'Hoạt động' : 'Vô hiệu', active ? 'green' : 'red')
}
const llmProviderStatusTag = (v: unknown) => {
    const enabled = v === true || v === 'true'
    return choiceTag(enabled ? 'Bật' : 'Tắt', enabled ? 'green' : 'default')
}
const customVariableSecretTag = (v: unknown) => {
    const secret = v === true || v === 'true'
    return choiceTag(secret ? 'Bí mật' : 'Thường', secret ? 'purple' : 'default')
}
const customVariableConfiguredTag = (v: unknown) => {
    const configured = v === true || v === 'true'
    return choiceTag(configured ? 'Đã cấu hình' : 'Chưa cấu hình', configured ? 'green' : 'red')
}
const customVariableTypeOptions = [
    {label: 'Chuỗi ký tự', value: 'string'},
    {label: 'Số nguyên', value: 'integer'},
    {label: 'Số thực', value: 'float'},
    {label: 'Boolean', value: 'boolean'},
    {label: 'Danh sách', value: 'list'},
    {label: 'Từ điển', value: 'dictionary'},
]
const customVariableTypeTag = (v: unknown) => {
    const type = String(v || '')
    const option = customVariableTypeOptions.find((item) => item.value === type)
    return choiceTag(option?.label || type, 'blue')
}
const llmTagColors: Record<string, string> = {
    fast: 'blue',
    powerful: 'purple',
    tool_calling: 'geekblue',
    structured_output: 'green',
}
const llmTagOptions = [
    {label: 'fast', value: 'fast'},
    {label: 'powerful', value: 'powerful'},
    {label: 'tool_calling', value: 'tool_calling'},
    {label: 'structured_output', value: 'structured_output'},
]
const llmTags = (items: unknown) => {
    const tagItems = Array.isArray(items) ? items : (items ? [items] : [])
    return (
        <span style={{display: 'inline-flex', alignItems: 'center', gap: 4, flexWrap: 'wrap'}}>
            {tagItems.map((item) => {
                const tag = String(item)
                return <span key={tag}>{choiceTag(tag, llmTagColors[tag] || 'default')}</span>
            })}
        </span>
    )
}
const playbookJobStatusTag = (v: unknown) => {
    const status = String(v || '')
    const options = [
        {label: 'Chờ phê duyệt', value: 'Awaiting Approval', color: 'gold'},
        {label: 'Thành công', value: 'Success', color: 'green'},
        {label: 'Thất bại', value: 'Failed', color: 'red'},
        {label: 'Đang chờ', value: 'Pending', color: 'gold'},
        {label: 'Đang chạy', value: 'Running', color: 'processing'},
        {label: 'Đã từ chối', value: 'Rejected', color: 'red'},
    ]
    const option = options.find((item) => item.value === status)
    const color = markerColor(option?.color)
    if (!status) return emptyValueNode()
    return (
        <span style={{display: 'inline-flex', alignItems: 'center', gap: 6, minWidth: 0}}>
            <span style={{color: color || 'rgba(255,255,255,0.45)', display: 'inline-flex', alignItems: 'center', fontSize: typography.tag.fontSize, flexShrink: 0}}>
                {playbookJobStatusIcon(status)}
            </span>
            <span style={{color, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'}}>{localizeWithMap(status, PLAYBOOK_JOB_STATUS_LABELS)}</span>
        </span>
    )
}
const tags = (items: unknown, color = 'blue') => <OverflowTags items={items} color={color}/>

function relatedTable(
    endpoint: string,
    tableKey: string,
    resourceKey: keyof typeof resourceConfigs,
    baseParams?: Record<string, string>,
    onOpenResource?: (resourceKey: string, rowId: string | number, options?: OpenResourceOptions) => void,
) {
    const config = resourceConfigs[resourceKey]
    return (
        <RelatedRecordsTable
            endpoint={endpoint}
            tableKey={tableKey}
            resourceKey={resourceKey}
            columns={config.columns}
            filters={config.filters}
            advancedFilters={config.advancedFilters}
            baseParams={baseParams}
            onOpenResource={onOpenResource}
        />
    )
}

function relatedEnrichmentsTable(
    targetType: EnrichmentTargetType,
    record: RecordRow,
    onOpenResource?: (resourceKey: string, rowId: string | number, options?: OpenResourceOptions) => void,
    onChanged?: () => void,
) {
    const config = resourceConfigs.enrichments
    const recordId = value(record, 'id')
    const targetId = recordId === null || recordId === undefined ? '' : String(recordId)

    return (
        <RelatedEnrichmentsTable
            targetType={targetType}
            targetId={targetId}
            columns={config.columns}
            filters={config.filters}
            advancedFilters={config.advancedFilters}
            onOpenResource={onOpenResource}
            onChanged={onChanged}
        />
    )
}

const column = (
    key: string,
    title: string,
    width: number,
    options: Partial<ResourceColumn<RecordRow>> = {},
): ResourceColumn<RecordRow> => ({
    key,
    title,
    dataIndex: key,
    width,
    ...options,
})

const field = (key: string, label: string, valueType: AdvancedFilterFieldConfig['valueType']): AdvancedFilterFieldConfig => ({
    key,
    label,
    valueType,
})

const emptyTabs = {
    case: [
        {
            key: 'alerts',
            label: 'Cảnh báo',
            icon: <Siren {...lucideIconProps}/>,
            render: (record: RecordRow, options?: RecordTabRenderOptions) => relatedTable(
                '/alerts/',
                `case-alerts:${record.id}`,
                'alerts',
                {case__id: String(record.id)},
                options?.onOpenResource,
            ),
        },
        {
            key: 'enrichments',
            label: 'Làm giàu dữ liệu',
            icon: <WandSparkles {...lucideIconProps}/>,
            render: (record: RecordRow, options?: RecordTabRenderOptions) => relatedEnrichmentsTable('case', record, options?.onOpenResource, options?.onChanged),
        },
        {
            key: 'related-cases',
            label: 'Vụ việc liên quan',
            icon: <Link2 {...lucideIconProps}/>,
            render: (record: RecordRow, options?: RecordTabRenderOptions) => (
                <CaseRelationshipsView
                    caseId={String(record.id || '')}
                    onOpenCase={(caseId) => options?.onOpenResource?.('cases', caseId)}
                    onChanged={options?.onChanged}
                />
            ),
        },
        {
            key: 'knowledge',
            label: 'Tri thức',
            icon: <BookOpenText {...lucideIconProps}/>,
            render: (record: RecordRow, options?: RecordTabRenderOptions) => (
                <CaseKnowledgeView
                    caseId={String(record.id || '')}
                    editableFields={resourceConfigs.knowledge.editableFields || []}
                    onOpenResource={options?.onOpenResource}
                    onChanged={options?.onChanged}
                />
            ),
        },
        {
            key: 'playbooks',
            label: 'Playbook',
            icon: <BrainCircuit {...lucideIconProps}/>,
            render: (record: RecordRow, options?: RecordTabRenderOptions) => relatedTable(
                '/playbooks/',
                `case-playbooks:${record.id}`,
                'playbooks',
                {case__id: String(record.id)},
                options?.onOpenResource,
            ),
        },
        {
            key: 'investigation',
            label: 'Điều tra',
            icon: <FileTextOutlined/>,
            render: (record: RecordRow, options?: RecordTabRenderOptions) => (
                <CaseInvestigationView
                    caseId={String(record.id || '')}
                    hasSummary={Boolean(record.summary)}
                    onRefresh={options?.onRefresh}
                />
            ),
        },
    ],
    alert: [
        {
            key: 'artifacts',
            label: 'Thực thể',
            icon: <Fingerprint {...lucideIconProps}/>,
            render: (record: RecordRow, options?: RecordTabRenderOptions) => relatedTable(
                '/artifacts/',
                `alert-artifacts:${record.id}`,
                'artifacts',
                {alerts: String(record.id)},
                options?.onOpenResource,
            ),
        },
        {
            key: 'enrichments',
            label: 'Làm giàu dữ liệu',
            icon: <WandSparkles {...lucideIconProps}/>,
            render: (record: RecordRow, options?: RecordTabRenderOptions) => relatedEnrichmentsTable('alert', record, options?.onOpenResource, options?.onChanged),
        },
    ],
    artifact: [
        {
            key: 'alerts',
            label: 'Cảnh báo',
            icon: <Siren {...lucideIconProps}/>,
            render: (record: RecordRow, options?: RecordTabRenderOptions) => relatedTable(
                '/alerts/',
                `artifact-alerts:${record.id}`,
                'alerts',
                {artifacts: String(record.id)},
                options?.onOpenResource,
            ),
        },
        {
            key: 'enrichments',
            label: 'Làm giàu dữ liệu',
            icon: <WandSparkles {...lucideIconProps}/>,
            render: (record: RecordRow, options?: RecordTabRenderOptions) => relatedEnrichmentsTable('artifact', record, options?.onOpenResource, options?.onChanged),
        },
    ],
}
const L80 = 80;
const L96 = 96;
const L120 = 120;
const L132 = 132;
const L160 = 160;
const L200 = 200;
const L240 = 240;
const L280 = 280;
const L360 = 360;
const L400 = 400;
const L480 = 480;
const caseStatusOptions = [
    {label: CASE_STATUS_LABELS.New, value: 'New', color: 'cyan'},
    {label: CASE_STATUS_LABELS['In Progress'], value: 'In Progress', color: 'processing'},
    {label: CASE_STATUS_LABELS['On Hold'], value: 'On Hold', color: 'gold'},
    {label: CASE_STATUS_LABELS.Resolved, value: 'Resolved', color: 'green'},
    {label: CASE_STATUS_LABELS.Closed, value: 'Closed', color: 'default'},
]
const markerColor = (color?: string) => {
    const colors: Record<string, string> = {
        blue: '#1677ff',
        processing: '#1677ff',
        cyan: '#13c2c2',
        gold: '#faad14',
        green: '#52c41a',
        red: '#ff4d4f',
        default: 'rgba(255,255,255,0.35)',
    }
    return color ? colors[color] || color : undefined
}
const caseStatusIcon = (status: string) => {
    if (status === 'New') return <PlusCircleOutlined/>
    if (status === 'In Progress') return <SyncOutlined spin/>
    if (status === 'On Hold') return <PauseCircleOutlined/>
    if (status === 'Resolved') return <CheckCircleOutlined/>
    if (status === 'Closed') return <StopOutlined/>
    return <UserOutlined/>
}
const playbookJobStatusIcon = (status: string) => {
    if (status === 'Awaiting Approval') return <PauseCircleOutlined/>
    if (status === 'Success') return <CheckCircleOutlined/>
    if (status === 'Failed' || status === 'Rejected') return <StopOutlined/>
    if (status === 'Pending') return <PauseCircleOutlined/>
    if (status === 'Running') return <SyncOutlined spin/>
    return <PlayCircleOutlined/>
}
const caseStatusSelectLabel = (raw: unknown) => {
    const status = String(raw || '')
    const option = caseStatusOptions.find((item) => item.value === status)
    const color = markerColor(option?.color)
    if (!status) return emptyValueNode()
    return (
        <span style={{display: 'inline-flex', alignItems: 'center', gap: 6, minWidth: 0}}>
            <span style={{color: color || 'rgba(255,255,255,0.45)', display: 'inline-flex', alignItems: 'center', fontSize: typography.tag.fontSize, flexShrink: 0}}>
                {caseStatusIcon(status)}
            </span>
            <span style={{color, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'}}>{localizeWithMap(status, CASE_STATUS_LABELS)}</span>
        </span>
    )
}
const caseSeverityOptions = [
    {label: SEVERITY_LABELS.Unknown, value: 'Unknown', color: 'default'},
    {label: SEVERITY_LABELS.Informational, value: 'Informational', color: 'blue'},
    {label: SEVERITY_LABELS.Low, value: 'Low', color: 'cyan'},
    {label: SEVERITY_LABELS.Medium, value: 'Medium', color: 'gold'},
    {label: SEVERITY_LABELS.High, value: 'High', color: 'volcano'},
    {label: SEVERITY_LABELS.Critical, value: 'Critical', color: 'red'},
]
const caseImpactPriorityOptions = [
    {label: SEVERITY_LABELS.Unknown, value: 'Unknown', color: 'default'},
    {label: SEVERITY_LABELS.Low, value: 'Low', color: 'cyan'},
    {label: SEVERITY_LABELS.Medium, value: 'Medium', color: 'gold'},
    {label: SEVERITY_LABELS.High, value: 'High', color: 'volcano'},
    {label: SEVERITY_LABELS.Critical, value: 'Critical', color: 'red'},
]
const caseConfidenceOptions = [
    {label: SEVERITY_LABELS.Unknown, value: 'Unknown', color: 'default'},
    {label: SEVERITY_LABELS.Low, value: 'Low', color: 'cyan'},
    {label: SEVERITY_LABELS.Medium, value: 'Medium', color: 'gold'},
    {label: SEVERITY_LABELS.High, value: 'High', color: 'volcano'},
]
const caseVerdictOptions = [
    {label: VERDICT_LABELS.Unknown, value: 'Unknown', color: 'default'},
    {label: VERDICT_LABELS['False Positive'], value: 'False Positive', color: 'green'},
    {label: VERDICT_LABELS['True Positive'], value: 'True Positive', color: 'red'},
    {label: VERDICT_LABELS.Disregard, value: 'Disregard', color: 'default'},
    {label: VERDICT_LABELS.Suspicious, value: 'Suspicious', color: 'orange'},
    {label: VERDICT_LABELS.Benign, value: 'Benign', color: 'green'},
    {label: VERDICT_LABELS.Test, value: 'Test', color: 'purple'},
    {label: VERDICT_LABELS['Insufficient Data'], value: 'Insufficient Data', color: 'gold'},
    {label: VERDICT_LABELS['Security Risk'], value: 'Security Risk', color: 'volcano'},
    {label: VERDICT_LABELS['Managed Externally'], value: 'Managed Externally', color: 'blue'},
    {label: VERDICT_LABELS.Duplicate, value: 'Duplicate', color: 'cyan'},
    {label: VERDICT_LABELS.Other, value: 'Other', color: 'default'},
]
export const resourceConfigs: Record<string, ResourceConfig<RecordRow>> = {
    cases: {
        key: 'cases',
        label: 'Vụ việc',
        icon: <BriefcaseBusiness {...lucideIconProps}/>,
        endpoint: '/cases/',
        rowKey: 'id',
        searchPlaceholder: 'Mã vụ việc, Tiêu đề, Mô tả, Tóm tắt, Correlation UID',
        filters: [
            {key: 'status', label: 'Trạng thái', valueType: 'select', width: L160},
            {key: 'severity', label: 'Mức độ nghiêm trọng', valueType: 'select', width: L160},
            {key: 'assignee', label: 'Người phụ trách', valueType: 'user', width: L160},
        ],
        advancedFilters: [
            field('case_id', 'Mã vụ việc', 'text'),
            field('title', 'Tiêu đề', 'text'),
            field('status', 'Trạng thái', 'select'),
            field('category', 'Danh mục', 'select'),
            field('severity', 'Mức độ nghiêm trọng', 'select'),
            field('assignee', 'Người phụ trách', 'user'),
            field('verdict', 'Phán quyết', 'select'),
            field('priority', 'Độ ưu tiên', 'select'),
            field('confidence', 'Độ tin cậy', 'select'),
            field('impact', 'Tác động', 'select'),
            field('tags', 'Thẻ', 'tag'),
            field('acknowledged_time', 'Thời gian xác nhận', 'date'),
            field('closed_time', 'Thời gian đóng', 'date'),
            field('created_at', 'Thời gian tạo', 'date'),
            field('updated_at', 'Thời gian cập nhật', 'date'),
            field('description', 'Mô tả', 'text'),
            field('summary', 'Tóm tắt', 'text'),
            field('correlation_uid', 'Correlation UID', 'text'),
        ],
        columns: [
            column('case_id', 'Mã vụ việc', L160, {required: true, defaultVisible: true, fixed: 'left', openRecord: true, uppercase: true}),
            column('title', 'Tiêu đề', L480, {required: true, defaultVisible: true, fixed: 'left'}),
            column('status', 'Trạng thái', L132, {defaultVisible: true, sorter: true, render: caseStatusSelectLabel}),
            column('alerts_link', 'Cảnh báo', L132, {
                dataIndex: 'alert_count',
                defaultVisible: true,
                openRecordTab: 'alerts',
                render: viewRelatedLabel,
            }),
            column('playbooks_link', 'Playbook', L132, {
                dataIndex: 'playbook_count',
                defaultVisible: true,
                openRecordTab: 'playbooks',
                render: viewRelatedLabel,
            }),
            column('enrichments_link', 'Làm giàu dữ liệu', L132, {
                dataIndex: 'enrichment_count',
                defaultVisible: true,
                openRecordTab: 'enrichments',
                render: viewRelatedLabel,
            }),
            column('relationships_link', 'Vụ việc liên quan', L132, {
                dataIndex: 'relationship_count',
                openRecordTab: 'related-cases',
                render: viewRelatedLabel,
            }),
            column('category', 'Danh mục', L132, {defaultVisible: true, render: (v) => caseCategoryTag(String(v || ''))}),
            column('severity', 'Mức độ nghiêm trọng', L132, {defaultVisible: true, sorter: true, render: (v) => severityTag(String(v || ''))}),
            column('severity_ai', 'Mức độ (AI)', L132, {defaultVisible: true, sorter: true, render: (v) => severityTag(String(v || ''))}),
            column('confidence', 'Độ tin cậy', L132, {defaultVisible: true, sorter: true, render: confidenceTag}),
            column('confidence_ai', 'Độ tin cậy (AI)', L132, {defaultVisible: true, sorter: true, render: confidenceTag}),
            column('priority', 'Độ ưu tiên', L132, {defaultVisible: true, sorter: true, render: priorityTag}),
            column('priority_ai', 'Độ ưu tiên (AI)', L132, {defaultVisible: true, sorter: true, render: priorityTag}),
            column('impact', 'Tác động', L132, {defaultVisible: true, sorter: true, render: (v) => severityTag(String(v || ''))}),
            column('impact_ai', 'Tác động (AI)', L132, {defaultVisible: true, sorter: true, render: (v) => severityTag(String(v || ''))}),
            column('verdict', 'Phán quyết', L160, {defaultVisible: true, sorter: true, render: (v) => verdictTag(String(v || ''))}),
            column('verdict_ai', 'Phán quyết (AI)', L160, {defaultVisible: true, sorter: true, render: (v) => verdictTag(String(v || ''))}),
            column('assignee_name', 'Người phụ trách', L132, {defaultVisible: true}),
            column('acknowledged_time', 'Thời gian xác nhận', L200, {defaultVisible: true, sorter: true, render: date('acknowledged_time')}),
            column('closed_time', 'Thời gian đóng', L160, {defaultVisible: true, sorter: true, render: date('closed_time')}),
            column('created_at', 'Thời gian tạo', L160, {defaultVisible: true, sorter: true, render: date('created_at')}),
            column('updated_at', 'Cập nhật lần cuối', L160, {defaultVisible: true, sorter: true, render: date('updated_at')}),
            column('tags', 'Thẻ', L400, {render: (v) => tags(v)}),
            column('description', 'Mô tả', L400),
            column('summary', 'Tóm tắt', L400),
            column('correlation_uid', 'Correlation UID', L240),
        ],
        editableFields: [
            {key: 'status', type: 'select', options: caseStatusOptions},
            {key: 'severity', type: 'select', options: caseSeverityOptions},
            {key: 'impact', type: 'select', options: caseImpactPriorityOptions},
            {key: 'priority', type: 'select', options: caseImpactPriorityOptions},
            {key: 'confidence', type: 'select', options: caseConfidenceOptions},
            {key: 'acknowledged_time', type: 'datetime', emptyValue: null},
            {key: 'closed_time', type: 'datetime', emptyValue: null},
            {key: 'assignee', type: 'user', emptyValue: null},
            {key: 'verdict', type: 'text', options: caseVerdictOptions},
            {key: 'summary', type: 'markdown'},
        ],
        detailHeaderActions: CasePlaybookAction,
        basicView: (record, options) => (
            <CaseBasicView
                record={record}
                fieldController={options?.fieldController}
                onRefresh={options?.onRefresh}
            />
        ),
        basicSections: [
            {
                key: 'summary',
                title: 'Tóm tắt',
                fields: [
                    {label: 'Mã vụ việc', value: (r) => upperStringValue(r, 'case_id'), mono: true},
                    {label: 'Trạng thái', value: (r) => statusTag(String(value(r, 'status') || '')), tag: true},
                    {label: 'Tiêu đề', value: (r) => stringValue(r, 'title')},
                ],
            },
            {
                key: 'risk',
                title: 'Đánh giá rủi ro',
                fields: [
                    {label: 'Mức độ nghiêm trọng', value: (r) => severityTag(String(value(r, 'severity') || '')), tag: true},
                    {label: 'Mức độ (AI)', value: (r) => severityTag(String(value(r, 'severity_ai') || '')), tag: true},
                    {label: 'Độ tin cậy', value: (r) => confidenceTag(value(r, 'confidence')), tag: true},
                    {label: 'Độ tin cậy (AI)', value: (r) => confidenceTag(value(r, 'confidence_ai')), tag: true},
                    {label: 'Tác động', value: (r) => severityTag(String(value(r, 'impact') || '')), tag: true},
                    {label: 'Tác động (AI)', value: (r) => severityTag(String(value(r, 'impact_ai') || '')), tag: true},
                    {label: 'Độ ưu tiên', value: (r) => priorityTag(value(r, 'priority')), tag: true},
                    {label: 'Độ ưu tiên (AI)', value: (r) => priorityTag(value(r, 'priority_ai')), tag: true},
                ],
            },
            {
                key: 'classification',
                title: 'Phân loại',
                fields: [
                    {label: 'Danh mục', value: (r) => caseCategoryTag(String(value(r, 'category') || '')), tag: true},
                    {label: 'Thẻ', value: (r) => tags(value(r, 'tags'))},
                    {label: 'Phán quyết', value: (r) => verdictTag(String(value(r, 'verdict') || '')), tag: true},
                    {label: 'Phán quyết (AI)', value: (r) => verdictTag(String(value(r, 'verdict_ai') || '')), tag: true},
                ],
            },
            {
                key: 'time',
                title: 'Thời gian',
                fields: [
                    {label: 'Thời gian xác nhận', value: (r) => formatDateTime(String(value(r, 'acknowledged_time') || ''))},
                    {label: 'Thời gian đóng', value: (r) => formatDateTime(String(value(r, 'closed_time') || ''))},
                ],
            },
            {
                key: 'ownership',
                title: 'Phân công xử lý',
                fields: [
                    {label: 'Người phụ trách', value: (r) => stringValue(r, 'assignee_name')},
                ],
            },
            {
                key: 'description',
                title: 'Mô tả',
                fields: [
                    {label: 'Mô tả', value: (r) => stringValue(r, 'description')},
                    {label: 'Tóm tắt', value: (r) => stringValue(r, 'summary')},
                    {label: 'Correlation UID', value: (r) => stringValue(r, 'correlation_uid'), mono: true},
                ],
            },
        ],
        tabs: emptyTabs.case,
    },
    alerts: {
        key: 'alerts',
        label: 'Cảnh báo',
        icon: <Siren {...lucideIconProps}/>,
        endpoint: '/alerts/',
        rowKey: 'id',
        searchPlaceholder: 'Mã cảnh báo, Tiêu đề, Quy tắc, Sản phẩm, Tactic, Source UID',
        filters: [
            {key: 'severity', label: 'Mức độ nghiêm trọng', valueType: 'select', width: L160},
            {key: 'confidence', label: 'Độ tin cậy', valueType: 'select', width: L160},
            {key: 'impact', label: 'Tác động', valueType: 'select', width: L160},
        ],
        advancedFilters: [
            field('alert_id', 'Mã cảnh báo', 'text'),
            field('title', 'Tiêu đề', 'text'),
            field('severity', 'Mức độ nghiêm trọng', 'select'),
            field('confidence', 'Độ tin cậy', 'select'),
            field('impact', 'Tác động', 'select'),
            field('status', 'Trạng thái', 'select'),
            field('disposition', 'Xử lý (Disposition)', 'select'),
            field('action', 'Hành động', 'select'),
            field('risk_level', 'Mức rủi ro', 'select'),
            field('product_category', 'Danh mục sản phẩm', 'select'),
            field('product_vendor', 'Hãng sản xuất', 'select'),
            field('product_name', 'Tên sản phẩm', 'select'),
            field('rule_id', 'Mã quy tắc', 'text'),
            field('rule_name', 'Tên quy tắc', 'text'),
            field('correlation_uid', 'Correlation UID', 'text'),
            field('source_uid', 'Source UID', 'text'),
            field('labels', 'Nhãn', 'tag'),
            field('first_seen_time', 'Lần đầu phát hiện', 'date'),
            field('last_seen_time', 'Lần cuối phát hiện', 'date'),
            field('created_at', 'Thời gian tạo', 'date'),
        ],
        columns: [
            column('alert_id', 'Mã cảnh báo', L132, {required: true, defaultVisible: true, fixed: 'left', openRecord: true, uppercase: true}),
            column('title', 'Tiêu đề', L400, {required: true, defaultVisible: true, fixed: 'left'}),
            column('severity', 'Mức độ nghiêm trọng', L132, {defaultVisible: true, sorter: true, render: (v) => severityTag(String(v || ''))}),
            column('impact', 'Tác động', L132, {defaultVisible: true, sorter: true, render: (v) => severityTag(String(v || ''))}),
            column('disposition', 'Xử lý', L132, {defaultVisible: true, sorter: true, render: (v) => alertDispositionTag(String(v || ''))}),
            column('risk_level', 'Mức rủi ro', L132, {defaultVisible: true, sorter: true, render: (v) => severityTag(String(v || ''))}),
            column('action', 'Hành động', L132, {defaultVisible: true, sorter: true, render: (v) => alertActionTag(String(v || ''))}),
            column('confidence', 'Độ tin cậy', L132, {defaultVisible: true, sorter: true, render: confidenceTag}),
            column('status', 'Trạng thái', L132, {defaultVisible: true, sorter: true, render: (v) => statusTag(String(v || ''))}),
            column('first_seen_time', 'Lần đầu phát hiện', L160, {defaultVisible: true, sorter: true, render: date('first_seen_time')}),
            column('last_seen_time', 'Lần cuối phát hiện', L160, {defaultVisible: true, sorter: true, render: date('last_seen_time')}),
            column('product_vendor', 'Hãng sản xuất', L200, {defaultVisible: true, render: (v) => choiceTag(String(v || ''), 'blue')}),
            column('product_name', 'Tên sản phẩm', L200, {defaultVisible: true, render: (v) => choiceTag(String(v || ''), 'blue')}),
            column('product_feature', 'Tính năng sản phẩm', L200, {defaultVisible: true, render: (v) => choiceTag(String(v || ''), 'blue')}),
            column('labels', 'Nhãn', L400, {defaultVisible: true, render: (v) => tags(v)}),
            column('case_title', 'Vụ việc', L132, {
                defaultVisible: true,
                render: (_v, r) => upperStringValue(r, 'case_readable_id'),
                openResource: {
                    resourceKey: 'cases',
                    rowId: (r) => value(r, 'case_id') as string | number | null | undefined,
                },
            }),
            column('created_at', 'Thời gian tạo', L160, {sorter: true, render: date('created_at')}),
            column('updated_at', 'Thời gian cập nhật', L160, {sorter: true, render: date('updated_at')}),
            column('artifacts_link', 'Thực thể', L132, {
                dataIndex: 'artifact_count',
                defaultVisible: true,
                openRecordTab: 'artifacts',
                render: viewRelatedLabel,
            }),
            column('enrichments_link', 'Làm giàu dữ liệu', L132, {
                dataIndex: 'enrichment_count',
                defaultVisible: true,
                openRecordTab: 'enrichments',
                render: viewRelatedLabel,
            }),
            column('rule_id', 'Mã quy tắc', L360),
            column('rule_name', 'Tên quy tắc', L360),
            column('correlation_uid', 'Correlation UID', L360),
            column('source_uid', 'Source UID', L240),
            column('src_url', 'Source URL', L360),
            column('data_sources', 'Nguồn dữ liệu', L400, {render: (v) => tags(v, 'cyan')}),
            column('tactic', 'Chiến thuật', L200),
            column('technique', 'Kỹ thuật', L200),
            column('sub_technique', 'Kỹ thuật con', L200),
            column('mitigation', 'Biện pháp giảm thiểu', L400),
            column('desc', 'Mô tả', L400),
            column('status_detail', 'Chi tiết trạng thái', L400),
            column('remediation', 'Khắc phục', L400),
            column('analytic_name', 'Tên bộ phân tích', L240),
            column('analytic_type', 'Loại phân tích', L160, {render: (v) => alertAnalyticTypeTag(String(v || ''))}),
            column('analytic_state', 'Trạng thái phân tích', L160, {render: (v) => localizedChoiceTag(String(v || ''), ALERT_ANALYTIC_STATE_LABELS, 'green')}),
            column('analytic_desc', 'Mô tả phân tích', L400),
            column('product_category', 'Danh mục sản phẩm', L160, {render: (v) => productCategoryTag(String(v || ''))}),
            column('policy_name', 'Tên chính sách', L240),
            column('policy_type', 'Loại chính sách', L200, {render: (v) => localizedChoiceTag(String(v || ''), ALERT_POLICY_TYPE_LABELS, 'volcano')}),
            column('policy_desc', 'Mô tả chính sách', L400),
        ],
        basicSections: [
            {
                key: 'summary', title: 'Tóm tắt', fields: [
                    {label: 'Mã cảnh báo', value: (r) => upperStringValue(r, 'alert_id'), mono: true},
                    {label: 'Tiêu đề', value: (r) => stringValue(r, 'title')},
                ]
            },
            {
                key: 'risk', title: 'Đánh giá rủi ro', fields: [
                    {label: 'Mức độ nghiêm trọng', value: (r) => severityTag(String(value(r, 'severity') || '')), tag: true},
                    {label: 'Độ tin cậy', value: (r) => confidenceTag(value(r, 'confidence')), tag: true},
                    {label: 'Tác động', value: (r) => severityTag(String(value(r, 'impact') || '')), tag: true},
                    {label: 'Mức rủi ro', value: (r) => severityTag(String(value(r, 'risk_level') || '')), tag: true},
                ]
            },
            {
                key: 'description', title: 'Mô tả', fields: [
                    {label: 'Nhãn', value: (r) => tags(value(r, 'labels'))},
                    {label: 'Mô tả', value: (r) => stringValue(r, 'desc')},
                ]
            },
            {
                key: 'correlation', title: 'Tương quan', fields: [
                    {label: 'Source UID', value: (r) => stringValue(r, 'source_uid'), mono: true},
                    {label: 'Mã quy tắc', value: (r) => stringValue(r, 'rule_id'), mono: true},
                    {label: 'Tên quy tắc', value: (r) => stringValue(r, 'rule_name')},
                    {label: 'Correlation UID', value: (r) => stringValue(r, 'correlation_uid'), mono: true},
                ]
            },
            {
                key: 'mitre', title: 'MITRE ATT&CK và ATLAS', fields: [
                    {label: 'Chiến thuật', value: (r) => stringValue(r, 'tactic')},
                    {label: 'Kỹ thuật', value: (r) => stringValue(r, 'technique')},
                    {label: 'Kỹ thuật con', value: (r) => stringValue(r, 'sub_technique')},
                    {label: 'Biện pháp giảm thiểu', value: (r) => stringValue(r, 'mitigation')},
                ]
            },
            {
                key: 'status', title: 'Trạng thái, Hành động và Khắc phục', fields: [
                    {label: 'Trạng thái', value: (r) => statusTag(String(value(r, 'status') || '')), tag: true},
                    {label: 'Xử lý', value: (r) => alertDispositionTag(String(value(r, 'disposition') || '')), tag: true},
                    {label: 'Hành động', value: (r) => alertActionTag(String(value(r, 'action') || '')), tag: true},
                    {label: 'Chi tiết trạng thái', value: (r) => stringValue(r, 'status_detail')},
                    {label: 'Khắc phục', value: (r) => stringValue(r, 'remediation')},
                ]
            },
            {
                key: 'product', title: 'Sản phẩm và Chính sách', fields: [
                    {label: 'Danh mục sản phẩm', value: (r) => productCategoryTag(String(value(r, 'product_category') || '')), tag: true},
                    {label: 'Hãng sản xuất', value: (r) => choiceTag(String(value(r, 'product_vendor') || ''), 'blue'), tag: true},
                    {label: 'Tên sản phẩm', value: (r) => choiceTag(String(value(r, 'product_name') || ''), 'blue'), tag: true},
                    {label: 'Tính năng sản phẩm', value: (r) => choiceTag(String(value(r, 'product_feature') || ''), 'blue'), tag: true},
                    {label: 'Tên chính sách', value: (r) => stringValue(r, 'policy_name')},
                    {label: 'Loại chính sách', value: (r) => localizedChoiceTag(String(value(r, 'policy_type') || ''), ALERT_POLICY_TYPE_LABELS), tag: true},
                ]
            },
        ],
        basicView: (record, options) => <AlertBasicView record={record} onOpenResource={options?.onOpenResource}/>,
        tabs: emptyTabs.alert,
    },
    artifacts: {
        key: 'artifacts',
        label: 'Thực thể',
        icon: <Fingerprint {...lucideIconProps}/>,
        endpoint: '/artifacts/',
        rowKey: 'id',
        searchPlaceholder: 'Mã thực thể, Loại, Tên, Giá trị, Vai trò',
        filters: [{key: 'type', label: 'Loại', valueType: 'select', width: L160}, {key: 'role', label: 'Vai trò', valueType: 'select', width: L160}],
        advancedFilters: [
            field('artifact_id', 'Mã thực thể', 'text'),
            field('type', 'Loại', 'select'),
            field('role', 'Vai trò', 'select'),
            field('name', 'Tên', 'text'),
            field('value', 'Giá trị', 'text'),
            field('created_at', 'Thời gian tạo', 'date'),
            field('updated_at', 'Thời gian cập nhật', 'date'),
        ],
        columns: [
            column('artifact_id', 'Mã thực thể', L160, {required: true, defaultVisible: true, fixed: 'left', openRecord: true, uppercase: true}),
            column('name', 'Tên', L200, {defaultVisible: true, fixed: 'left', render: (v) => choiceTag(String(v || ''), 'cyan')}),
            column('type', 'Loại', L160, {required: true, defaultVisible: true, sorter: true, render: (v) => localizedChoiceTag(String(v || ''), ARTIFACT_TYPE_LABELS, 'geekblue')}),
            column('value', 'Giá trị', L400, {required: true, defaultVisible: true}),
            column('role', 'Vai trò', L132, {defaultVisible: true, sorter: true, render: (v) => artifactRoleTag(String(v || ''))}),
            column('alerts_link', 'Cảnh báo', L160, {
                dataIndex: 'alert_count',
                defaultVisible: true,
                openRecordTab: 'alerts',
                render: viewRelatedLabel,
            }),
            column('enrichments_link', 'Làm giàu dữ liệu', L160, {
                dataIndex: 'enrichment_count',
                defaultVisible: true,
                openRecordTab: 'enrichments',
                render: viewRelatedLabel,
            }),
            column('created_at', 'Thời gian tạo', L160, {defaultVisible: true, sorter: true, render: date('created_at')}),
            column('updated_at', 'Thời gian cập nhật', L160, {defaultVisible: true, sorter: true, render: date('updated_at')}),
        ],
        basicSections: [
            {
                key: 'summary', title: 'Tóm tắt', fields: [
                    {label: 'Mã thực thể', value: (r) => upperStringValue(r, 'artifact_id'), mono: true},
                    {label: 'Loại', value: (r) => localizedChoiceTag(String(value(r, 'type') || ''), ARTIFACT_TYPE_LABELS, 'geekblue'), tag: true},
                    {label: 'Tên', value: (r) => choiceTag(String(value(r, 'name') || ''), 'cyan'), tag: true},
                    {label: 'Giá trị', value: (r) => stringValue(r, 'value'), mono: true},
                    {label: 'Vai trò', value: (r) => artifactRoleTag(String(value(r, 'role') || '')), tag: true},
                ]
            },
        ],
        basicView: (record) => <ArtifactBasicView record={record}/>,
        tabs: emptyTabs.artifact,
    },
    enrichments: {
        key: 'enrichments',
        label: 'Làm giàu dữ liệu',
        icon: <WandSparkles {...lucideIconProps}/>,
        endpoint: '/enrichments/',
        rowKey: 'id',
        searchPlaceholder: 'Tìm kiếm theo mã, tên, nhà cung cấp, giá trị hoặc UID',
        filters: [{key: 'type', label: 'Loại', valueType: 'select', width: L200}, {key: 'provider', label: 'Nhà cung cấp', valueType: 'select', width: L280}],
        advancedFilters: [
            field('enrichment_id', 'Mã làm giàu', 'text'),
            field('type', 'Loại', 'select'),
            field('provider', 'Nhà cung cấp', 'select'),
            field('name', 'Tên', 'text'),
            field('uid', 'UID', 'text'),
            field('value', 'Giá trị', 'text'),
            field('desc', 'Mô tả', 'text'),
            field('created_at', 'Thời gian tạo', 'date'),
            field('updated_at', 'Thời gian cập nhật', 'date'),
        ],
        columns: [
            column('enrichment_id', 'Mã làm giàu', L160, {required: true, defaultVisible: true, fixed: 'left', openRecord: true, uppercase: true}),
            column('name', 'Tên', L240, {required: true, defaultVisible: true, fixed: 'left'}),
            column('type', 'Loại', L200, {defaultVisible: true, sorter: true, render: (v) => enrichmentTypeTag(String(v || ''))}),
            column('provider', 'Nhà cung cấp', L200, {defaultVisible: true, sorter: true, render: (v) => choiceTag(String(v || ''), 'purple')}),
            column('value', 'Giá trị', L400, {defaultVisible: true}),
            column('linked_object', 'Đối tượng liên kết', L160, {
                defaultVisible: true,
                render: (_v, r) => upperStringValue(r, 'linked_object'),
                openResource: {
                    resourceKey: linkedObjectResourceKey,
                    rowId: (r) => value(r, 'linked_object_id') as string | number | null | undefined,
                },
            }),
            column('created_at', 'Thời gian tạo', L160, {defaultVisible: true, sorter: true, render: date('created_at')}),
            column('updated_at', 'Thời gian cập nhật', L160, {defaultVisible: true, sorter: true, render: date('updated_at')}),
            column('desc', 'Mô tả', L400),
            column('uid', 'UID', L360),
        ],
        basicSections: [
            {
                key: 'summary', title: 'Tóm tắt', fields: [
                    {label: 'Mã làm giàu', value: (r) => upperStringValue(r, 'enrichment_id'), mono: true},
                    {label: 'Tên', value: (r) => stringValue(r, 'name')},
                    {label: 'Loại', value: (r) => enrichmentTypeTag(String(value(r, 'type') || '')), tag: true},
                    {label: 'Nhà cung cấp', value: (r) => choiceTag(String(value(r, 'provider') || ''), 'purple'), tag: true},
                    {label: 'UID', value: (r) => stringValue(r, 'uid'), mono: true},
                    {label: 'Giá trị', value: (r) => stringValue(r, 'value'), mono: true},
                    {
                        label: 'Đối tượng liên kết',
                        value: (r) => upperStringValue(r, 'linked_object'),
                        openResource: {
                            resourceKey: linkedObjectResourceKey,
                            rowId: (r) => value(r, 'linked_object_id') as string | number | null | undefined,
                        },
                    },
                ]
            },
            {
                key: 'description', title: 'Mô tả', fields: [
                    {label: 'Mô tả', value: (r) => stringValue(r, 'desc')},
                ]
            },
        ],
        editableFields: [
            {key: 'uid', type: 'text'},
            {key: 'value', type: 'text'},
            {key: 'desc', type: 'textarea'},
        ],
        basicView: (record, options) => <EnrichmentBasicView record={record} onOpenResource={options?.onOpenResource} fieldController={options?.fieldController}/>,
        tabs: [],
    },
    playbooks: {
        key: 'playbooks',
        label: 'Playbook',
        icon: <BrainCircuit {...lucideIconProps}/>,
        endpoint: '/playbooks/',
        rowKey: 'id',
        readOnly: true,
        searchPlaceholder: 'Mã Playbook, Tên, Job ID, Ghi chú',
        filters: [{key: 'job_status', label: 'Trạng thái', valueType: 'select', width: L132}],
        advancedFilters: [
            field('playbook_id', 'Mã Playbook', 'text'),
            field('job_status', 'Trạng thái', 'select'),
            field('name', 'Tên', 'text'),
            field('job_id', 'Job ID', 'text'),
            field('user_input', 'Đầu vào người dùng', 'text'),
            field('remark', 'Ghi chú', 'text'),
            field('created_at', 'Thời gian tạo', 'date'),
            field('updated_at', 'Thời gian cập nhật', 'date'),
            field('started_at', 'Bắt đầu lúc', 'date'),
            field('finished_at', 'Hoàn thành lúc', 'date'),
        ],
        columns: [
            column('playbook_id', 'Mã Playbook', L160, {required: true, defaultVisible: true, fixed: 'left', openRecord: true, uppercase: true}),
            column('name', 'Tên', L360, {required: true, defaultVisible: true, fixed: 'left'}),
            column('job_status', 'Trạng thái', L160, {defaultVisible: true, sorter: true, render: playbookJobStatusTag}),
            column('risk_level', 'Mức rủi ro', L132, {defaultVisible: true, render: (v) => severityTag(String(v || ''))}),
            column('case_title', 'Vụ việc', L160, {
                defaultVisible: true,
                render: (_v, r) => upperStringValue(r, 'case_readable_id'),
                openResource: {
                    resourceKey: 'cases',
                    rowId: (r) => value(r, 'case_id') as string | number | null | undefined,
                },
            }),
            column('user_username', 'Người yêu cầu', L160, {defaultVisible: true}),
            column('job_id', 'Job ID', L240, {defaultVisible: true}),
            column('started_at', 'Bắt đầu lúc', L160, {defaultVisible: true, sorter: true, render: date('started_at')}),
            column('finished_at', 'Hoàn thành lúc', L160, {defaultVisible: true, sorter: true, render: date('finished_at')}),
            column('duration_seconds', 'Thời lượng', L132, {defaultVisible: true, render: (v) => formatDurationSeconds(v)}),
            column('created_at', 'Thời gian tạo', L160, {defaultVisible: true, sorter: true, render: date('created_at')}),
            column('updated_at', 'Thời gian cập nhật', L160, {defaultVisible: true, sorter: true, render: date('updated_at')}),
            column('user_input', 'Đầu vào người dùng', L400),
            column('remark', 'Ghi chú', L400),
        ],
        basicSections: [
            {
                key: 'summary', title: 'Tóm tắt', fields: [
                    {label: 'Mã Playbook', value: (r) => upperStringValue(r, 'playbook_id'), mono: true},
                    {label: 'Tên', value: (r) => stringValue(r, 'name')},
                    {label: 'Trạng thái tác vụ', value: (r) => playbookJobStatusTag(value(r, 'job_status')), tag: true},
                    {label: 'Vụ việc', value: playbookCaseLabel, openResource: {resourceKey: 'cases', rowId: (r) => value(r, 'case_id') as string | number | null | undefined}},
                    {label: 'Người yêu cầu', value: (r) => stringValue(r, 'user_username')},
                    {label: 'Job ID', value: (r) => stringValue(r, 'job_id'), mono: true},
                    {label: 'Ghi chú', value: (r) => stringValue(r, 'remark')},
                ]
            },
        ],
        basicView: (record, options) => (
            <PlaybookBasicView
                record={record}
                onOpenResource={options?.onOpenResource}
                onRefresh={options?.onRefresh}
                renderStatus={playbookJobStatusTag}
            />
        ),
        tabs: [],
    },
    knowledge: {
        key: 'knowledge',
        label: 'Tri thức',
        icon: <BookOpenText {...lucideIconProps}/>,
        endpoint: '/knowledge/',
        rowKey: 'id',
        searchPlaceholder: 'Mã tri thức, Tiêu đề, Nội dung, Nguồn',
        filters: [{key: 'source', label: 'Nguồn', valueType: 'select', width: L132}, {key: 'tags', label: 'Thẻ', valueType: 'tag', width: L200}],
        advancedFilters: [
            field('knowledge_id', 'Mã tri thức', 'text'),
            field('source', 'Nguồn', 'select'),
            field('tags', 'Thẻ', 'tag'),
            field('title', 'Tiêu đề', 'text'),
            field('body', 'Nội dung', 'text'),
            field('expires_at', 'Hết hạn lúc', 'date'),
            field('created_at', 'Thời gian tạo', 'date'),
            field('updated_at', 'Thời gian cập nhật', 'date'),
        ],
        columns: [
            column('knowledge_id', 'Mã tri thức', L160, {required: true, defaultVisible: true, fixed: 'left', openRecord: true, uppercase: true}),
            column('title', 'Tiêu đề', L360, {required: true, defaultVisible: true, fixed: 'left'}),
            column('source', 'Nguồn', L132, {defaultVisible: true, sorter: true, render: (v) => knowledgeSourceTag(String(v || ''))}),
            column('case_readable_id', 'Vụ việc', L160, {
                defaultVisible: true,
                uppercase: true,
                openResource: {
                    resourceKey: 'cases',
                    rowId: (record) => value(record, 'case') as string | number | null | undefined,
                },
            }),
            column('tags', 'Thẻ', L400, {defaultVisible: true, render: (v) => tags(v)}),
            column('expires_at', 'Hết hạn lúc', L160, {defaultVisible: true, sorter: true, render: date('expires_at')}),
            column('created_at', 'Thời gian tạo', L160, {defaultVisible: true, sorter: true, render: date('created_at')}),
            column('updated_at', 'Thời gian cập nhật', L160, {defaultVisible: true, sorter: true, render: date('updated_at')}),
            column('body', 'Nội dung', L400),
        ],
        editableFields: [
            {key: 'title', type: 'text'},
            {key: 'expires_at', type: 'datetime', emptyValue: null},
            {key: 'tags', type: 'tags', emptyValue: []},
            {key: 'body', type: 'markdown'},
        ],
        basicView: (record, options) => (
            <KnowledgeBasicView
                record={record}
                onOpenResource={options?.onOpenResource}
                fieldController={options?.fieldController}
            />
        ),
        basicSections: [
            {
                key: 'summary', title: 'Tóm tắt', fields: [
                    {label: 'Mã tri thức', value: (r) => upperStringValue(r, 'knowledge_id'), mono: true},
                    {label: 'Tiêu đề', value: (r) => stringValue(r, 'title')},
                    {label: 'Nguồn', value: (r) => knowledgeSourceTag(String(value(r, 'source') || '')), tag: true},
                    {label: 'Thẻ', value: (r) => tags(value(r, 'tags'))},
                    {label: 'Hết hạn lúc', value: (r) => formatDateTime(String(value(r, 'expires_at') || ''))},
                    {label: 'Nội dung', value: (r) => stringValue(r, 'body')},
                ]
            },
        ],
        tabs: [],
    },
    users: {
        key: 'users',
        label: 'Người dùng',
        icon: <UserOutlined/>,
        endpoint: '/auth/users/',
        rowKey: 'id',
        searchPlaceholder: 'Tên đăng nhập, Email, Họ tên, Điện thoại',
        filters: [
            {key: 'role', label: 'Vai trò', options: [{label: 'Quản trị viên', value: 'admin'}, {label: 'Người dùng', value: 'user'}, {label: 'Chỉ xem', value: 'viewer'}], width: L132},
            {key: 'auth_type', label: 'Kiểu xác thực', options: [{label: 'Nội bộ', value: 'local'}, {label: 'LDAP', value: 'ldap'}], width: L132},
            {key: 'is_active', label: 'Trạng thái', options: [{label: 'Hoạt động', value: 'true'}, {label: 'Vô hiệu', value: 'false'}], width: L132},
        ],
        advancedFilters: [
            field('username', 'Tên đăng nhập', 'text'),
            field('email', 'Email', 'text'),
            field('first_name', 'Tên', 'text'),
            field('last_name', 'Họ', 'text'),
            field('mobile_phone', 'Số điện thoại', 'text'),
            field('auth_type', 'Kiểu xác thực', 'select'),
            field('is_active', 'Trạng thái', 'select'),
            field('date_joined', 'Ngày tham gia', 'date'),
            field('last_login', 'Đăng nhập gần nhất', 'date'),
        ],
        columns: [
            column('username', 'Tên đăng nhập', L160, {required: true, defaultVisible: true, openRecord: true}),
            column('avatar_url', 'Ảnh đại diện', L80, {
                defaultVisible: true,
                render: (_v, r) => <UserAvatar username={String(value(r, 'username') || '')} avatarUrl={String(value(r, 'avatar_url') || '')} size={32}/>
            }),
            column('role', 'Vai trò', L120, {defaultVisible: true, render: userRoleTag}),
            column('auth_type', 'Kiểu xác thực', L120, {defaultVisible: true, sorter: true, render: authTypeTag}),
            column('is_active', 'Trạng thái', L120, {defaultVisible: true, sorter: true, render: activeStatusTag}),
            column('email', 'Email', L240, {defaultVisible: true}),
            column('first_name', 'Tên', L120),
            column('last_name', 'Họ', L120),
            column('full_name', 'Họ và tên', L200, {
                defaultVisible: true,
                render: (_v, r) => `${stringValue(r, 'first_name')} ${stringValue(r, 'last_name')}`.replaceAll('—', '').trim() || '—'
            }),
            column('mobile_phone', 'Số điện thoại', L240, {defaultVisible: true}),
            column('last_login', 'Đăng nhập gần nhất', L160, {defaultVisible: true, sorter: true, render: date('last_login')}),
            column('date_joined', 'Ngày tham gia', L160, {defaultVisible: true, sorter: true, render: date('date_joined')}),
        ],
        basicSections: [
            {
                key: 'identity', title: 'Định danh', fields: [
                    {label: 'Tên đăng nhập', value: (r) => stringValue(r, 'username')},
                    {label: 'Email', value: (r) => stringValue(r, 'email')},
                    {label: 'Họ và tên', value: (r) => `${stringValue(r, 'first_name')} ${stringValue(r, 'last_name')}`.replaceAll('—', '').trim() || '—'},
                    {label: 'Số điện thoại', value: (r) => stringValue(r, 'mobile_phone')},
                    {label: 'Ảnh đại diện', value: (r) => <UserAvatar username={String(value(r, 'username') || '')} avatarUrl={String(value(r, 'avatar_url') || '')} size={40}/>},
                ]
            },
            {
                key: 'access', title: 'Quyền truy cập', fields: [
                    {label: 'Vai trò', value: (r) => userRoleTag(value(r, 'role')), tag: true},
                    {label: 'Kiểu xác thực', value: (r) => authTypeTag(value(r, 'auth_type')), tag: true},
                    {label: 'Trạng thái', value: (r) => activeStatusTag(value(r, 'is_active')), tag: true},
                ]
            },
        ],
        tabs: [],
    },
    'llm-providers': {
        key: 'llm-providers',
        label: 'Nhà cung cấp LLM',
        icon: <ApiOutlined/>,
        endpoint: '/settings/llm-providers/',
        rowKey: 'id',
        searchPlaceholder: 'Tên, Base URL, Model',
        filters: [
            {key: 'enabled', label: 'Trạng thái', valueType: 'select', options: [{label: 'Bật', value: 'true'}, {label: 'Tắt', value: 'false'}], width: L132},
            {key: 'tags', label: 'Thẻ', valueType: 'tag', options: llmTagOptions, width: L480},
        ],
        advancedFilters: [
            field('name', 'Tên', 'text'),
            field('base_url', 'Base URL', 'text'),
            field('model', 'Model', 'text'),
            {key: 'enabled', label: 'Trạng thái', valueType: 'select', options: [{label: 'Bật', value: 'true'}, {label: 'Tắt', value: 'false'}]},
            field('priority', 'Độ ưu tiên', 'number'),
        ],
        columns: [
            column('name', 'Tên', L160, {required: true, defaultVisible: true, openRecord: true, sorter: true}),
            column('base_url', 'Base URL', L360, {defaultVisible: true, sorter: true}),
            column('model', 'Model', L240, {defaultVisible: true, sorter: true}),
            column('tags', 'Thẻ', L360, {defaultVisible: true, render: llmTags}),
            column('enabled', 'Trạng thái', L96, {defaultVisible: true, sorter: true, render: llmProviderStatusTag}),
            column('priority', 'Độ ưu tiên', L96, {defaultVisible: true, sorter: true}),
        ],
        basicSections: [],
        tabs: [],
    },
    'custom-variables': {
        key: 'custom-variables',
        label: 'Biến tùy chỉnh',
        icon: <ApiOutlined/>,
        endpoint: '/custom/variables/',
        rowKey: 'id',
        searchPlaceholder: 'Khóa, Mô tả',
        filters: [
            {key: 'value_type', label: 'Kiểu', valueType: 'select', options: customVariableTypeOptions, width: L160},
            {key: 'is_secret', label: 'Bí mật', valueType: 'select', options: [{label: 'Bí mật', value: 'true'}, {label: 'Thường', value: 'false'}], width: L132},
            {key: 'enabled', label: 'Trạng thái', valueType: 'select', options: [{label: 'Bật', value: 'true'}, {label: 'Tắt', value: 'false'}], width: L132},
        ],
        advancedFilters: [
            field('key', 'Khóa', 'text'),
            field('description', 'Mô tả', 'text'),
            {key: 'value_type', label: 'Kiểu', valueType: 'select', options: customVariableTypeOptions},
            {key: 'is_secret', label: 'Bí mật', valueType: 'select', options: [{label: 'Bí mật', value: 'true'}, {label: 'Thường', value: 'false'}]},
            {key: 'enabled', label: 'Trạng thái', valueType: 'select', options: [{label: 'Bật', value: 'true'}, {label: 'Tắt', value: 'false'}]},
            field('created_at', 'Thời gian tạo', 'date'),
            field('updated_at', 'Thời gian cập nhật', 'date'),
        ],
        columns: [
            column('key', 'Khóa', L240, {required: true, defaultVisible: true, openRecord: true, sorter: true}),
            column('description', 'Mô tả', L360, {defaultVisible: true}),
            column('value_type', 'Kiểu', L132, {defaultVisible: true, sorter: true, render: customVariableTypeTag}),
            column('is_secret', 'Bí mật', L96, {defaultVisible: true, sorter: true, render: customVariableSecretTag}),
            column('enabled', 'Trạng thái', L96, {defaultVisible: true, sorter: true, render: llmProviderStatusTag}),
            column('value_configured', 'Giá trị', L132, {defaultVisible: true, render: customVariableConfiguredTag}),
            column('updated_at', 'Thời gian cập nhật', L160, {defaultVisible: true, sorter: true, render: date('updated_at')}),
        ],
        basicSections: [],
        tabs: [],
    },
}

export function getResourceConfig(key: string): ResourceConfig<RecordRow> {
    const config = resourceConfigs[key]
    if (!config) throw new Error(`Unknown resource config: ${key}`)
    return config
}
