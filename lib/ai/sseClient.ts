// Minimal Server-Sent Events client over fetch + ReadableStream.
//
// We use POST for /generate so we can't use the built-in EventSource (which is
// GET-only). This parser handles `event:` + `data:` lines, dispatching to a
// listener for each completed event.

export interface SseListener {
  onEvent: (event: string, data: unknown) => void
  onError?: (err: Error) => void
}

export async function consumeSse(
  url: string,
  init: RequestInit,
  listener: SseListener,
): Promise<void> {
  const response = await fetch(url, {
    ...init,
    headers: { Accept: 'text/event-stream', ...(init.headers ?? {}) },
  })
  if (!response.ok || !response.body) {
    const message = response.body
      ? await response.text().catch(() => `HTTP ${response.status}`)
      : `HTTP ${response.status}`
    throw new Error(message)
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  try {
    for (;;) {
      const { value, done } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })

      // Events are separated by a blank line ("\n\n"). Process one at a time.
      let separator: number
      while ((separator = buffer.indexOf('\n\n')) >= 0) {
        const raw = buffer.slice(0, separator)
        buffer = buffer.slice(separator + 2)
        dispatch(raw, listener)
      }
    }
    if (buffer.trim().length > 0) dispatch(buffer, listener)
  } catch (err) {
    listener.onError?.(err instanceof Error ? err : new Error(String(err)))
  }
}

function dispatch(raw: string, listener: SseListener) {
  let event = 'message'
  const dataLines: string[] = []
  for (const line of raw.split('\n')) {
    if (line.startsWith(':')) continue       // comment / heartbeat
    if (line.startsWith('event:')) event = line.slice(6).trim()
    else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim())
  }
  if (dataLines.length === 0) return

  const dataStr = dataLines.join('\n')
  let data: unknown = dataStr
  try {
    data = JSON.parse(dataStr)
  } catch {
    // Leave as raw string if not JSON.
  }
  listener.onEvent(event, data)
}
