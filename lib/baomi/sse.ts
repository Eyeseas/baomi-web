import type { ProgressEvent } from './course'

/** 把 ProgressEvent async generator 转成 SSE ReadableStream。 */
export function eventStream(
  gen: AsyncGenerator<ProgressEvent>,
  signal?: AbortSignal,
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  return new ReadableStream({
    async start(controller) {
      try {
        for await (const event of gen) {
          if (signal?.aborted) break
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(event)}\n\n`),
          )
        }
      } catch (e) {
        const err = { type: 'error', message: (e as Error).message }
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(err)}\n\n`))
      } finally {
        controller.close()
      }
    },
  })
}

export const SSE_HEADERS = {
  'Content-Type': 'text/event-stream',
  'Cache-Control': 'no-cache, no-transform',
  Connection: 'keep-alive',
}
