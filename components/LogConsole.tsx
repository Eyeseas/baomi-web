'use client'

import { useEffect, useRef } from 'react'

export type LogLine = {
  kind: 'log' | 'success' | 'error'
  text: string
}

const COLOR: Record<LogLine['kind'], string> = {
  log: 'text-foreground',
  success: 'text-green-600',
  error: 'text-red-600',
}

export function LogConsole({ lines }: { lines: LogLine[] }) {
  const endRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    endRef.current?.scrollIntoView?.({ behavior: 'smooth' })
  }, [lines])

  return (
    <div className="h-72 overflow-y-auto rounded-md border bg-muted/30 p-3 font-mono text-sm">
      {lines.length === 0 ? (
        <p className="text-muted-foreground">暂无日志</p>
      ) : (
        lines.map((line, i) => (
          <div key={i} className={COLOR[line.kind]}>
            {line.text}
          </div>
        ))
      )}
      <div ref={endRef} />
    </div>
  )
}
