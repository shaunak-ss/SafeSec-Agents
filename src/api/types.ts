export type OwaspCategory = "LLM01" | "LLM02" | "LLM06" | "LLM07"
export type Severity = "critical" | "high" | "medium"
export type RiskScore = "low" | "medium" | "high" | "critical"
export type ScanStatus = "queued" | "running" | "complete" | "failed"
export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE"

export type CreateScanRequest = {
  target_name: string
  target_endpoint: string
  target_method: HttpMethod
  target_headers: Record<string, string>
  target_body_template: Record<string, unknown>
  target_response_path: string
}

export type CreateScanResponse = {
  scan_id: string
  status: "queued"
  total_attacks: number
}

export type ScanStartedEvent = {
  type: "scan_started"
  scan_id: string
  total_attacks: number
}

export type AttackResultEvent = {
  type: "attack_result"
  attack_id: string
  category: OwaspCategory
  technique: string
  broke_through: boolean
  inconclusive: boolean
  reason?: string | null
  severity: Severity
  confidence: number | null
  evidence: string
  progress: { completed: number; total: number }
}

export type AttackErrorEvent = {
  type: "attack_error"
  attack_id: string
  reason: string
  progress: { completed: number; total: number }
}

export type ScanCompleteEvent = {
  type: "scan_complete"
  scan_id: string
  broke_through_count: number
  inconclusive_count: number
  error_count: number
  risk_score: RiskScore
  duration_ms: number
}

export type ScanEvent =
  | ScanStartedEvent
  | AttackResultEvent
  | AttackErrorEvent
  | ScanCompleteEvent

export type ScanResult = {
  attack_id: string
  category: OwaspCategory
  technique: string
  broke_through: boolean
  inconclusive: boolean
  reason?: string | null
  severity: Severity
  confidence: number | null
  evidence: string
}

export type CategoryStat = {
  tested: number
  broke_through: number
  inconclusive: number
}

export type CategoryBreakdown = Record<OwaspCategory, CategoryStat>

export type ScanRecord = {
  scan_id: string
  target_name: string
  status: ScanStatus
  started_at: string | null
  completed_at: string | null
  total_attacks: number
  broke_through_count: number
  inconclusive_count: number
  risk_score: RiskScore
  category_breakdown: CategoryBreakdown
  results: ScanResult[]
}

export type ScanSummary = {
  scan_id: string
  target_name: string
  status: ScanStatus
  started_at: string | null
  completed_at: string | null
  total_attacks: number
  broke_through_count: number
  inconclusive_count: number
  error_count: number
  risk_score: RiskScore | null
  duration_ms: number | null
}

export type ScanListResponse = {
  scans: ScanSummary[]
  total: number
}

export function emptyBreakdown(): CategoryBreakdown {
  return {
    LLM01: { tested: 0, broke_through: 0, inconclusive: 0 },
    LLM02: { tested: 0, broke_through: 0, inconclusive: 0 },
    LLM06: { tested: 0, broke_through: 0, inconclusive: 0 },
    LLM07: { tested: 0, broke_through: 0, inconclusive: 0 },
  }
}

export function breakdownFromResults(results: ScanResult[]): CategoryBreakdown {
  const breakdown = emptyBreakdown()
  for (const result of results) {
    breakdown[result.category].tested += 1
    if (result.inconclusive) breakdown[result.category].inconclusive += 1
    else if (result.broke_through) breakdown[result.category].broke_through += 1
  }
  return breakdown
}

export function resultFromEvent(event: AttackResultEvent): ScanResult {
  return {
    attack_id: event.attack_id,
    category: event.category,
    technique: event.technique,
    broke_through: event.broke_through,
    inconclusive: event.inconclusive,
    reason: event.reason,
    severity: event.severity,
    confidence: event.confidence,
    evidence: event.evidence,
  }
}
