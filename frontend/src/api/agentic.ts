import client from './client'

export type AgenticJobStatus = 'Pending' | 'Running' | 'Success' | 'Failed'

export interface AgenticJobListItem {
  id: string
  case_id: string
  case_readable_id: string
  case_title: string
  status: AgenticJobStatus
  trigger: string
  provider_name: string
  model_name: string
  prompt_version: string
  latency_ms: number | null
  input_tokens: number | null
  output_tokens: number | null
  total_tokens: number | null
  knowledge_keywords_count: number
  knowledge_records_count: number
  verdict_ai: string
  confidence_ai: string
  scheduled_at: string | null
  started_at: string | null
  completed_at: string | null
  created_at: string
  error: string
}

export interface AgenticJobDetail extends AgenticJobListItem {
  queue_message_id: string
  result_json: Record<string, unknown>
}

export interface AgenticOverviewResponse {
  queue: {
    counts: {
      pending: number
      running: number
      success: number
      failed: number
    }
    last_24h: {
      total: number
      success: number
      failed: number
      success_rate: number | null
      avg_latency_ms: number | null
      p95_latency_ms: number | null
      input_tokens: number
      output_tokens: number
      total_tokens: number
    }
  }
  llm: {
    total: number
    enabled: number
    tag_coverage: Record<'fast' | 'powerful' | 'tool_calling' | 'structured_output', number>
    providers: Array<{
      id: string
      name: string
      base_url: string
      model: string
      tags: string[]
      enabled: boolean
      priority: number
    }>
  }
  rag: {
    mode?: 'hybrid' | 'lexical' | 'vector' | 'none'
    total_knowledge: number
    manual_knowledge: number
    case_knowledge: number
    indexed_knowledge?: number
    embedding_configured?: boolean
    embedding_model?: string
    redis_vector_available?: boolean
    redis_vector_docs?: number
    redis_vector_dimensions?: number | null
    top_keywords: Array<{ keyword: string; count: number }>
  }
  runtime: {
    prompt_language: string
    playbooks: {
      items: Array<{
        name: string
        description: string
        tags: string[]
        risk_level: string
        source: string
      }>
      errors: Array<{ path: string; error: string }>
    }
    modules: {
      items: Array<{
        name: string
        description: string
        stream_name: string
        thread_num: number
        stream_health?: {
          available: boolean
          length: number
          warning: string
        }
      }>
      errors: Array<{ path: string; error: string }>
    }
  }
  workers: Array<{
    worker_type: string
    display_name: string
    state: string
    reason: string
    last_duration_ms: number | null
  }>
  workers_available: boolean
}

export interface AgenticPromptItem {
  prompt_id: string
  source: 'builtin' | 'custom'
  directory: string
  name: string
  language: string
  line_count: number
  content: string
}

export async function fetchAgenticOverview() {
  const { data } = await client.get<AgenticOverviewResponse>('/agentic/overview/')
  return data
}

export async function fetchAgenticJobs(params: {
  status?: string
  search?: string
  page?: number
  page_size?: number
}) {
  const { data } = await client.get<{
    count: number
    results: AgenticJobListItem[]
  }>('/agentic/jobs/', { params })
  return data
}

export async function fetchAgenticJobDetail(jobId: string) {
  const { data } = await client.get<AgenticJobDetail>(`/agentic/jobs/${encodeURIComponent(jobId)}/`)
  return data
}

export async function retryAgenticJob(jobId: string) {
  const { data } = await client.post<AgenticJobListItem>(`/agentic/jobs/${encodeURIComponent(jobId)}/retry/`)
  return data
}

export async function cancelAgenticJob(jobId: string) {
  const { data } = await client.post<AgenticJobListItem>(`/agentic/jobs/${encodeURIComponent(jobId)}/cancel/`)
  return data
}

export async function triggerAgenticCaseAnalysis(caseId: string) {
  const { data } = await client.post<AgenticJobListItem>('/agentic/jobs/trigger/', { case_id: caseId })
  return data
}

export async function fetchAgenticPrompts(language?: string) {
  const { data } = await client.get<{ results: AgenticPromptItem[] }>('/agentic/prompts/', {
    params: language ? { language } : undefined,
  })
  return data.results
}
