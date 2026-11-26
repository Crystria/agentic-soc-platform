import {useCallback, useEffect, useState} from 'react'
import {Button, Card, Col, Form, Input, Row, Space, Switch} from 'antd'
import {message} from '../utils/appMessage'
import client from '../api/client'

interface LDAPConfig {
  enabled: boolean
  server_uri: string
  domain: string
  bind_dn: string
  bind_password: string
  bind_password_configured: boolean
  user_search_base_dn: string
  user_login_attr: string
  updated_at?: string
}

interface LDAPTestValues extends LDAPConfig {
  test_username?: string
  test_password?: string
}

interface LDAPTestResult {
  success: boolean
  detail: string
  response_preview?: string
}

function initialValues(): LDAPConfig {
  return {
    enabled: false,
    server_uri: '',
    domain: '',
    bind_dn: '',
    bind_password: '',
    bind_password_configured: false,
    user_search_base_dn: '',
    user_login_attr: 'uid',
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

export default function LDAPSettings() {
  const [form] = Form.useForm<LDAPTestValues>()
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const enabled = Form.useWatch('enabled', form)

  const loadConfig = useCallback(async () => {
    setLoading(true)
    try {
      const { data } = await client.get<LDAPConfig>('/settings/ldap/', {
        params: { reveal_secrets: true },
      })
      form.setFieldsValue({ ...initialValues(), ...data })
    } catch (error: unknown) {
      message.error(apiErrorMessage(error, 'Không thể tải cấu hình LDAP'))
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
      const { data } = await client.patch<LDAPConfig>('/settings/ldap/', {
        enabled: values.enabled,
        server_uri: values.server_uri || '',
        domain: values.domain || '',
        bind_dn: values.bind_dn || '',
        bind_password: values.bind_password || '',
        user_search_base_dn: values.user_search_base_dn || '',
        user_login_attr: values.user_login_attr || 'uid',
      })
      form.setFieldsValue({ ...initialValues(), ...data, bind_password: values.bind_password || '' })
      message.success('Đã lưu cấu hình LDAP')
    } catch (error: unknown) {
      message.error(apiErrorMessage(error, 'Lưu cấu hình LDAP thất bại'))
    } finally {
      setSaving(false)
    }
  }

  const testConfig = async () => {
    setTesting(true)
    try {
      const values = await form.validateFields()
      const { data } = await client.post<LDAPTestResult>('/settings/ldap/test/', {
        enabled: values.enabled,
        server_uri: values.server_uri || '',
        domain: values.domain || '',
        bind_dn: values.bind_dn || '',
        bind_password: values.bind_password || '',
        user_search_base_dn: values.user_search_base_dn || '',
        user_login_attr: values.user_login_attr || 'uid',
        test_username: values.test_username || '',
        test_password: values.test_password || '',
      })
      if (data.success) message.success(data.detail)
      else message.error(data.detail)
    } catch (error: unknown) {
      message.error(apiErrorMessage(error, 'Kiểm tra cấu hình LDAP thất bại'))
    } finally {
      setTesting(false)
    }
  }

  return (
    <div style={{ height: '100%', minHeight: 0, overflow: 'auto' }}>
      <Card title="LDAP" loading={loading}>
        <Form form={form} layout="vertical" initialValues={initialValues()} style={{ maxWidth: 920 }}>
          <Form.Item name="enabled" label="Bật" valuePropName="checked">
            <Switch />
          </Form.Item>
          <Form.Item
            name="server_uri"
            label="URI máy chủ"
            rules={enabled ? [{ required: true, message: 'URI máy chủ là bắt buộc' }] : []}
          >
            <Input placeholder="ldap://ldap.example.com:389" />
          </Form.Item>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="domain" label="Tên miền (Domain)">
                <Input placeholder="example.com" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="user_login_attr" label="Thuộc tính đăng nhập" rules={[{ required: true, message: 'Thuộc tính đăng nhập là bắt buộc' }]}>
                <Input placeholder="uid" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="bind_dn" label="Bind DN">
                <Input placeholder="cn=admin,dc=example,dc=com" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="bind_password" label="Mật khẩu Bind DN">
                <Input.Password autoComplete="new-password" />
              </Form.Item>
            </Col>
            <Col span={24}>
              <Form.Item name="user_search_base_dn" label="Base DN tìm kiếm người dùng">
                <Input placeholder="ou=users,dc=example,dc=com" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="test_username" label="Tên đăng nhập kiểm tra">
                <Input />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="test_password" label="Mật khẩu kiểm tra">
                <Input.Password autoComplete="new-password" />
              </Form.Item>
            </Col>
          </Row>
          <Space>
            <Button onClick={testConfig} loading={testing}>Kiểm tra</Button>
            <Button type="primary" onClick={saveConfig} loading={saving}>Lưu</Button>
          </Space>
        </Form>
      </Card>
    </div>
  )
}
