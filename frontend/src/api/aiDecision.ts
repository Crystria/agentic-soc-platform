import client from './client'

export type AiQualityCoverageState = 'Evaluated' | 'No prediction' | 'Invalid prediction'
export type AiQualityDirection = 'match' | 'overestimate' | 'underestimate' | ''
export type AiAssessmentFieldKey = 'verdict' | 'severity' | 'impact' | 'priority' | 'confidence'

export interface AiQualityFieldComparison {
  field: AiAssessmentFieldKey
  label: string
  ai_value: string
  human_value: string
  agrees: boolean | null
  distance: number | null
  direction: AiQualityDirection
}

export interface CaseAiQualityPayload {
  case_id: string
  coverage_state: AiQualityCoverageState
  is_preview: boolean
  closed_at: string | null
  evaluated_at: string | null
  fields: AiQualityFieldComparison[]
}

export interface ApplyAiAssessmentInput {
  fields?: AiAssessmentFieldKey[]
  apply_digest_to_summary?: boolean
  decision_note?: string
}

export interface ApplyAiAssessmentResponse {
  case: Record<string, unknown>
  applied_fields: string[]
}

export interface CaseAnalyzeResponse {
  id: string
  case_id: string
  status: string
  trigger: string
  scheduled_at: string
}

export interface AiQualityFieldAgreement {
  field: AiAssessmentFieldKey
  label: string
  agreed_count: number
  evaluable_count: number
  agreement_rate: number | null
}

export interface AiQualityOrdinalStat {
  field: Exclude<AiAssessmentFieldKey, 'verdict'>
  label: string
  sample_count: number
  mean_absolute_distance: number | null
  match_count: number
  overestimate_count: number
  underestimate_count: number
}

export interface AiQualitySummaryResponse {
  window: {
    start: string
    end: string
    span_days: number
    granularity: 'daily' | 'weekly' | 'monthly'
  }
  coverage: {
    total_closed: number
    evaluated: number
    no_prediction: number
    invalid_prediction: number
    coverage_rate: number | null
  }
  field_agreements: Record<AiAssessmentFieldKey, AiQualityFieldAgreement>
  verdict_matrix: {
    labels: string[]
    cells: Array<{
      human_verdict: string
      ai_verdict: string
      count: number
    }>
  }
  ordinal_stats: Record<Exclude<AiAssessmentFieldKey, 'verdict'>, AiQualityOrdinalStat>
  trends: Record<
    AiAssessmentFieldKey,
    Array<{
      bucket: string
      agreement_rate: number | null
      sample_count: number
    }>
  >
}

export interface AiQualityEvaluationItem {
  id: string
  case_id: string
  case_readable_id: string
  case_title: string
  closed_at: string
  evaluated_at: string
  category_snapshot: string
  assignee_id: number | null
  assignee_name: string
  human_severity: string
  coverage_state: AiQualityCoverageState
  fields: Record<
    AiAssessmentFieldKey,
    {
      ai_value: string
      human_value: string
      agrees: boolean | null
      distance: number | null
      direction: AiQualityDirection
    }
  >
}

export interface AiQualityFilterParams {
  days?: number
  category?: string
  human_severity?: string
  coverage_state?: string
  only_mismatches?: boolean
  mismatch_field?: string
  page?: number
  page_size?: number
}

export async function applyCaseAiAssessment(caseId: string, input: ApplyAiAssessmentInput) {
  const { data } = await client.post<ApplyAiAssessmentResponse>(
    `/cases/${encodeURIComponent(caseId)}/apply-ai-assessment/`,
    input,
  )
  return data
}

export async function triggerCaseAiAnalysis(caseId: string) {
  const { data } = await client.post<CaseAnalyzeResponse>(
    `/cases/${encodeURIComponent(caseId)}/analyze/`,
  )
  return data
}

export async function fetchCaseAiQuality(caseId: string) {
  const { data } = await client.get<CaseAiQualityPayload>(
    `/cases/${encodeURIComponent(caseId)}/ai-quality/`,
  )
  return data
}

export async function fetchAiQualitySummary(params: AiQualityFilterParams) {
  const { data } = await client.get<AiQualitySummaryResponse>('/ai-quality/summary/', { params })
  return data
}

export async function fetchAiQualityEvaluations(params: AiQualityFilterParams) {
  const { data } = await client.get<{
    count: number
    next: string | null
    previous: string | null
    results: AiQualityEvaluationItem[]
  }>('/ai-quality/evaluations/', { params })
  return data
}

export async function approvePlaybookRun(playbookId: string, note = '') {
  const { data } = await client.post<Record<string, unknown>>(
    `/playbooks/${encodeURIComponent(playbookId)}/approve/`,
    { note },
  )
  return data
}

export async function rejectPlaybookRun(playbookId: string, note = '') {
  const { data } = await client.post<Record<string, unknown>>(
    `/playbooks/${encodeURIComponent(playbookId)}/reject/`,
    { note },
  )
  return data
}
