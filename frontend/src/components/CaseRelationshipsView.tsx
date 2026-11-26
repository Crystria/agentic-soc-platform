import {useCallback, useMemo, useRef, useState} from 'react'
import {
  Alert,
  Button,
  Empty,
  Form,
  Input,
  Modal,
  Popconfirm,
  Select,
  Space,
  Table,
  Tag,
  theme,
  Tooltip,
  Typography,
} from 'antd'
import {
  DeleteOutlined,
  EditOutlined,
  PlusOutlined,
  ReloadOutlined,
  SearchOutlined,
} from '@ant-design/icons'
import type {ColumnsType} from 'antd/es/table'
import {
  type CaseRelationship,
  type CaseRelationshipInput,
  type CaseRelationshipSuggestion,
  type CaseRelationshipType,
  type RelatedCaseSummary,
  createCaseRelationship,
  deleteCaseRelationship,
  fetchCaseRelationshipSuggestions,
  searchCases,
  updateCaseRelationship,
} from '../api/caseRelationships'
import {useAuthStore} from '../stores/auth'
import {message} from '../utils/appMessage'
import {localizeChoiceLabel} from '../utils/i18n'
import {formatDateTime, severityTag, statusTag, verdictTag} from '../utils/recordDisplay'
import type {ResourceColumn, ResourceFilterConfig} from '../types/records'
import DataTable from './DataTable'

type RelationshipDirection = 'current_to_other' | 'other_to_current'

interface RelationshipFormValues {
  relationship_type: CaseRelationshipType
  direction: RelationshipDirection
  other_case_id: string
  note?: string
}

interface CaseRelationshipsViewProps {
  caseId: string
  onOpenCase?: (caseId: string) => void
  onChanged?: () => void
}

const relationshipTypeOptions = [
  {label: 'Liên quan', value: 'Related'},
  {label: 'Trùng lặp với', value: 'Duplicate of'},
  {label: 'Vụ việc cha của', value: 'Parent of'},
]

const relationshipFilters: ResourceFilterConfig[] = [
  {
    key: 'relationship_type',
    label: 'Mối quan hệ',
    valueType: 'select',
    options: relationshipTypeOptions,
  },
]

function apiErrorMessage(error: unknown, fallback: string) {
  const data = (error as {response?: {data?: unknown}}).response?.data
  if (typeof data === 'string') return data
  if (data && typeof data === 'object') {
    const record = data as Record<string, unknown>
    if (typeof record.detail === 'string') return record.detail
    for (const value of Object.values(record)) {
      if (Array.isArray(value) && value.length) return String(value[0])
    }
  }
  return fallback
}

function otherCase(relationship: CaseRelationship, currentCaseId: string) {
  return relationship.source_case.id === currentCaseId
    ? relationship.target_case
    : relationship.source_case
}

function relationLabel(relationship: CaseRelationship, currentCaseId: string) {
  const isSource = relationship.source_case.id === currentCaseId
  if (relationship.relationship_type === 'Related') return 'Liên quan'
  if (relationship.relationship_type === 'Duplicate of') {
    return isSource ? 'Trùng với' : 'Bị trùng bởi'
  }
  return isSource ? 'Vụ việc cha của' : 'Vụ việc con của'
}

function directionFor(relationship: CaseRelationship, currentCaseId: string): RelationshipDirection {
  return relationship.source_case.id === currentCaseId ? 'current_to_other' : 'other_to_current'
}

function relationshipPayload(
  values: RelationshipFormValues,
  currentCaseId: string,
): CaseRelationshipInput {
  const currentIsSource = values.relationship_type === 'Related'
    || values.direction === 'current_to_other'
  return {
    source_case_id: currentIsSource ? currentCaseId : values.other_case_id,
    target_case_id: currentIsSource ? values.other_case_id : currentCaseId,
    relationship_type: values.relationship_type,
    note: values.note?.trim() || '',
  }
}

export default function CaseRelationshipsView({
  caseId,
  onOpenCase,
  onChanged,
}: CaseRelationshipsViewProps) {
  const {token} = theme.useToken()
  const user = useAuthStore((state) => state.user)
  const canWrite = user?.role === 'admin' || user?.role === 'user'
  const [form] = Form.useForm<RelationshipFormValues>()
  const relationshipType = Form.useWatch('relationship_type', form)
  const [relationshipRefreshKey, setRelationshipRefreshKey] = useState(0)
  const [suggestions, setSuggestions] = useState<CaseRelationshipSuggestion[]>([])
  const [suggestionsOpen, setSuggestionsOpen] = useState(false)
  const [suggestionsError, setSuggestionsError] = useState('')
  const [caseOptions, setCaseOptions] = useState<RelatedCaseSummary[]>([])
  const [suggestionsLoading, setSuggestionsLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editing, setEditing] = useState<CaseRelationship | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const searchRequestRef = useRef(0)
  const suggestionRequestRef = useRef(0)

  const loadSuggestions = useCallback(async () => {
    if (!caseId) return
    const requestId = suggestionRequestRef.current + 1
    suggestionRequestRef.current = requestId
    setSuggestions([])
    setSuggestionsError('')
    setSuggestionsLoading(true)
    try {
      const nextSuggestions = await fetchCaseRelationshipSuggestions(caseId)
      if (requestId === suggestionRequestRef.current) {
        setSuggestions(nextSuggestions)
      }
    } catch (error) {
      if (requestId === suggestionRequestRef.current) {
        setSuggestionsError(apiErrorMessage(error, 'Không thể tải gợi ý vụ việc liên quan'))
      }
    } finally {
      if (requestId === suggestionRequestRef.current) {
        setSuggestionsLoading(false)
      }
    }
  }, [caseId])

  const refreshRelationships = useCallback(() => {
    setRelationshipRefreshKey((current) => current + 1)
    onChanged?.()
  }, [onChanged])

  const openSuggestions = () => {
    if (suggestionsLoading) return
    setSuggestionsOpen(true)
    void loadSuggestions()
  }

  const closeSuggestions = () => {
    setSuggestionsOpen(false)
  }

  const loadCaseOptions = useCallback(async (search: string) => {
    const requestId = searchRequestRef.current + 1
    searchRequestRef.current = requestId
    try {
      const cases = await searchCases(search)
      if (requestId === searchRequestRef.current) {
        setCaseOptions(cases.filter((item) => item.id !== caseId))
      }
    } catch (error) {
      if (requestId === searchRequestRef.current) {
        message.error(apiErrorMessage(error, 'Không thể tìm kiếm vụ việc'))
      }
    }
  }, [caseId])

  const openCreate = () => {
    setEditing(null)
    setCaseOptions([])
    form.resetFields()
    form.setFieldsValue({
      relationship_type: 'Related',
      direction: 'current_to_other',
      note: '',
    })
    setModalOpen(true)
  }

  const openEdit = (relationship: CaseRelationship) => {
    const related = otherCase(relationship, caseId)
    setEditing(relationship)
    setCaseOptions([related])
    form.setFieldsValue({
      relationship_type: relationship.relationship_type,
      direction: directionFor(relationship, caseId),
      other_case_id: related.id,
      note: relationship.note,
    })
    setModalOpen(true)
  }

  const saveRelationship = async () => {
    const values = await form.validateFields()
    setSaving(true)
    try {
      const payload = relationshipPayload(values, caseId)
      if (editing) {
        await updateCaseRelationship(editing.id, payload)
        message.success('Đã cập nhật mối quan hệ vụ việc')
      } else {
        await createCaseRelationship(payload)
        message.success('Đã tạo mối quan hệ vụ việc')
      }
      setModalOpen(false)
      refreshRelationships()
    } catch (error) {
      if ((error as {errorFields?: unknown}).errorFields) return
      message.error(apiErrorMessage(error, 'Không thể lưu mối quan hệ vụ việc'))
    } finally {
      setSaving(false)
    }
  }

  const removeRelationship = async (relationship: CaseRelationship) => {
    try {
      await deleteCaseRelationship(relationship.id)
      message.success('Đã xóa mối quan hệ vụ việc')
      refreshRelationships()
    } catch (error) {
      message.error(apiErrorMessage(error, 'Không thể xóa mối quan hệ vụ việc'))
    }
  }

  const acceptSuggestion = useCallback(async (suggestion: CaseRelationshipSuggestion) => {
    try {
      await createCaseRelationship({
        source_case_id: caseId,
        target_case_id: suggestion.case.id,
        relationship_type: 'Related',
        note: '',
      })
      message.success('Đã thêm vụ việc liên quan')
      setSuggestions((current) => current.filter((item) => item.case.id !== suggestion.case.id))
      refreshRelationships()
    } catch (error) {
      message.error(apiErrorMessage(error, 'Không thể thêm vụ việc liên quan'))
    }
  }, [caseId, refreshRelationships])

  const caseSelectOptions = useMemo(
    () => caseOptions.map((item) => ({
      value: item.id,
      label: `${item.case_id.toUpperCase()} / ${item.title}`,
    })),
    [caseOptions],
  )

  const relationshipColumns = useMemo<ResourceColumn<CaseRelationship>[]>(() => [
    {
      title: 'Mối quan hệ',
      key: 'relationship',
      dataIndex: 'relationship_type',
      width: 150,
      defaultVisible: true,
      sorter: true,
      render: (value, row) => (
        <Tag color="blue">
          {row.source_case && row.target_case
            ? relationLabel(row, caseId)
            : localizeChoiceLabel(value)}
        </Tag>
      ),
    },
    {
      title: 'Mã vụ việc',
      key: 'case_id',
      required: true,
      defaultVisible: true,
      fixed: 'left',
      width: 160,
      render: (_value, row) => otherCase(row, caseId).case_id.toUpperCase(),
      openResource: {
        resourceKey: 'cases',
        rowId: (row) => otherCase(row, caseId).id,
      },
    },
    {
      title: 'Tiêu đề',
      key: 'title',
      defaultVisible: true,
      width: 360,
      render: (_value, row) => otherCase(row, caseId).title,
    },
    {
      title: 'Trạng thái',
      key: 'status',
      width: 130,
      defaultVisible: true,
      render: (_value, row) => statusTag(otherCase(row, caseId).status),
    },
    {
      title: 'Mức nghiêm trọng',
      key: 'severity',
      width: 140,
      defaultVisible: true,
      render: (_value, row) => severityTag(otherCase(row, caseId).severity),
    },
    {
      title: 'Phán quyết',
      key: 'verdict',
      width: 150,
      defaultVisible: true,
      render: (_value, row) => verdictTag(otherCase(row, caseId).verdict),
    },
    {
      title: 'Ghi chú',
      dataIndex: 'note',
      key: 'note',
      width: 280,
      defaultVisible: true,
      render: (value) => String(value || '—'),
    },
    {
      title: 'Thời gian tạo',
      key: 'created',
      dataIndex: 'created_at',
      width: 190,
      defaultVisible: true,
      sorter: true,
      render: (_value, row) => formatDateTime(row.created_at),
    },
    {
      title: 'Người tạo',
      key: 'created_by',
      dataIndex: 'created_by',
      width: 140,
      defaultVisible: true,
      render: (value) => String(value || 'Hệ thống'),
    },
  ], [caseId])

  const suggestionColumns = useMemo<ColumnsType<CaseRelationshipSuggestion>>(() => [
    {
      title: 'Vụ việc',
      key: 'case',
      width: 360,
      render: (_value, suggestion) => (
        <div>
          <Button
            type="link"
            size="small"
            style={{padding: 0, height: 'auto'}}
            onClick={() => onOpenCase?.(suggestion.case.id)}
          >
            {suggestion.case.case_id.toUpperCase()}
          </Button>
          <Typography.Text ellipsis style={{display: 'block'}}>
            {suggestion.case.title}
          </Typography.Text>
        </div>
      ),
    },
    {
      title: 'Trùng khớp',
      dataIndex: 'shared_artifact_count',
      key: 'shared_artifact_count',
      width: 120,
      render: (count: number) => `${count} thực thể`,
    },
    {
      title: 'Bằng chứng chung',
      key: 'evidence',
      render: (_value, suggestion) => (
        <Space wrap size={[4, 4]}>
          {suggestion.shared_artifacts.map((artifact) => (
            <Tag
              key={artifact.id}
              style={{maxWidth: '100%', whiteSpace: 'normal', overflowWrap: 'anywhere'}}
            >
              {localizeChoiceLabel(artifact.type)}: {artifact.value}
            </Tag>
          ))}
          {suggestion.shared_artifact_count > suggestion.shared_artifacts.length && (
            <Typography.Text type="secondary">
              +{suggestion.shared_artifact_count - suggestion.shared_artifacts.length}
            </Typography.Text>
          )}
        </Space>
      ),
    },
    ...(canWrite ? [{
      title: 'Thao tác',
      key: 'actions',
      width: 140,
      align: 'center' as const,
      render: (_value: unknown, suggestion: CaseRelationshipSuggestion) => (
        <Popconfirm
          title={`Liên kết ${suggestion.case.case_id.toUpperCase()} với vụ việc này?`}
          onConfirm={() => acceptSuggestion(suggestion)}
        >
          <Button type="link" size="small">Thêm liên kết</Button>
        </Popconfirm>
      ),
    }] : []),
  ], [acceptSuggestion, canWrite, onOpenCase])

  return (
    <>
      <div style={{height: '100%', padding: 16, boxSizing: 'border-box'}}>
        <DataTable<CaseRelationship>
          endpoint="/case-relationships/"
          tableKey={`case-relationships:${caseId}`}
          columns={relationshipColumns}
          filters={relationshipFilters}
          baseParams={{case: caseId}}
          refreshToken={relationshipRefreshKey}
          readOnly
          fillParent
          dense
          onOpenResource={(_resourceKey, rowId) => onOpenCase?.(String(rowId))}
          actions={(
            <Space size={4}>
              {canWrite && (
                <Tooltip title="Thêm mối quan hệ">
                  <Button icon={<PlusOutlined />} onClick={openCreate} />
                </Tooltip>
              )}
              <Tooltip title="Tìm gợi ý liên quan">
                <Button
                  icon={<SearchOutlined />}
                  loading={suggestionsLoading}
                  onClick={openSuggestions}
                />
              </Tooltip>
            </Space>
          )}
          rowActions={canWrite ? (row) => (
            <Space size={4}>
              <Tooltip title="Sửa mối quan hệ">
                <Button
                  type="text"
                  size="small"
                  icon={<EditOutlined />}
                  onClick={() => openEdit(row)}
                />
              </Tooltip>
              <Popconfirm
                title="Xóa mối quan hệ này?"
                description="Hành động này không thể hoàn tác."
                okText="Xóa"
                cancelText="Hủy"
                okButtonProps={{danger: true}}
                onConfirm={() => removeRelationship(row)}
              >
                <Tooltip title="Xóa mối quan hệ">
                  <Button type="text" size="small" danger icon={<DeleteOutlined />} />
                </Tooltip>
              </Popconfirm>
            </Space>
          ) : undefined}
        />
      </div>
      <Modal
        title={(
          <span style={{display: 'inline-flex', alignItems: 'center', gap: 10}}>
            <SearchOutlined style={{color: token.colorPrimary}} />
            <span>Gợi ý Vụ việc Liên quan</span>
          </span>
        )}
        open={suggestionsOpen}
        footer={null}
        width="min(1280px, calc(100vw - 64px))"
        destroyOnHidden
        styles={{
          container: {
            background: token.colorBgContainer,
            border: `1px solid ${token.colorBorder}`,
          },
          header: {background: token.colorBgContainer},
          body: {background: token.colorBgContainer},
        }}
        onCancel={closeSuggestions}
      >
        {suggestionsError ? (
          <Alert
            type="error"
            showIcon
            title={suggestionsError}
            action={(
              <Button
                size="small"
                icon={<ReloadOutlined />}
                loading={suggestionsLoading}
                onClick={() => void loadSuggestions()}
              >
                Thử lại
              </Button>
            )}
          />
        ) : (
          <Table<CaseRelationshipSuggestion>
            rowKey={(suggestion) => suggestion.case.id}
            columns={suggestionColumns}
            dataSource={suggestions}
            loading={suggestionsLoading}
            size="small"
            tableLayout="fixed"
            pagination={false}
            locale={{emptyText: <Empty description="Không có gợi ý" />}}
          />
        )}
      </Modal>
      <Modal
        title={editing ? 'Chỉnh sửa mối quan hệ vụ việc' : 'Thêm mối quan hệ vụ việc'}
        open={modalOpen}
        width={640}
        confirmLoading={saving}
        okText={editing ? 'Lưu' : 'Thêm'}
        onOk={() => void saveRelationship()}
        onCancel={() => setModalOpen(false)}
        destroyOnHidden
      >
        <Form form={form} layout="vertical" preserve={false}>
          <Form.Item
            name="relationship_type"
            label="Mối quan hệ"
            rules={[{required: true, message: 'Vui lòng chọn loại mối quan hệ'}]}
          >
            <Select options={relationshipTypeOptions} />
          </Form.Item>
          {relationshipType !== 'Related' && (
            <Form.Item
              name="direction"
              label="Chiều quan hệ"
              rules={[{required: true, message: 'Vui lòng chọn chiều quan hệ'}]}
            >
              <Select
                options={[
                  {
                    value: 'current_to_other',
                    label: relationshipType === 'Parent of'
                      ? 'Vụ việc này là cha của vụ việc đã chọn'
                      : 'Vụ việc này trùng với vụ việc đã chọn',
                  },
                  {
                    value: 'other_to_current',
                    label: relationshipType === 'Parent of'
                      ? 'Vụ việc đã chọn là cha của vụ việc này'
                      : 'Vụ việc đã chọn trùng với vụ việc này',
                  },
                ]}
              />
            </Form.Item>
          )}
          <Form.Item
            name="other_case_id"
            label="Vụ việc"
            rules={[{required: true, message: 'Vui lòng chọn một vụ việc'}]}
          >
            <Select
              showSearch
              filterOption={false}
              disabled={Boolean(editing)}
              options={caseSelectOptions}
              placeholder="Tìm theo Mã vụ việc hoặc tiêu đề"
              onSearch={(value) => void loadCaseOptions(value)}
              onFocus={() => {
                if (!caseOptions.length) void loadCaseOptions('')
              }}
            />
          </Form.Item>
          <Form.Item
            name="note"
            label="Ghi chú"
            rules={[{max: 500, message: 'Ghi chú tối đa 500 ký tự'}]}
          >
            <Input.TextArea rows={4} showCount maxLength={500} />
          </Form.Item>
        </Form>
      </Modal>
    </>
  )
}
