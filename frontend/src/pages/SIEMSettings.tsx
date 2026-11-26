import {useCallback, useEffect, useState} from 'react'
import {Button, Card, Col, Form, Input, InputNumber, Row, Select, Space, Switch, Tabs} from 'antd'
import {message} from '../utils/appMessage'
import {Layers, Search} from 'lucide-react'
import client from '../api/client'
import IconTabLabel from '../components/IconTabLabel'

interface SplunkConfig {
  host: string
  port: number
  username: string
  password: string
  password_configured: boolean
  scheme: 'http' | 'https'
  verify: boolean
  updated_at?: string
}

interface ElkConfig {
  host: string
  api_key: string
  api_key_configured: boolean
  verify_certs: boolean
  process_alert_from_index_enabled: boolean
  action_index: string
  action_poll_interval_seconds: number
  action_size: number
  updated_at?: string
}

interface SIEMTestResult {
  success: boolean
  detail: string
  response_preview?: string
}

function splunkInitialValues(): SplunkConfig {
  return {
    host: '',
    port: 8089,
    username: '',
    password: '',
    password_configured: false,
    scheme: 'https',
    verify: false,
  }
}

function elkInitialValues(): ElkConfig {
  return {
    host: '',
    api_key: '',
    api_key_configured: false,
    verify_certs: false,
    process_alert_from_index_enabled: false,
    action_index: 'siem-alert',
    action_poll_interval_seconds: 60,
    action_size: 1000,
  }
}

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

function showTestResult(result: SIEMTestResult) {
  if (result.success) message.success(result.detail)
  else message.error(result.detail)
}

function SplunkSettings() {
  const [form] = Form.useForm<SplunkConfig>()
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)

  const loadConfig = useCallback(async () => {
    setLoading(true)
    try {
      const { data } = await client.get<SplunkConfig>('/settings/siem/splunk/', {
        params: { reveal_secrets: true },
      })
      form.setFieldsValue({ ...splunkInitialValues(), ...data })
    } catch (error: unknown) {
      message.error(apiErrorMessage(error, 'Không thể tải cấu hình Splunk'))
    } finally {
      setLoading(false)
    }
  }, [form])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadConfig()
  }, [loadConfig])

  const saveConfig = async () => {
    setSaving(true)
    try {
      const values = await form.validateFields()
      const { data } = await client.patch<SplunkConfig>('/settings/siem/splunk/', {
        ...values,
        password: values.password || '',
      })
      form.setFieldsValue({ ...splunkInitialValues(), ...data, password: values.password || '' })
      message.success('Đã lưu cấu hình Splunk')
    } catch (error: unknown) {
      message.error(apiErrorMessage(error, 'Lưu cấu hình Splunk thất bại'))
    } finally {
      setSaving(false)
    }
  }

  const testConfig = async () => {
    setTesting(true)
    try {
      const values = await form.validateFields()
      const { data } = await client.post<SIEMTestResult>('/settings/siem/splunk/test/', {
        ...values,
        password: values.password || '',
      })
      showTestResult(data)
    } catch (error: unknown) {
      message.error(apiErrorMessage(error, 'Kiểm tra cấu hình Splunk thất bại'))
    } finally {
      setTesting(false)
    }
  }

  const actionButtons = (
    <Space>
      <Button onClick={testConfig} loading={testing}>Kiểm tra</Button>
      <Button type="primary" onClick={saveConfig} loading={saving}>Lưu</Button>
    </Space>
  )

  return (
    <Card title="Splunk" extra={actionButtons} loading={loading}>
      <Form form={form} layout="vertical" initialValues={splunkInitialValues()}>
        <Row gutter={16}>
          <Col span={12}>
            <Form.Item name="host" label="Máy chủ (Host)" rules={[{ required: true, message: 'Host là bắt buộc' }]}>
              <Input placeholder="splunk.example.com" />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item name="port" label="Cổng (Port)" rules={[{ required: true, message: 'Cổng là bắt buộc' }]}>
              <InputNumber min={1} max={65535} style={{ width: '100%' }} />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item name="username" label="Tên đăng nhập" rules={[{ required: true, message: 'Tên đăng nhập là bắt buộc' }]}>
              <Input />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item name="password" label="Mật khẩu" rules={[{ required: true, message: 'Mật khẩu là bắt buộc' }]}>
              <Input.Password autoComplete="new-password" />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item name="scheme" label="Giao thức" rules={[{ required: true }]}>
              <Select options={[{ label: 'https', value: 'https' }, { label: 'http', value: 'http' }]} />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item name="verify" label="Xác minh TLS" valuePropName="checked">
              <Switch />
            </Form.Item>
          </Col>
        </Row>
        {actionButtons}
      </Form>
    </Card>
  )
}

function ElkSettings() {
  const [form] = Form.useForm<ElkConfig>()
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const processAlertFromIndexEnabled = Form.useWatch('process_alert_from_index_enabled', form)

  const loadConfig = useCallback(async () => {
    setLoading(true)
    try {
      const { data } = await client.get<ElkConfig>('/settings/siem/elk/', {
        params: { reveal_secrets: true },
      })
      form.setFieldsValue({ ...elkInitialValues(), ...data })
    } catch (error: unknown) {
      message.error(apiErrorMessage(error, 'Không thể tải cấu hình ELK'))
    } finally {
      setLoading(false)
    }
  }, [form])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadConfig()
  }, [loadConfig])

  const saveConfig = async () => {
    setSaving(true)
    try {
      const values = await form.validateFields()
      const { data } = await client.patch<ElkConfig>('/settings/siem/elk/', {
        ...values,
        api_key: values.api_key || '',
      })
      form.setFieldsValue({ ...elkInitialValues(), ...data, api_key: values.api_key || '' })
      message.success('Đã lưu cấu hình ELK')
    } catch (error: unknown) {
      message.error(apiErrorMessage(error, 'Lưu cấu hình ELK thất bại'))
    } finally {
      setSaving(false)
    }
  }

  const testConfig = async () => {
    setTesting(true)
    try {
      const values = await form.validateFields()
      const { data } = await client.post<SIEMTestResult>('/settings/siem/elk/test/', {
        ...values,
        api_key: values.api_key || '',
      })
      showTestResult(data)
    } catch (error: unknown) {
      message.error(apiErrorMessage(error, 'Kiểm tra cấu hình ELK thất bại'))
    } finally {
      setTesting(false)
    }
  }

  const actionButtons = (
    <Space>
      <Button onClick={testConfig} loading={testing}>Kiểm tra</Button>
      <Button type="primary" onClick={saveConfig} loading={saving}>Lưu</Button>
    </Space>
  )

  return (
    <Card title="ELK" extra={actionButtons} loading={loading}>
      <Form form={form} layout="vertical" initialValues={elkInitialValues()}>
        <Form.Item name="host" label="Máy chủ (Host)" rules={[{ required: true, message: 'Host là bắt buộc' }, { type: 'url' }]}>
          <Input placeholder="https://elk.example.com:9200" />
        </Form.Item>
        <Form.Item name="api_key" label="API Key" rules={[{ required: true, message: 'API key là bắt buộc' }]}>
          <Input.Password autoComplete="new-password" />
        </Form.Item>
        <Row gutter={16}>
          <Col span={12}>
            <Form.Item name="verify_certs" label="Xác minh chứng chỉ" valuePropName="checked">
              <Switch />
            </Form.Item>
          </Col>
          <Col span={24}>
            <Form.Item name="process_alert_from_index_enabled" label="Xử lý cảnh báo từ Index" valuePropName="checked">
              <Switch />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item
              name="action_index"
              label="Index hành động"
              rules={processAlertFromIndexEnabled ? [{ required: true, message: 'Index hành động là bắt buộc' }] : []}
            >
              <Input placeholder="siem-alert" />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item
              name="action_poll_interval_seconds"
              label="Chu kỳ lấy mẫu (giây)"
              rules={processAlertFromIndexEnabled ? [{ required: true, message: 'Chu kỳ lấy mẫu là bắt buộc' }] : []}
            >
              <InputNumber min={1} max={3600} style={{ width: '100%' }} />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item
              name="action_size"
              label="Số lượng mỗi lần lấy"
              rules={processAlertFromIndexEnabled ? [{ required: true, message: 'Số lượng mỗi lần lấy là bắt buộc' }] : []}
            >
              <InputNumber min={1} max={10000} style={{ width: '100%' }} />
            </Form.Item>
          </Col>
        </Row>
        {actionButtons}
      </Form>
    </Card>
  )
}

export default function SIEMSettings() {
  return (
    <div style={{ height: '100%', minHeight: 0, overflow: 'auto', paddingBottom: 24 }}>
      <Tabs
        defaultActiveKey="splunk"
        items={[
          { key: 'splunk', label: <IconTabLabel icon={Search}>Splunk</IconTabLabel>, children: <SplunkSettings /> },
          { key: 'elk', label: <IconTabLabel icon={Layers}>ELK</IconTabLabel>, children: <ElkSettings /> },
        ]}
      />
    </div>
  )
}
