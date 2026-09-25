import { consumeSSE, readError, toApiError } from "@/api/sse"
import type {
  CreateScanRequest,
  CreateScanResponse,
  ScanEvent,
  ScanListResponse,
  ScanRecord,
} from "@/api/types"
import { mockCreateScan, mockGetScan, mockListScans, mockStreamScan } from "@/mocks/mockServer"

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000"
export const USE_MOCK = import.meta.env.VITE_USE_MOCK === "true"

export function reportUrl(scanId: string): string {
  return `${API_BASE_URL}/scans/${scanId}/report`
}

export async function createScan(request: CreateScanRequest): Promise<CreateScanResponse> {
  if (USE_MOCK) return mockCreateScan(request)

  try {
    const response = await fetch(`${API_BASE_URL}/scans`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    })
    if (!response.ok) throw await readError(response)
    return (await response.json()) as CreateScanResponse
  } catch (error) {
    throw toApiError(error)
  }
}

export async function getScan(scanId: string): Promise<ScanRecord> {
  if (USE_MOCK) return mockGetScan(scanId)

  try {
    const response = await fetch(`${API_BASE_URL}/scans/${scanId}`)
    if (!response.ok) throw await readError(response)
    return (await response.json()) as ScanRecord
  } catch (error) {
    throw toApiError(error)
  }
}

export async function listScans(limit = 50, offset = 0): Promise<ScanListResponse> {
  if (USE_MOCK) return mockListScans(limit, offset)

  try {
    const response = await fetch(`${API_BASE_URL}/scans?limit=${limit}&offset=${offset}`)
    if (!response.ok) throw await readError(response)
    return (await response.json()) as ScanListResponse
  } catch (error) {
    throw toApiError(error)
  }
}

export async function streamScan(
  scanId: string,
  onEvent: (event: ScanEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  if (USE_MOCK) return mockStreamScan(scanId, onEvent, signal)
  return consumeSSE(`${API_BASE_URL}/scans/${scanId}/stream`, onEvent, signal)
}
