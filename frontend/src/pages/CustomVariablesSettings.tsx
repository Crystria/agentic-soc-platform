import {useMemo, useState} from 'react'
import {App as AntApp, Button, Form, Input, InputNumber, Modal, Popconfirm, Select, Space, Switch, Typography} from 'antd'
import {DeleteOutlined, EditOutlined, EyeOutlined, PlusOutlined} from '@ant-design/icons'
import CodeMirror from '@uiw/react-codemirror'
import {json} from '@codemirror/lang-json'
import client from '../api/client'
import DataTable from '../components/DataTable'
import {getResourceConfig} from '../config/resources'
import {message} from '../utils/appMessage'

type CustomVariable = Record<string, unknown> & {
  id: string
  key: string
  value_type: CustomVariableValueType
  value: unknown
  value_configured: boolean
  is_secret: boolean
  description: string
  enabled: boolean
  created_at: string
  updated_at: string
}

type CustomVariableValueType = 'string' | 'integer' | 'float' | 'boolean' | 'list' | 'dictionary'

interface CustomVariableFormValues {
  key: string
  value_type: CustomVariableValueType
  value?: unknown
  is_secret: boolean
  description?: string
  enabled: boolean
}

interface RevealedValue {
  key: string
  value: string
}

const MAX_VALUE_BYTES = 65_536
const MAX_SAFE_INTEGER = Number.MAX_SAFE_INTEGER
const JSON_EDITOR_EXTENSIONS = [json()]
const VALUE_TYPE_OPTIONS = [
  {label: 'Chuỗi ký tự', value: 'string'},
  {label: 'Số nguyên', value: 'integer'},
  {label: 'Số thực', value: 'float'},
  {label: 'Boolean', value: 'boolean'},
  {label: 'Danh sách', value: 'list'},
  {label: 'Từ điển', value: 'dictionary'},
]

function apiErrorMessage(error: unknown, fallback: string) {
  const data = (error as { response?: { data?: unknown } }).response?.data
  if (typeof data === 'string') return data
  if (data && typeof data === 'object') {
    const detail = (data as { detail?: unknown }).detail
    if (typeof detail === 'string') return detail
    return JSON.stringify(data)
  }
  return fallback
}

function initialValues(): CustomVariableFormValues {
  return {
    key: '',
    value_type: 'string',
    value: '',
    is_secret: false,
    description: '',
    enabled: true,
  }
}

export default function CustomVariablesSettings() {
  const {modal} = AntApp.useApp()
  const config = useMemo(() => getResourceConfig('custom-variables'), [])
  const [form] = Form.useForm<CustomVariableFormValues>()
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<CustomVariable | null>(null)
  const [saving, setSaving] = useState(false)
  const [revealingId, setRevealingId] = useState<string | null>(null)
  const [revealed, setRevealed] = useState<RevealedValue | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const isSecret = Form.useWatch('is_secret', form) ?? false
  const valueType = Form.useWatch('value_type', form) ?? 'string'

  const refresh = () => setRefreshKey((value) => value + 1)

  const openCreate = () => {
    setEditing(null)
    form.setFieldsValue(initialValues())
    setModalOpen(true)
  }

  const openEdit = async (record: CustomVariable) => {
    try {
      const {data} = await client.get<CustomVariable>(`/custom/variables/${record.id}/`)
      setEditing(data)
      const value = data.is_secret
        ? ''
        : data.value_type === 'list' || data.value_type === 'dictionary'
          ? JSON.stringify(data.value, null, 2)
          : data.value
      form.setFieldsValue({...initialValues(), ...data, value})
      setModalOpen(true)
    } catch (error: unknown) {
      message.error(apiErrorMessage(error, 'Không thể tải biến tùy chỉnh'))
    }
  }

  const closeEditor = () => {
    setModalOpen(false)
    setEditing(null)
    form.resetFields()
  }

  const persist = async (values: CustomVariableFormValues, confirmSecretExposure: boolean) => {
    const payload: Record<string, unknown> = {
      value_type: values.value_type,
      is_secret: values.is_secret,
      description: values.description || '',
      enabled: values.enabled,
    }
    if (!editing) payload.key = values.key
    const omitUnchangedSecret = Boolean(editing?.is_secret && values.value_type === 'string' && values.value === '')
    if (!omitUnchangedSecret) {
      payload.value = values.value_type === 'list' || values.value_type === 'dictionary'
        ? JSON.parse(String(values.value))
        : values.value
    }
    if (confirmSecretExposure) payload.confirm_secret_exposure = true

    if (editing) {
      await client.patch(`/custom/variables/${editing.id}/`, payload)
      message.success('Đã cập nhật biến tùy chỉnh')
    } else {
      await client.post('/custom/variables/', payload)
      message.success('Đã tạo biến tùy chỉnh')
    }
    closeEditor()
    refresh()
  }

  const saveVariable = async () => {
    setSaving(true)
    try {
      const values = await form.validateFields()
      const exposesSecret = Boolean(editing?.is_secret && !values.is_secret)
      const changesType = Boolean(editing && editing.value_type !== values.value_type)
      if (exposesSecret || changesType) {
        modal.confirm({
          title: exposesSecret
            ? `Hiển thị công khai biến ${editing?.key} (không còn là bí mật)?`
            : `Đổi kiểu biến ${editing?.key} từ ${editing?.value_type} sang ${values.value_type}?`,
          content: exposesSecret
            ? 'Giá trị này sẽ hiển thị bình thường trong phản hồi Admin API và giao diện.'
            : 'Playbook và các module sẽ nhận được kiểu dữ liệu Python khác.',
          okText: exposesSecret ? 'Hiển thị giá trị' : 'Đổi kiểu',
          okButtonProps: {danger: exposesSecret},
          onOk: async () => {
            try {
              await persist(values, true)
            } catch (error: unknown) {
              message.error(apiErrorMessage(error, 'Lưu biến tùy chỉnh thất bại'))
              throw error
            }
          },
        })
      } else {
        await persist(values, false)
      }
    } catch (error: unknown) {
      message.error(apiErrorMessage(error, 'Lưu biến tùy chỉnh thất bại'))
    } finally {
      setSaving(false)
    }
  }

  const revealVariable = async (record: CustomVariable) => {
    setRevealingId(record.id)
    try {
      const {data} = await client.post<{value: string}>(`/custom/variables/${record.id}/reveal/`)
      setRevealed({key: record.key, value: data.value})
    } catch (error: unknown) {
      message.error(apiErrorMessage(error, 'Hiển thị biến tùy chỉnh thất bại'))
    } finally {
      setRevealingId(null)
    }
  }

  const deleteVariable = async (record: CustomVariable) => {
    try {
      await client.delete(`/custom/variables/${record.id}/`)
      message.success('Đã xóa biến tùy chỉnh')
      refresh()
    } catch (error: unknown) {
      message.error(apiErrorMessage(error, 'Xóa biến tùy chỉnh thất bại'))
    }
  }

  const validateValue = (_: unknown, value: unknown) => {
    const unchangedSecret = editing?.is_secret && valueType === 'string' && value === ''
    if (unchangedSecret) return Promise.resolve()
    if (value === undefined || value === null || (valueType === 'string' && value === '')) {
      return Promise.reject(new Error('Giá trị là bắt buộc.'))
    }
    if (valueType === 'integer' && (typeof value !== 'number' || !Number.isSafeInteger(value))) {
      return Promise.reject(new Error('Giá trị phải là số nguyên an toàn.'))
    }
    let serialized = String(value)
    if (valueType === 'list' || valueType === 'dictionary') {
      try {
        const parsed = JSON.parse(serialized)
        if (valueType === 'list' && !Array.isArray(parsed)) {
          return Promise.reject(new Error('Giá trị phải là danh sách JSON hợp lệ.'))
        }
        if (valueType === 'dictionary' && (parsed === null || Array.isArray(parsed) || typeof parsed !== 'object')) {
          return Promise.reject(new Error('Giá trị phải là từ điển JSON hợp lệ.'))
        }
        serialized = JSON.stringify(parsed)
      } catch {
        return Promise.reject(new Error('Giá trị phải là JSON hợp lệ.'))
      }
    }
    if (new TextEncoder().encode(serialized).length > MAX_VALUE_BYTES) {
      return Promise.reject(new Error(`Giá trị không được vượt quá ${MAX_VALUE_BYTES.toLocaleString()} byte UTF-8.`))
    }
    return Promise.resolve()
  }

  const changeValueType = (nextType: CustomVariableValueType) => {
    form.setFieldsValue({
      value_type: nextType,
      value: nextType === 'boolean' ? false : undefined,
      is_secret: nextType === 'string' ? form.getFieldValue('is_secret') : false,
    })
  }

  const formatStructuredValue = () => {
    try {
      const parsed = JSON.parse(String(form.getFieldValue('value') ?? ''))
      form.setFieldValue('value', JSON.stringify(parsed, null, 2))
    } catch {
      message.error('Giá trị phải là JSON hợp lệ trước khi định dạng')
    }
  }

  return (
    <div style={{height: 'calc(100vh - 188px)', minHeight: 360}}>
      <DataTable
        key={refreshKey}
        endpoint={config.endpoint}
        tableKey={config.key}
        rowKey={config.rowKey}
        columns={config.columns}
        filters={config.filters}
        advancedFilters={config.advancedFilters}
        searchPlaceholder={config.searchPlaceholder}
        actions={<Button icon={<PlusOutlined />} onClick={openCreate} />}
        actionColumnWidth={136}
        rowActions={(record) => {
          const variable = record as CustomVariable
          return (
            <Space size={4} align="center" className="table-row-actions">
              {variable.is_secret ? (
                <Button
                  size="small"
                  type="text"
                  icon={<EyeOutlined />}
                  loading={revealingId === variable.id}
                  onClick={(event) => {
                    event.stopPropagation()
                    revealVariable(variable)
                  }}
                />
              ) : null}
              <Button
                size="small"
                type="text"
                icon={<EditOutlined />}
                onClick={(event) => {
                  event.stopPropagation()
                  openEdit(variable)
                }}
              />
              <Popconfirm
                title={`Xóa ${variable.key}?`}
                description="Biến này sẽ bị xóa vĩnh viễn."
                okText="Xóa"
                okButtonProps={{danger: true}}
                onConfirm={(event) => {
                  event?.stopPropagation()
                  return deleteVariable(variable)
                }}
                onCancel={(event) => event?.stopPropagation()}
              >
                <Button
                  size="small"
                  type="text"
                  danger
                  icon={<DeleteOutlined />}
                  onClick={(event) => event.stopPropagation()}
                />
              </Popconfirm>
            </Space>
          )
        }}
        onRowClick={(record) => openEdit(record as CustomVariable)}
        dense
        fillParent
      />

      <Modal
        title={editing ? `Biến tùy chỉnh: ${editing.key}` : 'Thêm biến tùy chỉnh'}
        open={modalOpen}
        width={valueType === 'list' || valueType === 'dictionary' ? 760 : undefined}
        onCancel={closeEditor}
        destroyOnHidden
        footer={(
          <Space>
            <Button onClick={closeEditor}>Hủy</Button>
            <Button type="primary" loading={saving} onClick={saveVariable}>Lưu</Button>
          </Space>
        )}
      >
        <Form form={form} layout="vertical" initialValues={initialValues()} style={{paddingTop: 8}}>
          <Form.Item
            name="key"
            label="Khóa"
            rules={[
              {required: true},
              {pattern: /^[A-Z][A-Z0-9_]{0,127}$/, message: 'Chỉ dùng chữ cái in hoa, chữ số và dấu gạch dưới (_).'},
            ]}
          >
            <Input disabled={editing !== null} placeholder="EDR_API_TOKEN" maxLength={128} />
          </Form.Item>
          <Form.Item
            name="value_type"
            label="Kiểu"
            rules={[{required: true}]}
          >
            <Select options={VALUE_TYPE_OPTIONS} onChange={changeValueType} />
          </Form.Item>
          <Form.Item
            name="value"
            valuePropName={valueType === 'boolean' ? 'checked' : 'value'}
            label={(
              <Space>
                <span>Giá trị</span>
                {(valueType === 'list' || valueType === 'dictionary')
                  ? <Button type="link" size="small" onClick={formatStructuredValue}>Định dạng JSON</Button>
                  : null}
              </Space>
            )}
            rules={[{validator: validateValue}]}
            extra={editing?.is_secret
              ? 'Để trống nếu giữ nguyên giá trị hiện tại. Tối đa 65.536 byte UTF-8.'
              : 'Tối đa 65.536 byte UTF-8.'}
          >
            {valueType === 'boolean' ? (
              <Switch />
            ) : valueType === 'integer' ? (
              <InputNumber
                min={-MAX_SAFE_INTEGER}
                max={MAX_SAFE_INTEGER}
                precision={0}
                style={{width: '100%'}}
              />
            ) : valueType === 'float' ? (
              <InputNumber style={{width: '100%'}} />
            ) : isSecret ? (
              <Input.Password autoComplete="new-password" />
            ) : valueType === 'list' || valueType === 'dictionary' ? (
              <CodeMirror
                height="320px"
                theme="dark"
                extensions={JSON_EDITOR_EXTENSIONS}
                placeholder={valueType === 'list' ? '[\n  \n]' : '{\n  \n}'}
                basicSetup={{
                  lineNumbers: true,
                  foldGutter: true,
                  bracketMatching: true,
                  closeBrackets: true,
                  autocompletion: true,
                  highlightActiveLine: true,
                  highlightActiveLineGutter: true,
                }}
                style={{
                  border: '1px solid rgba(253, 253, 253, 0.12)',
                  borderRadius: 6,
                  overflow: 'hidden',
                }}
              />
            ) : (
              <Input.TextArea autoSize={{minRows: 3, maxRows: 10}} />
            )}
          </Form.Item>
          <Form.Item name="description" label="Mô tả">
            <Input.TextArea autoSize={{minRows: 2, maxRows: 5}} />
          </Form.Item>
          <Form.Item name="is_secret" label="Bí mật" valuePropName="checked">
            <Switch disabled={valueType !== 'string'} />
          </Form.Item>
          <Form.Item name="enabled" label="Bật" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={revealed ? `Giá trị bí mật: ${revealed.key}` : 'Giá trị bí mật'}
        open={revealed !== null}
        onCancel={() => setRevealed(null)}
        destroyOnHidden
        footer={<Button onClick={() => setRevealed(null)}>Đóng</Button>}
      >
        <Typography.Paragraph type="secondary">
          Giá trị này chỉ hiển thị trong hộp thoại này.
        </Typography.Paragraph>
        <Input.TextArea value={revealed?.value || ''} readOnly autoSize={{minRows: 2, maxRows: 10}} />
      </Modal>
    </div>
  )
}
