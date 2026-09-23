import type { ScanEvent } from "@/api/types"
import { extractDetail } from "@/lib/utils"

export class ApiError extends Error {
  status: number
  detail: string

  constructor(status: number, detail: string) {
    super(detail)
    this.name = "ApiError"
    this.status = status
    this.detail = detail
  }
}

const NETWORK_ERROR = "Unable to reach SafeSec Agents. Check that the API is running and try again."

export async function readError(response: Response): Promise<ApiError> {
  try {
    const body: unknown = await response.json()
    return new ApiError(response.status, extractDetail(body, "Request failed"))
  } catch {
    return new ApiError(response.status, "Request failed")
  }
}

export function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error
  if (error instanceof DOMException && error.name === "AbortError") {
    return new ApiError(0, "Scan stream was cancelled.")
  }
  return new ApiError(0, NETWORK_ERROR)
}

/**
 * Consume an SSE body of `data: <json>\n\n` frames.
 * Stops on the literal `data: [DONE]` terminator without JSON-parsing it.
 */
export async function consumeSSE(
  url: string,
  onEvent: (event: ScanEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  let response: Response
  try {
    response = await fetch(url, {
      method: "GET",
      headers: { Accept: "text/event-stream" },
      signal,
    })
  } catch (error) {
    throw toApiError(error)
  }

  if (!response.ok) {
    throw await readError(response)
  }

  if (!response.body) {
    throw new ApiError(0, "Scan stream did not return a readable body.")
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ""

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    buffer = buffer.replace(/\r\n/g, "\n")

    let separator = buffer.indexOf("\n\n")
    while (separator !== -1) {
      const frame = buffer.slice(0, separator)
      buffer = buffer.slice(separator + 2)
      const shouldStop = dispatchFrame(frame, onEvent)
      if (shouldStop) {
        await reader.cancel().catch(() => undefined)
        return
      }
      separator = buffer.indexOf("\n\n")
    }
  }

  if (buffer.trim()) {
    dispatchFrame(buffer, onEvent)
  }
}

function dispatchFrame(frame: string, onEvent: (event: ScanEvent) => void): boolean {
  const dataLines: string[] = []
  for (const line of frame.split("\n")) {
    if (line.startsWith("data:")) {
      dataLines.push(line.slice(5).trimStart())
    }
  }
  if (dataLines.length === 0) return false

  const payload = dataLines.join("\n")
  if (payload === "[DONE]") return true

  try {
    onEvent(JSON.parse(payload) as ScanEvent)
  } catch {
    // Ignore malformed keep-alive / partial frames; the next frame will recover.
  }
  return false
}
