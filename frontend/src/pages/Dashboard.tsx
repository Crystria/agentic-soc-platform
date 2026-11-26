import {useCallback, useEffect, useMemo, useState, type CSSProperties, type ReactNode} from 'react'
import {Area, Gauge, Radar as RadarChart} from '@ant-design/charts'
import {Alert, Badge, Button, Card, Progress, Segmented, Skeleton, Space, Statistic, Tabs, Tag, Tooltip, Typography} from 'antd'
import {InfoCircleOutlined, ReloadOutlined} from '@ant-design/icons'
import {
  Activity,
  BookOpen,
  ChartSpline,
  GaugeIcon,
  Kanban,
  PackageSearch,
  Radar as RadarIcon,
  RadioTower,
  ScanSearch,
  ShieldAlert,
  Target,
  TextSearch,
  TriangleAlert,
  Workflow,
} from 'lucide-react'
import {
  fetchDashboardOverview,
  type DashboardHighlight,
  type DashboardKeyword,
  type DashboardLabelValue,
  type DashboardMeanTime,
  type DashboardMitreSeverityCell,
  type DashboardOverview,
  type DashboardRiskArtifact,
  type DashboardWindow,
} from '../api/dashboard'
import {severityColors} from '../theme'
import {DISPLAY_DATE_LOCALE, localizeChoiceLabel, localizeWithMap, SEVERITY_LABELS} from '../utils/i18n'
import './Dashboard.css'

const {Text} = Typography

const windowOptions: { label: string; value: DashboardWindow }[] = [
  { label: '24 giờ', value: '24h' },
  { label: '7 ngày', value: '7d' },
  { label: '30 ngày', value: '30d' },
]
const windowLabels: Record<DashboardWindow, string> = {
  '24h': '24 GIỜ',
  '7d': '7 NGÀY',
  '30d': '30 NGÀY',
}
const chartTheme = 'classicDark' as const
const lucideIconProps = { size: 16, strokeWidth: 2 }
const riskBands = ['STABLE', 'GUARDED', 'ELEVATED', 'CRITICAL'] as const

type RiskBand = typeof riskBands[number]
type MetricTone = 'critical' | 'warning' | 'signal' | 'success' | 'intel' | 'neutral'

const riskBandLabels: Record<RiskBand, string> = {
  STABLE: 'ỔN ĐỊNH',
  GUARDED: 'CẢNH GIÁC',
  ELEVATED: 'TĂNG CAO',
  CRITICAL: 'NGHIÊM TRỌNG',
}

interface RiskPostureLevel {
  band: RiskBand
  color: string
  summary: string
}

function hasValues(data: DashboardLabelValue[]) {
  return data.some((item) => item.value > 0)
}

function formatNumber(value: number | null | undefined) {
  if (value === null || value === undefined) return 'N/A'
  return value.toLocaleString(DISPLAY_DATE_LOCALE)
}

function formatPercent(value: number | null | undefined) {
  if (value === null || value === undefined) return 'N/A'
  return `${value.toLocaleString(DISPLAY_DATE_LOCALE)}%`
}

function formatDuration(seconds: number | null | undefined) {
  if (seconds === null || seconds === undefined) return 'N/A'
  let remaining = Math.max(0, Math.round(seconds))
  const days = Math.floor(remaining / 86400)
  remaining %= 86400
  const hours = Math.floor(remaining / 3600)
  remaining %= 3600
  const minutes = Math.floor(remaining / 60)
  const restSeconds = remaining % 60
  const parts = [
    days ? `${days} ngày` : '',
    hours ? `${hours} giờ` : '',
    minutes ? `${minutes} phút` : '',
    !days && !hours && !minutes ? `${restSeconds} giây` : '',
  ].filter(Boolean)
  return parts.slice(0, 2).join(' ')
}

function severityColor(severity: string) {
  return severityColors[severity] || '#1677ff'
}

function getRiskPostureLevel(value: number | null | undefined): RiskPostureLevel {
  const score = value ?? 0
  if (score >= 80) {
    return { band: 'CRITICAL', color: '#ff4d4f', summary: 'Áp lực rủi ro nghiêm trọng, cần xử lý khẩn cấp.' }
  }
  if (score >= 55) {
    return { band: 'ELEVATED', color: '#fa8c16', summary: 'Áp lực rủi ro tăng cao trên các tín hiệu hoạt động.' }
  }
  if (score >= 35) {
    return { band: 'GUARDED', color: '#fadb14', summary: 'Mức cảnh giác với áp lực tín hiệu đang được theo dõi.' }
  }
  return { band: 'STABLE', color: '#52c41a', summary: 'Trạng thái ổn định, chưa có áp lực nổi bật.' }
}

function commandNarrative(data: DashboardOverview | null) {
  if (!data) return 'Đang chờ đồng bộ dữ liệu giám sát.'
  const {summary} = data
  const posture = getRiskPostureLevel(summary.active_risk_index)
  const leadSignal = summary.open_critical_cases > 0
    ? `${formatNumber(summary.open_critical_cases)} vụ việc nghiêm trọng đang mở`
    : summary.critical_high_alerts > 0
      ? `${formatNumber(summary.critical_high_alerts)} cảnh báo cao/nghiêm trọng`
      : 'tín hiệu nghiêm trọng ổn định'
  const automation = summary.failed_playbooks > 0
    ? `${formatNumber(summary.failed_playbooks)} playbook thất bại`
    : `tự động hóa thành công ${formatPercent(summary.automation_success_rate)}`
  return `Mức ${riskBandLabels[posture.band]} · ${leadSignal} · ${automation}`
}

function automationTone(summary: DashboardOverview['summary'] | undefined): MetricTone {
  if (!summary) return 'neutral'
  return summary.failed_playbooks > 0 ? 'critical' : 'success'
}

function eventTimeParts(timestamp: string) {
  const value = new Date(timestamp)
  return {
    time: value.toLocaleTimeString(DISPLAY_DATE_LOCALE, { hour: '2-digit', minute: '2-digit' }),
    date: value.toLocaleDateString(DISPLAY_DATE_LOCALE, { month: '2-digit', day: '2-digit' }),
  }
}

function compactMitreTacticLabel(label: string) {
  const normalized = label.trim()
  const labels: Record<string, string> = {
    Reconnaissance: 'Recon',
    'Resource Development': 'Resource',
    'Initial Access': 'Initial',
    Execution: 'Exec',
    Persistence: 'Persist',
    'Privilege Escalation': 'Priv Esc',
    'Defense Evasion': 'Defense',
    'Credential Access': 'Cred',
    Discovery: 'Discover',
    'Lateral Movement': 'Lateral',
    Collection: 'Collect',
    'Command and Control': 'C2',
    'Command & Control': 'C2',
    Exfiltration: 'Exfil',
    Impact: 'Impact',
  }
  if (labels[normalized]) return labels[normalized]
  if (normalized.length <= 10) return normalized
  return normalized
    .replace(/\band\b/gi, '&')
    .split(/\s+/)
    .map((part) => part.slice(0, 4))
    .slice(0, 2)
    .join(' ')
}

function eventAccentColor(item: DashboardHighlight) {
  if (item.kind === 'case') return statusColor(item.status)
  if (item.status === 'Resolved' || item.status === 'Closed') return '#52c41a'
  return '#b37feb'
}

function generatedAtLabel(value: string | undefined) {
  if (!value) return 'Đang chờ dữ liệu'
  return `Cập nhật lúc ${new Date(value).toLocaleTimeString(DISPLAY_DATE_LOCALE)}`
}

function cacheAgeLabel(seconds: number) {
  if (seconds < 60) return `${seconds} giây`
  if (seconds < 3600) return `${Math.floor(seconds / 60)} phút`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} giờ`
  return `${Math.floor(seconds / 86400)} ngày`
}

function CyberEmpty({ title = 'Chưa có tín hiệu', description = 'Không có dữ liệu trong khoảng thời gian này.' }: { title?: string; description?: string }) {
  return (
    <div className="dashboard-empty">
      <RadioTower size={22} strokeWidth={1.8} />
      <strong>{title}</strong>
      <span>{description}</span>
    </div>
  )
}

function CyberCard({ title, extra, children, className = '' }: { title: ReactNode; extra?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <Card
      className={`dashboard-card ${className}`}
      title={<span className="dashboard-card-title">{title}</span>}
      extra={extra}
      styles={{ body: { padding: 16 } }}
    >
      {children}
    </Card>
  )
}

function MetricCard({
  title,
  value,
  suffix,
  tooltip,
  accent = '#1677ff',
  sub,
  category,
  tone = 'signal',
  priority = false,
}: {
  title: string
  value: ReactNode
  suffix?: ReactNode
  tooltip?: string
  accent?: string
  sub?: ReactNode
  category?: string
  tone?: MetricTone
  priority?: boolean
}) {
  const statisticTitle = (
    <Space size={6}>
      <span>{title}</span>
      {tooltip && (
        <Tooltip title={tooltip}>
          <InfoCircleOutlined />
        </Tooltip>
      )}
    </Space>
  )

  return (
    <Card className={`dashboard-metric-card tone-${tone}${priority ? ' priority' : ''}`} style={{ '--metric-color': accent } as CSSProperties} styles={{ body: { padding: 16 } }}>
      {category && <div className="dashboard-metric-category">{category}</div>}
      <Statistic title={statisticTitle} value={value as string | number} suffix={suffix} styles={{ content: { color: '#f5faff' } }} />
      {sub && <div className="dashboard-metric-sub">{sub}</div>}
    </Card>
  )
}

function MeanTimeCard({ title, metric, tooltip, accent }: { title: string; metric: DashboardMeanTime; tooltip: string; accent: string }) {
  return (
    <MetricCard
      title={title}
      value={formatDuration(metric.seconds)}
      tooltip={tooltip}
      accent={accent}
      category="Thời gian phản hồi"
      tone="signal"
      sub={`${metric.sample_count} mẫu hợp lệ`}
    />
  )
}

function RiskPostureCard({ data, loading }: { data: DashboardOverview | null; loading: boolean }) {
  const riskIndex = data?.summary.active_risk_index ?? 0
  const clampedRiskIndex = Math.min(100, Math.max(0, riskIndex))
  const riskLevel = getRiskPostureLevel(riskIndex)
  const gaugeConfig = useMemo(() => ({
    data: {
      percent: clampedRiskIndex / 100,
      thresholds: [0.35, 0.55, 0.8, 1],
    },
    height: 190,
    theme: chartTheme,
    scale: {
      color: {
        range: ['#52c41a', '#13c2c2', '#fa8c16', '#ff4d4f'],
      },
    },
    style: {
      arcLineWidth: 9,
      pointerLineWidth: 3,
      pointerLineCap: 'round',
      pointerStroke: riskLevel.color,
      pinR: 7,
      pinFill: '#061528',
      pinStroke: riskLevel.color,
      textContent: () => '',
    },
  }), [clampedRiskIndex, riskLevel.color])

  return (
    <CyberCard
      className="dashboard-risk-card"
      title={<><ShieldAlert {...lucideIconProps} /> Chỉ số rủi ro hiện tại</>}
      extra={(
        <Tooltip title="Chỉ số áp lực rủi ro có trọng số dựa trên vụ việc đang mở, cảnh báo hoạt động, playbook thất bại và mức độ nghiêm trọng.">
          <InfoCircleOutlined />
        </Tooltip>
      )}
    >
      {loading && !data ? (
        <Skeleton active paragraph={{ rows: 4 }} />
      ) : (
        <div className="dashboard-risk-body" style={{ '--risk-color': riskLevel.color } as CSSProperties}>
          <div className="dashboard-risk-gauge">
            <Gauge {...gaugeConfig} />
          </div>
          <div className="dashboard-risk-score">
            <div className="dashboard-risk-value-row">
              <div className="dashboard-risk-value">{riskIndex}</div>
              <span className="dashboard-risk-level">{riskBandLabels[riskLevel.band]}</span>
            </div>
            <div className="dashboard-risk-label">áp lực có trọng số / 100</div>
            <div className="dashboard-risk-summary">{riskLevel.summary}</div>
            <div className="dashboard-risk-band">
              {riskBands.map((band) => (
                <span className={band === riskLevel.band ? 'active' : ''} key={band}>{riskBandLabels[band]}</span>
              ))}
            </div>
            <div className="dashboard-risk-meta">
              <div className="dashboard-chip"><span>Vụ việc đang mở</span><span>{formatNumber(data?.summary.open_cases)}</span></div>
              <div className="dashboard-chip"><span>Vụ việc nghiêm trọng</span><span>{formatNumber(data?.summary.open_critical_cases)}</span></div>
              <div className="dashboard-chip"><span>Cảnh báo Cao/Nghiêm trọng</span><span>{formatNumber(data?.summary.critical_high_alerts)}</span></div>
            </div>
          </div>
        </div>
      )}
    </CyberCard>
  )
}

function statusColor(status: string) {
  const colors: Record<string, string> = {
    New: '#13c2c2',
    'In Progress': '#1677ff',
    'On Hold': '#faad14',
    Resolved: '#52c41a',
    Closed: '#8c8c8c',
  }
  return colors[status] || '#1677ff'
}

function signalColor(index: number) {
  return ['#69b1ff', '#13c2c2', '#b37feb', '#597ef7', '#36cfc9', '#9254de'][index % 6]
}

function ChartPanel({ title, extra, children, compact = false, className = '' }: { title: ReactNode; extra?: ReactNode; children: ReactNode; compact?: boolean; className?: string }) {
  return (
    <CyberCard title={title} extra={extra} className={className}>
      <div className={`dashboard-panel-body${compact ? ' compact' : ''}`}>{children}</div>
    </CyberCard>
  )
}

function AlertTrend({ data }: { data: DashboardLabelValue[] }) {
  const config = useMemo(() => ({
    data,
    xField: 'label',
    yField: 'value',
    height: 230,
    autoFit: true,
    smooth: true,
    colorField: 'value',
    theme: chartTheme,
  }), [data])

  if (!hasValues(data)) return <CyberEmpty />
  return <Area {...config} />
}

function SeverityPressure({ data }: { data: DashboardLabelValue[] }) {
  const visibleData = data.filter((item) => !['Info', 'Informational'].includes(item.label))
  const maxValue = Math.max(...visibleData.map((item) => item.value), 0)
  const total = visibleData.reduce((sum, item) => sum + item.value, 0)

  if (!hasValues(visibleData)) return <CyberEmpty />

  return (
    <div className="dashboard-severity-pressure">
      {visibleData.map((item) => {
        const pressure = maxValue === 0 ? 0 : Math.round((item.value / maxValue) * 100)
        const share = total === 0 ? 0 : Math.round((item.value / total) * 100)
        return (
          <div className="dashboard-severity-row" key={item.label}>
            <div className="dashboard-severity-header">
              <span className="dashboard-severity-name">
                <span className="dashboard-severity-dot" style={{ background: severityColor(item.label) }} />
                {localizeChoiceLabel(item.label)}
              </span>
              <span className="dashboard-severity-value">{item.value}</span>
            </div>
            <Progress
              percent={pressure}
              showInfo={false}
              strokeColor={severityColor(item.label)}
              railColor="rgba(255,255,255,0.08)"
            />
            <div className="dashboard-severity-share">{share}% phân bổ mức độ</div>
          </div>
        )
      })}
    </div>
  )
}

function CaseWorkloadState({ data }: { data: DashboardLabelValue[] }) {
  const visibleData = data.filter((item) => item.value > 0)
  const maxValue = Math.max(...visibleData.map((item) => item.value), 0)
  const total = visibleData.reduce((sum, item) => sum + item.value, 0)

  if (!hasValues(visibleData)) return <CyberEmpty />

  return (
    <div className="dashboard-workload-state">
      {visibleData.map((item) => {
        const percent = maxValue === 0 ? 0 : Math.round((item.value / maxValue) * 100)
        const share = total === 0 ? 0 : Math.round((item.value / total) * 100)
        return (
          <div className="dashboard-workload-row" key={item.label}>
            <div className="dashboard-workload-head">
              <span>{localizeChoiceLabel(item.label)}</span>
              <strong>{item.value}</strong>
            </div>
            <Progress percent={percent} showInfo={false} strokeColor={statusColor(item.label)} railColor="rgba(255,255,255,0.08)" />
            <span className="dashboard-workload-share">{share}% khối lượng xử lý</span>
          </div>
        )
      })}
    </div>
  )
}

function ProductCategorySignals({ data }: { data: DashboardLabelValue[] }) {
  const visibleData = data.filter((item) => item.value > 0)
  const maxValue = Math.max(...visibleData.map((item) => item.value), 0)
  const total = visibleData.reduce((sum, item) => sum + item.value, 0)

  if (!hasValues(visibleData)) return <CyberEmpty />

  return (
    <div className="dashboard-signal-rank">
      {visibleData.map((item, index) => {
        const percent = maxValue === 0 ? 0 : Math.round((item.value / maxValue) * 100)
        const share = total === 0 ? 0 : Math.round((item.value / total) * 100)
        return (
          <div className="dashboard-signal-row" key={item.label}>
            <span className="dashboard-signal-index">{String(index + 1).padStart(2, '0')}</span>
            <div className="dashboard-signal-main">
              <div className="dashboard-signal-head">
                <span>{localizeChoiceLabel(item.label)}</span>
                <strong>{item.value}</strong>
              </div>
              <div className="dashboard-signal-track">
                <span style={{ width: `${percent}%`, background: signalColor(index) }} />
              </div>
              <div className="dashboard-signal-meta">
                <span>{share}% tín hiệu sản phẩm</span>
                <span>{percent}% áp lực tương đối</span>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function ThreatKeywordCloud({ data }: { data: DashboardKeyword[] }) {
  const visibleData = data.slice(0, 32)
  const values = visibleData.map((item) => item.value)
  const minValue = Math.min(...values)
  const maxValue = Math.max(...values)

  if (visibleData.length === 0) return <CyberEmpty title="Chưa có từ khóa đe dọa" />

  return (
    <div className="dashboard-keyword-cloud">
      {visibleData.map((item, index) => {
        const ratio = maxValue === minValue ? 0.5 : (item.value - minValue) / (maxValue - minValue)
        const fontSize = Math.round(12 + ratio * 18)
        return (
          <span
            className="dashboard-keyword-token"
            key={`${item.text}-${index}`}
            title={`${item.text}: ${item.value}`}
            style={{
              color: signalColor(index),
              fontSize,
              opacity: 0.68 + ratio * 0.32,
              fontWeight: ratio > 0.62 ? 800 : ratio > 0.32 ? 700 : 500,
            }}
          >
            {item.text}
          </span>
        )
      })}
    </div>
  )
}

function SecurityDomainRadar({ data }: { data: DashboardLabelValue[] }) {
  const visibleData = data.filter((item) => item.value > 0)
  if (!hasValues(visibleData)) return <CyberEmpty title="Chưa có tín hiệu tên miền" />
  const radarData = visibleData.map((item) => ({
    ...item,
    fullLabel: item.label,
    label: compactMitreTacticLabel(item.label),
  }))
  const maxValue = Math.max(...radarData.map((item) => item.value), 1)
  const config = {
    data: radarData,
    xField: 'label',
    yField: 'value',
    height: 240,
    autoFit: true,
    theme: chartTheme,
    coordinateType: 'polar' as const,
    scale: {
      y: {
        domain: [0, maxValue],
        nice: true,
      },
    },
    area: {
      style: {
        fill: '#1677ff',
        fillOpacity: 0.18,
      },
    },
    line: {
      style: {
        stroke: '#69b1ff',
        lineWidth: 2,
      },
    },
    point: {
      style: {
        fill: '#13c2c2',
        stroke: '#f5faff',
        lineWidth: 1,
        r: 3,
      },
    },
  }

  return (
    <div className="dashboard-radar-wrap">
      <RadarChart {...config} />
      <div className="dashboard-radar-legend">
        {radarData.map((item, index) => (
          <span key={`${item.fullLabel}-${index}`} title={`${item.fullLabel}: ${item.value}`}>
            <i style={{ background: signalColor(index), color: signalColor(index) }} />
            <strong>{item.label}</strong>
            <em>{item.fullLabel}</em>
          </span>
        ))}
      </div>
    </div>
  )
}

function MitreSeverityMatrix({ data }: { data: DashboardMitreSeverityCell[] }) {
  const visibleCells = data.filter((item) => item.value > 0)
  const tactics = [...new Set(data.map((item) => item.tactic))]
  const severities = [...new Set(data.map((item) => item.severity))]
  const maxValue = Math.max(...visibleCells.map((item) => item.value), 0)
  const cellMap = new Map(data.map((item) => [`${item.severity}:${item.tactic}`, item.value]))

  if (tactics.length === 0) return <CyberEmpty title="Chưa có chiến thuật MITRE" />

  return (
    <div className="dashboard-mitre-matrix">
      <div className="dashboard-mitre-head" style={{ gridTemplateColumns: `72px repeat(${tactics.length}, minmax(0, 1fr))` }}>
        <span>Mức độ</span>
        {tactics.map((tactic) => <span key={tactic} title={tactic}>{tactic}</span>)}
      </div>
      {severities.map((severity) => (
        <div className="dashboard-mitre-row" key={severity} style={{ gridTemplateColumns: `72px repeat(${tactics.length}, minmax(0, 1fr))` }}>
          <span className="dashboard-mitre-severity" title={localizeWithMap(severity, SEVERITY_LABELS)}>{localizeWithMap(severity, SEVERITY_LABELS)}</span>
          {tactics.map((tactic) => {
            const value = cellMap.get(`${severity}:${tactic}`) || 0
            const intensity = maxValue === 0 ? 0 : value / maxValue
            const color = severityColor(severity)
            return (
              <span
                className="dashboard-mitre-cell"
                key={`${severity}-${tactic}`}
                title={`${localizeWithMap(severity, SEVERITY_LABELS)} / ${tactic}: ${value}`}
                style={{
                  background: value > 0 ? `linear-gradient(135deg, ${color}${Math.round(34 + intensity * 108).toString(16).padStart(2, '0')}, rgba(255,255,255,0.04))` : 'rgba(255,255,255,0.035)',
                  borderColor: value > 0 ? `${color}66` : 'rgba(255,255,255,0.06)',
                  color: value > 0 ? '#f5faff' : 'rgba(255,255,255,0.24)',
                  boxShadow: value > 0 ? `0 0 ${Math.round(8 + intensity * 18)}px ${color}33` : undefined,
                }}
              >
                {value}
              </span>
            )
          })}
        </div>
      ))}
    </div>
  )
}

function AutomationPanel({ data }: { data: DashboardLabelValue[] }) {
  const total = data.reduce((sum, item) => sum + item.value, 0)
  if (total === 0) return <CyberEmpty title="Chưa có dữ liệu Playbook" description="Chưa có playbook nào chạy trong khoảng thời gian này." />

  return (
    <div className="dashboard-mini-list">
      {data.map((item) => {
        const percent = total === 0 ? 0 : Math.round((item.value / total) * 100)
        const color = item.label === 'Failed' ? '#ff4d4f' : item.label === 'Success' ? '#52c41a' : item.label === 'Running' ? '#1677ff' : '#faad14'
        return (
          <div className="dashboard-progress-row" key={item.label}>
            <div className="dashboard-progress-header">
              <span>{localizeChoiceLabel(item.label)}</span>
              <strong>{item.value}</strong>
            </div>
            <Progress percent={percent} showInfo={false} strokeColor={color} railColor="rgba(255,255,255,0.08)" />
          </div>
        )
      })}
    </div>
  )
}

function CoveragePanel({ data }: { data: DashboardOverview }) {
  const rows = [
    { label: 'Độ phủ làm giàu dữ liệu', value: data.coverage.enrichment_coverage, color: '#13c2c2' },
    { label: 'Độ phủ Playbook', value: data.coverage.playbook_coverage, color: '#1677ff' },
  ]

  return (
    <div className="dashboard-mini-list">
      {rows.map((row) => (
        <div className="dashboard-progress-row" key={row.label}>
          <div className="dashboard-progress-header">
            <span>{row.label}</span>
            <strong>{formatPercent(row.value)}</strong>
          </div>
          <Progress percent={row.value || 0} showInfo={false} strokeColor={row.color} railColor="rgba(255,255,255,0.08)" />
        </div>
      ))}
      <div className="dashboard-chip"><span>Tổng số vụ việc</span><span>{formatNumber(data.summary.total_cases)}</span></div>
      <div className="dashboard-chip"><span>Thực thể phân biệt quan sát được</span><span>{formatNumber(data.summary.total_artifacts)}</span></div>
      <div className="dashboard-chip"><span>Bản ghi tri thức</span><span>{formatNumber(data.summary.total_knowledge)}</span></div>
      <div className="dashboard-chip"><span>Làm giàu đã tạo</span><span>{formatNumber(data.summary.total_enrichments)}</span></div>
    </div>
  )
}

function RiskArtifacts({ artifacts }: { artifacts: DashboardRiskArtifact[] }) {
  if (artifacts.length === 0) return <CyberEmpty title="Chưa có thực thể rủi ro" description="Không có thực thể liên kết cảnh báo nào trong khoảng thời gian này." />

  return (
    <div className="dashboard-artifact-grid">
      {artifacts.slice(0, 6).map((artifact) => (
        <div className="dashboard-artifact-card" key={artifact.id}>
          <div className="dashboard-artifact-value" title={artifact.value}>{artifact.value || 'Thực thể không xác định'}</div>
          <div className="dashboard-artifact-meta">
            <Tag color="blue">{localizeChoiceLabel(artifact.type || 'Unknown')}</Tag>
            <Tag color="purple">{localizeChoiceLabel(artifact.role || 'Unknown')}</Tag>
          </div>
          <div className="dashboard-chip"><span>Điểm rủi ro</span><span>{artifact.risk_score}</span></div>
          <div className="dashboard-chip"><span>Cảnh báo liên kết</span><span>{artifact.alert_count}</span></div>
        </div>
      ))}
    </div>
  )
}

function HighlightStream({ highlights }: { highlights: DashboardHighlight[] }) {
  if (highlights.length === 0) return <CyberEmpty title="Chưa có sự kiện nghiêm trọng" description="Không ghi nhận tín hiệu cao hoặc nghiêm trọng trong khoảng thời gian này." />

  return (
    <div className="dashboard-event-stream-container">
      <div className="dashboard-event-stream">
        {highlights.map((item) => {
          const timestamp = eventTimeParts(item.timestamp)
          const eventAccent = eventAccentColor(item)
          const kindLabel = ({ case: 'VỤ VIỆC', alert: 'CẢNH BÁO' } as Record<string, string>)[item.kind] || String(item.kind).toUpperCase()
          return (
            <div
              className="dashboard-event"
              key={`${item.kind}-${item.id}`}
              style={{ '--event-color': eventAccent, '--severity-color': severityColor(item.severity) } as CSSProperties}
            >
              <div className="dashboard-event-time">
                <span>{timestamp.time}</span>
                <small>{timestamp.date}</small>
              </div>
              <div className="dashboard-event-body">
                <div className="dashboard-event-title">
                  <strong title={item.title}>{item.title || item.readable_id}</strong>
                  <Badge color={severityColor(item.severity)} text={localizeChoiceLabel(item.severity || 'Unknown')} />
                </div>
                <div className="dashboard-event-meta">
                  <span>{kindLabel}</span>
                  <span>{item.readable_id}</span>
                  <span>{localizeChoiceLabel(item.status || 'Unknown')}</span>
                  <span>{item.subtitle}</span>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function CommandSignalPill({ label, value, color, emphasis = false }: { label: string; value: ReactNode; color: string; emphasis?: boolean }) {
  return (
    <div className={`dashboard-command-pill${emphasis ? ' emphasis' : ''}`} style={{ '--signal-color': color } as CSSProperties}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

export default function Dashboard() {
  const [selectedWindow, setSelectedWindow] = useState<DashboardWindow>('7d')
  const [data, setData] = useState<DashboardOverview | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const loadOverview = useCallback(async (targetWindow: DashboardWindow) => {
    setLoading(true)
    setError('')
    try {
      const overview = await fetchDashboardOverview(targetWindow)
      setData(overview)
    } catch (requestError: unknown) {
      const responseStatus = (requestError as { response?: { status?: number } }).response?.status
      setError(responseStatus === 503
        ? 'Bộ nhớ đệm Tổng quan đang được khởi tạo. Dữ liệu sẽ hiển thị sau khi worker nền hoàn tất lần làm mới đầu tiên.'
        : 'Kết nối dữ liệu giám sát bị gián đoạn. Đang hiển thị dữ liệu gần nhất nếu có.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadOverview(selectedWindow)
  }, [loadOverview, selectedWindow])

  useEffect(() => {
    const intervalSeconds = data?.cache.refresh_interval_seconds ?? 300
    const timer = window.setInterval(() => {
      void loadOverview(selectedWindow)
    }, intervalSeconds * 1000)
    return () => window.clearInterval(timer)
  }, [data?.cache.refresh_interval_seconds, loadOverview, selectedWindow])

  const summary = data?.summary
  const riskLevel = getRiskPostureLevel(summary?.active_risk_index)

  return (
    <div className="dashboard-page">
      <div className="dashboard-shell">
        {/* Compact Hero Section */}
        <section className="dashboard-hero compact">
          <div className="dashboard-hero-content">
            <div className="dashboard-hero-copy">
              <div className="dashboard-eyebrow"><RadioTower size={13} /> Trung tâm Điều hành An ninh mạng</div>
              <h1 className="dashboard-title">Tổng quan Trạng thái Bảo mật</h1>
              <div className="dashboard-command-summary" style={{ '--posture-color': riskLevel.color } as CSSProperties}>
                <span className="dashboard-command-state">{riskBandLabels[riskLevel.band]}</span>
                <span className="dashboard-command-copy">{commandNarrative(data)}</span>
              </div>
            </div>
            <div className="dashboard-hero-actions">
              {error && <Alert className="dashboard-soft-alert" type="warning" title={error} showIcon />}
              {data?.cache.stale_warning && (
                <Alert
                  className="dashboard-soft-alert"
                  type="warning"
                  title={`Dữ liệu Tổng quan đã cũ. Lần cập nhật gần nhất cách đây ${cacheAgeLabel(data.cache.age_seconds)}.`}
                  showIcon
                />
              )}
              <div className="dashboard-control-panel">
                <Text className="dashboard-refresh-time">{generatedAtLabel(data?.generated_at)}</Text>
                <div className="dashboard-control-row">
                  <Segmented
                    className="dashboard-window-segmented"
                    options={windowOptions}
                    value={selectedWindow}
                    onChange={(value) => setSelectedWindow(value as DashboardWindow)}
                  />
                  <Tooltip title="Làm mới">
                    <Button className="dashboard-refresh-button" icon={<ReloadOutlined />} loading={loading} onClick={() => void loadOverview(selectedWindow)} />
                  </Tooltip>
                </div>
              </div>
            </div>
          </div>
          <div className="dashboard-command-strip">
            <CommandSignalPill label="Chỉ số rủi ro" value={`${formatNumber(summary?.active_risk_index)} / 100`} color={riskLevel.color} emphasis />
            <CommandSignalPill label="Vụ việc nghiêm trọng" value={formatNumber(summary?.open_critical_cases)} color="#ff4d4f" />
            <CommandSignalPill label="Cảnh báo Cao/Nghiêm trọng" value={formatNumber(summary?.critical_high_alerts)} color="#fa8c16" />
            <CommandSignalPill label="Tự động hóa" value={formatPercent(summary?.automation_success_rate)} color={summary?.failed_playbooks ? '#ff4d4f' : '#52c41a'} />
            <CommandSignalPill label="Khung thời gian" value={windowLabels[selectedWindow]} color="#69b1ff" />
          </div>
        </section>

        {/* Posture Section: Risk Gauge + Key KPIs & Response Clocks */}
        <div className="dashboard-posture-grid">
          <RiskPostureCard data={data} loading={loading} />
          <div className="dashboard-posture-stack">
            <div className="dashboard-grid posture-kpis compact-3">
              <MetricCard
                title="Vụ việc nghiêm trọng đang mở"
                value={formatNumber(summary?.open_critical_cases)}
                accent="#ff4d4f"
                category="Rủi ro chính"
                tone="critical"
                priority
                sub={`${formatNumber(summary?.open_cases)} đang mở / ${formatNumber(summary?.total_cases)} tổng`}
              />
              <MetricCard
                title="Cảnh báo Cao / Nghiêm trọng"
                value={formatNumber(summary?.critical_high_alerts)}
                accent="#fa8c16"
                category="Rủi ro chính"
                tone="warning"
                priority
                sub={`${formatNumber(summary?.total_alerts)} cảnh báo ghi nhận`}
              />
              <MetricCard
                title="Tỷ lệ tự động hóa thành công"
                value={formatPercent(summary?.automation_success_rate)}
                accent={summary?.failed_playbooks ? '#ff4d4f' : '#52c41a'}
                category="Năng lực phản ứng"
                tone={automationTone(summary)}
                sub={`${formatNumber(summary?.running_playbooks)} đang chạy · ${formatNumber(summary?.failed_playbooks)} thất bại`}
              />
            </div>
            <div className="dashboard-grid posture-mean-times">
              <MeanTimeCard
                title="MTTD"
                metric={data?.mean_times.mttd || { seconds: null, sample_count: 0 }}
                tooltip="MTTD (Thời gian phát hiện trung bình): từ lúc phát hiện cảnh báo đầu tiên đến khi tạo vụ việc."
                accent="#69b1ff"
              />
              <MeanTimeCard
                title="MTTA"
                metric={data?.mean_times.mtta || { seconds: null, sample_count: 0 }}
                tooltip="MTTA (Thời gian xác nhận trung bình): từ khi tạo vụ việc đến khi xác nhận tiếp nhận."
                accent="#b37feb"
              />
              <MeanTimeCard
                title="MTTR"
                metric={data?.mean_times.mttr || { seconds: null, sample_count: 0 }}
                tooltip="MTTR (Thời gian xử lý trung bình): từ lúc xác nhận tiếp nhận đến khi đóng vụ việc."
                accent="#52c41a"
              />
            </div>
          </div>
        </div>

        {/* Incident Operations: Telemetry Trend + Real-Time Incident Stream */}
        <div className="dashboard-grid operations-main">
          <ChartPanel title={<><ChartSpline {...lucideIconProps} /> Xu hướng cảnh báo</>} className="dashboard-trend-card">
            {loading && !data ? <Skeleton active paragraph={{ rows: 6 }} /> : <AlertTrend data={data?.alert_trend || []} />}
          </ChartPanel>
          <CyberCard
            title={<><TriangleAlert {...lucideIconProps} /> Luồng sự kiện mức độ cao</>}
            className="dashboard-stream-card"
            extra={<span className="dashboard-card-badge">{data?.recent_highlights?.length ?? 0} sự kiện</span>}
          >
            {loading && !data ? <Skeleton active paragraph={{ rows: 6 }} /> : <HighlightStream highlights={data?.recent_highlights || []} />}
          </CyberCard>
        </div>

        {/* Entity Risk & Triage Context */}
        <div className="dashboard-grid landscape-triage">
          <CyberCard title={<><ScanSearch {...lucideIconProps} /> Trọng tâm rủi ro thực thể</>}>
            {loading && !data ? <Skeleton active paragraph={{ rows: 6 }} /> : <RiskArtifacts artifacts={data?.top_risk_artifacts || []} />}
          </CyberCard>
          <ChartPanel title={<><GaugeIcon {...lucideIconProps} /> Áp lực theo mức độ</>} compact>
            {loading && !data ? <Skeleton active paragraph={{ rows: 6 }} /> : <SeverityPressure data={data?.severity_distribution || []} />}
          </ChartPanel>
          <ChartPanel title={<><Kanban {...lucideIconProps} /> Trạng thái khối lượng vụ việc</>} compact>
            {loading && !data ? <Skeleton active paragraph={{ rows: 6 }} /> : <CaseWorkloadState data={data?.case_status_mix || []} />}
          </ChartPanel>
        </div>

        {/* Deep Dive Telemetry & Intelligence (Organized into Clean Tabs) */}
        <CyberCard
          title={<><Activity {...lucideIconProps} /> Phân tích chuyên sâu & Tình báo</>}
          className="dashboard-deepdive-card"
        >
          <Tabs
            defaultActiveKey="mitre-matrix"
            className="dashboard-tabs"
            items={[
              {
                key: 'mitre-matrix',
                label: (
                  <Space size={6}>
                    <Target size={14} />
                    <span>Bản đồ nhiệt mức độ MITRE</span>
                  </Space>
                ),
                children: loading && !data ? <Skeleton active paragraph={{ rows: 6 }} /> : <MitreSeverityMatrix data={data?.mitre_severity_heatmap || []} />,
              },
              {
                key: 'threat-keywords',
                label: (
                  <Space size={6}>
                    <TextSearch size={14} />
                    <span>Từ khóa mối đe dọa</span>
                  </Space>
                ),
                children: loading && !data ? <Skeleton active paragraph={{ rows: 6 }} /> : <ThreatKeywordCloud data={data?.threat_keywords || []} />,
              },
              {
                key: 'mitre-radar',
                label: (
                  <Space size={6}>
                    <RadarIcon size={14} />
                    <span>Radar chiến thuật MITRE</span>
                  </Space>
                ),
                children: loading && !data ? <Skeleton active paragraph={{ rows: 6 }} /> : <SecurityDomainRadar data={data?.mitre_tactics || []} />,
              },
              {
                key: 'products',
                label: (
                  <Space size={6}>
                    <PackageSearch size={14} />
                    <span>Tín hiệu theo sản phẩm</span>
                  </Space>
                ),
                children: loading && !data ? <Skeleton active paragraph={{ rows: 6 }} /> : <ProductCategorySignals data={data?.product_category_distribution || []} />,
              },
              {
                key: 'coverage-automation',
                label: (
                  <Space size={6}>
                    <BookOpen size={14} />
                    <span>Độ phủ & Tự động hóa</span>
                  </Space>
                ),
                children: loading && !data ? (
                  <Skeleton active paragraph={{ rows: 6 }} />
                ) : data ? (
                  <div className="dashboard-deepdive-grid">
                    <div>
                      <h4 className="dashboard-subheading"><Workflow size={14} /> Thực thi tự động hóa</h4>
                      <AutomationPanel data={data.automation || []} />
                    </div>
                    <div>
                      <h4 className="dashboard-subheading"><BookOpen size={14} /> Độ phủ tình báo & bề mặt</h4>
                      <CoveragePanel data={data} />
                    </div>
                  </div>
                ) : (
                  <CyberEmpty title="Chưa có dữ liệu" />
                ),
              },
            ]}
          />
        </CyberCard>
      </div>
    </div>
  )
}
