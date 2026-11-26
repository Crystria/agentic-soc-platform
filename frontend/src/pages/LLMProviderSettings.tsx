import {useMemo, useState} from 'react'
import {Button, Form, Input, InputNumber, Modal, Popconfirm, Select, Space, Switch} from 'antd'
import {message} from '../utils/appMessage'
import {CheckCircleOutlined, EditOutlined, PlusOutlined, StopOutlined, ThunderboltOutlined} from '@ant-design/icons'
import client from '../api/client'
import DataTable from '../components/DataTable'
import {getResourceConfig} from '../config/resources'

type LLMProviderConfig = Record<string, unknown> & {
  id: string
  name: string
  base_url: string
  model: string
  api_key: string
  api_key_configured: boolean
  proxy: string
  tags: string[]
  enabled: boolean
  priority: number
  created_at: string
  updated_at: string
}

interface LLMProviderFormValues {
  name: string
  base_url: string
  model: string
  api_key?: string
  proxy?: string
  tags?: string[]
  enabled: boolean
  priority: number
}

interface LLMTestResult {
  success: boolean
  detail: string
  response_preview?: string
}

const LLM_TAG_OPTIONS = ['fast', 'powerful', 'tool_calling', 'structured_output'].map((tag) => ({
  label: tag,
  value: tag,
}))
function apiErrorMessage(error: unknown, fallback: string) {
  const response = error as { response?: { data?: unknown } }
  const data = response.response?.data
  if (!data) return fallback
  if (typeof data === 'string') return data
  if (typeof data === 'object') {
    const detail = (data as { detail?: unknown }).detail
    if (typeof detail === 'string') return detail
    return JSON.stringify(data)
  }
  return fallback
}

function initialValues(): LLMProviderFormValues {
  return {
    name: '',
    base_url: '',
    model: '',
    api_key: '',
    proxy: '',
    tags: [],
    enabled: true,
    priority: 100,
  }
}

export default function LLMProviderSettings() {
  const config = useMemo(() => getResourceConfig('llm-providers'), [])
  const [form] = Form.useForm<LLMProviderFormValues>()
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<LLMProviderConfig | null>(null)
  const [saving, setSaving] = useState(false)
  const [testingId, setTestingId] = useState<string | null>(null)
  const [testingForm, setTestingForm] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)
  const refresh = () => setRefreshKey((value) => value + 1)

  const openCreate = () => {
    setEditing(null)
    form.setFieldsValue(initialValues())
    setModalOpen(true)
  }

  const openEdit = async (record: LLMProviderConfig) => {
    setEditing(record)
    form.setFieldsValue({ ...initialValues(), ...record })
    setModalOpen(true)
    try {
      const { data } = await client.get<LLMProviderConfig>(`/settings/llm-providers/${record.id}/`, {
        params: { reveal_secrets: true },
      })
      setEditing(data)
      form.setFieldsValue({ ...initialValues(), ...data })
    } catch (error: unknown) {
      message.error(apiErrorMessage(error, 'Không thể tải thông tin nhà cung cấp LLM'))
      setModalOpen(false)
    }
  }

  const closeModal = () => {
    setModalOpen(false)
    setEditing(null)
    form.resetFields()
  }

  const saveProvider = async () => {
    setSaving(true)
    try {
      const values = await form.validateFields()
      const payload = {
        ...values,
        tags: values.tags || [],
        proxy: values.proxy || '',
        api_key: values.api_key || '',
      }
      if (editing) {
        await client.patch(`/settings/llm-providers/${editing.id}/`, payload)
        message.success('Đã cập nhật nhà cung cấp LLM')
      } else {
        await client.post('/settings/llm-providers/', payload)
        message.success('Đã tạo nhà cung cấp LLM')
      }
      closeModal()
      refresh()
    } catch (error: unknown) {
      message.error(apiErrorMessage(error, 'Lưu nhà cung cấp LLM thất bại'))
    } finally {
      setSaving(false)
    }
  }

  const showTestResult = (result: LLMTestResult) => {
    if (result.success) {
      message.success(result.detail)
    } else {
      message.error(result.detail)
    }
  }

  const updateProviderStatus = async (record: LLMProviderConfig, enabled: boolean) => {
    try {
      await client.patch(`/settings/llm-providers/${record.id}/`, { enabled })
      message.success(enabled ? 'Đã bật nhà cung cấp LLM' : 'Đã tắt nhà cung cấp LLM')
      refresh()
    } catch (error: unknown) {
      message.error(apiErrorMessage(error, 'Cập nhật trạng thái nhà cung cấp LLM thất bại'))
    }
  }

  const testSavedProvider = async (record: LLMProviderConfig) => {
    setTestingId(record.id)
    try {
      const { data } = await client.post<LLMTestResult>(`/settings/llm-providers/${record.id}/test/`)
      showTestResult(data)
    } catch (error: unknown) {
      message.error(apiErrorMessage(error, 'Kiểm tra kết nối nhà cung cấp LLM thất bại'))
    } finally {
      setTestingId(null)
    }
  }

  const testFormProvider = async () => {
    setTestingForm(true)
    try {
      const values = await form.validateFields()
      const endpoint = editing
        ? `/settings/llm-providers/${editing.id}/test/`
        : '/settings/llm-providers/test/'
      const { data } = await client.post<LLMTestResult>(endpoint, {
        ...values,
        tags: values.tags || [],
        proxy: values.proxy || '',
        api_key: values.api_key || '',
      })
      showTestResult(data)
    } catch (error: unknown) {
      message.error(apiErrorMessage(error, 'Kiểm tra kết nối nhà cung cấp LLM thất bại'))
    } finally {
      setTestingForm(false)
    }
  }

  return (
    <div style={{ height: '100%', minHeight: 0 }}>
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
        rowActions={(record, defaults) => (
          <Space size={4} align="center" className="table-row-actions">
            <Button
              size="small"
              type="text"
              icon={<ThunderboltOutlined />}
              loading={testingId === record.id}
              onClick={(event) => {
                event.stopPropagation()
                testSavedProvider(record as LLMProviderConfig)
              }}
            />
            <Popconfirm
              title={record.enabled ? 'Tắt nhà cung cấp LLM?' : 'Bật nhà cung cấp LLM?'}
              onConfirm={(event) => {
                event?.stopPropagation()
                return updateProviderStatus(record as LLMProviderConfig, !record.enabled)
              }}
              onCancel={(event) => event?.stopPropagation()}
            >
              <Button
                size="small"
                type="text"
                icon={record.enabled ? <StopOutlined /> : <CheckCircleOutlined />}
                onClick={(event) => event.stopPropagation()}
              />
            </Popconfirm>
            <Button
              size="small"
              type="text"
              icon={<EditOutlined />}
              onClick={(event) => {
                event.stopPropagation()
                openEdit(record as LLMProviderConfig)
              }}
            />
            {defaults.deleteAction}
          </Space>
        )}
        onRowClick={(record) => openEdit(record as LLMProviderConfig)}
        dense
        fillParent
      />
      <Modal
        title={editing ? `Nhà cung cấp LLM: ${editing.name}` : 'Thêm nhà cung cấp LLM'}
        open={modalOpen}
        onCancel={closeModal}
        width={760}
        destroyOnHidden
        footer={(
          <Space>
            <Button onClick={testFormProvider} loading={testingForm}>Kiểm tra</Button>
            <Button onClick={closeModal}>Hủy</Button>
            <Button type="primary" loading={saving} onClick={saveProvider}>Lưu</Button>
          </Space>
        )}
      >
        <Form form={form} layout="vertical" initialValues={initialValues()} style={{ paddingTop: 8 }}>
          <Form.Item name="name" label="Tên" rules={[{ required: true }]}>
            <Input placeholder="Nhà cung cấp chính tương thích OpenAI" />
          </Form.Item>
          <Form.Item name="base_url" label="Base URL" rules={[{ required: true }, { type: 'url' }]}>
            <Input placeholder="https://example-compatible-openai-endpoint/v1" />
          </Form.Item>
          <Form.Item name="model" label="Model" rules={[{ required: true }]}>
            <Input placeholder="gpt-4.1" />
          </Form.Item>
          <Form.Item name="api_key" label="API Key">
            <Input.Password autoComplete="new-password" />
          </Form.Item>
          <Form.Item name="proxy" label="Proxy">
            <Input placeholder="http://127.0.0.1:7890" />
          </Form.Item>
          <Form.Item name="tags" label="Thẻ" rules={[
            { required: true, message: 'Chọn ít nhất một thẻ' },
            { type: 'array', min: 1, message: 'Chọn ít nhất một thẻ' },
          ]}>
            <Select mode="tags" options={LLM_TAG_OPTIONS} placeholder="structured_output, powerful" tokenSeparators={[',']} />
          </Form.Item>
          <Space size="large" align="start">
            <Form.Item name="enabled" label="Bật" valuePropName="checked">
              <Switch />
            </Form.Item>
            <Form.Item name="priority" label="Độ ưu tiên" rules={[{ required: true }]}>
              <InputNumber min={0} max={100000} />
            </Form.Item>
          </Space>
        </Form>
      </Modal>
    </div>
  )
}
