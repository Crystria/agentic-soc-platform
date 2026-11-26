import {useCallback, useEffect, useState} from 'react'
import {Button, Card, Col, Divider, Form, InputNumber, Row, Select, Space, Tooltip, Typography} from 'antd'
import {message} from '../utils/appMessage'
import {QuestionCircleOutlined} from '@ant-design/icons'
import client from '../api/client'

interface RuntimeConfig {
  prompt_language: 'en' | 'zh'
  stream_maxlen: number
  dashboard_refresh_interval_seconds: 300 | 900 | 1800 | 3600
  updated_at?: string
}

function initialValues(): RuntimeConfig {
  return {
    prompt_language: 'en',
    stream_maxlen: 10000,
    dashboard_refresh_interval_seconds: 300,
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

function helpLabel(label: string, help: string) {
  return (
    <span>
      {label}
      <Tooltip title={help}>
        <QuestionCircleOutlined style={{ marginLeft: 6, color: 'rgba(255,255,255,0.45)' }} />
      </Tooltip>
    </span>
  )
}

export default function RuntimeSettings() {
  const [form] = Form.useForm<RuntimeConfig>()
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  const loadConfig = useCallback(async () => {
    setLoading(true)
    try {
      const { data } = await client.get<RuntimeConfig>('/settings/runtime/')
      form.setFieldsValue({ ...initialValues(), ...data })
    } catch (error: unknown) {
      message.error(apiErrorMessage(error, 'Không thể tải cấu hình Runtime'))
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
      const { data } = await client.patch<RuntimeConfig>('/settings/runtime/', values)
      form.setFieldsValue({ ...initialValues(), ...data })
      message.success('Đã lưu cấu hình Runtime')
    } catch (error: unknown) {
      message.error(apiErrorMessage(error, 'Lưu cấu hình Runtime thất bại'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ height: '100%', minHeight: 0, overflow: 'auto' }}>
      <Card title="Cấu hình Runtime" loading={loading}>
        <Form form={form} layout="vertical" initialValues={initialValues()} style={{ maxWidth: 920 }}>
          <Typography.Text strong>Prompt</Typography.Text>
          <Divider style={{ margin: '8px 0 16px' }} />
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="prompt_language"
                label={helpLabel('Ngôn ngữ Prompt', 'Chọn ngôn ngữ tệp prompt dùng cho quá trình phân tích agentic và trích xuất tri thức.')}
                rules={[{ required: true }]}
              >
                <Select options={[
                  { label: 'Tiếng Anh', value: 'en' },
                  { label: 'Tiếng Trung', value: 'zh' },
                ]} />
              </Form.Item>
            </Col>
          </Row>

          <Typography.Text strong>Cấu hình Stream</Typography.Text>
          <Divider style={{ margin: '8px 0 16px' }} />
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="stream_maxlen"
                label={helpLabel('Độ dài tối đa Stream', 'Độ dài xấp xỉ tối đa được giữ lại cho Redis Streams khi webhook nạp cảnh báo. Luồng xử lý ELK action dùng chung đường ghi này.')}
                rules={[{ required: true }]}
              >
                <InputNumber min={1} max={10000000} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>

          <Typography.Text strong>Cấu hình Tổng quan</Typography.Text>
          <Divider style={{ margin: '8px 0 16px' }} />
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="dashboard_refresh_interval_seconds"
                label={helpLabel('Chu kỳ làm mới Tổng quan', 'Điều chỉnh tần suất worker nền tính toán lại bộ nhớ đệm Tổng quan cho mốc 24 giờ, 7 ngày và 30 ngày.')}
                rules={[{ required: true }]}
              >
                <Select options={[
                  { label: '5 phút', value: 300 },
                  { label: '15 phút', value: 900 },
                  { label: '30 phút', value: 1800 },
                  { label: '60 phút', value: 3600 },
                ]} />
              </Form.Item>
            </Col>
          </Row>
          <Space>
            <Button type="primary" onClick={saveConfig} loading={saving}>Lưu</Button>
          </Space>
        </Form>
      </Card>
    </div>
  )
}
