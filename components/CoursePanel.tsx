'use client'

import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { LogConsole, type LogLine } from './LogConsole'

interface MissingItem {
  directory: string
  name: string
  resourceID: string
  sysUuid: string
  timeLength: string
  stat: unknown
  /** 重试状态：未重试 / 重试中 / 已重试成功 / 重试失败 */
  retry?: 'pending' | 'done' | 'failed'
}

export function CoursePanel({
  nickname,
  onLogout,
}: {
  nickname: string
  onLogout: () => void
}) {
  const [lines, setLines] = useState<LogLine[]>([])
  const [running, setRunning] = useState(false)
  const [missing, setMissing] = useState<MissingItem[]>([])
  const esRef = useRef<EventSource | null>(null)

  function append(line: LogLine) {
    setLines((prev) => [...prev, line])
  }

  async function showDirectory() {
    setLines([])
    const res = await fetch('/api/course/directory')
    const data = await res.json()
    if (!res.ok || !data.data) {
      append({ kind: 'error', text: '获取课程目录失败' })
      return
    }
    for (const section of data.data) {
      append({ kind: 'log', text: `【${section.name}】` })
      for (const sub of section.subDirectory ?? []) {
        append({ kind: 'log', text: `  - ${sub.name}` })
      }
    }
  }

  async function showProgress() {
    setLines([])
    const res = await fetch('/api/course/progress')
    const data = await res.json()
    if (!res.ok || !data.data) {
      append({ kind: 'error', text: '获取课程进度失败' })
      return
    }
    const d = data.data
    append({ kind: 'log', text: `课程名称: ${d.courseName}` })
    append({ kind: 'log', text: `学习进度: ${(d.progressRate * 100).toFixed(1)}%` })
    append({ kind: 'log', text: `已学课程数: ${d.studyResourceNum}/${d.resourceSum}` })
    append({ kind: 'log', text: `总学习时长: ${d.totalStudyTime}秒` })
    append({ kind: 'log', text: `是否完成: ${d.isFinish ? '是' : '否'}` })
    append({ kind: 'log', text: `是否获得证书: ${d.isCertificate ? '是' : '否'}` })
  }

  function runSse(path: string, startMsg: string) {
    if (running) return
    setLines([])
    setRunning(true)
    append({ kind: 'log', text: startMsg })
    const es = new EventSource(path)
    esRef.current = es
    es.onmessage = (ev) => {
      const event = JSON.parse(ev.data)
      switch (event.type) {
        case 'log':
          append({ kind: 'log', text: event.message })
          break
        case 'progress':
          append({
            kind: event.ok ? 'success' : 'error',
            text: `${event.ok ? '✓ 完成' : '✗ 失败'}: ${event.name}`,
          })
          break
        case 'result':
          append({ kind: 'success', text: `成绩: ${event.data.score ?? '未知'} 分` })
          break
        case 'error':
          append({ kind: 'error', text: event.message })
          break
        case 'done':
          append({ kind: 'success', text: '— 完成 —' })
          es.close()
          setRunning(false)
          break
      }
    }
    es.onerror = () => {
      append({ kind: 'error', text: '连接中断' })
      es.close()
      setRunning(false)
    }
  }

  function checkMissing() {
    if (running) return
    setLines([])
    setMissing([])
    setRunning(true)
    append({ kind: 'log', text: '开始检查缺漏（逐资源核对完成状态）...' })
    const es = new EventSource('/api/course/check')
    esRef.current = es
    es.onmessage = (ev) => {
      const event = JSON.parse(ev.data)
      switch (event.type) {
        case 'log':
          append({ kind: 'log', text: event.message })
          break
        case 'check':
          append({
            kind: event.finished ? 'success' : 'error',
            text: `${event.finished ? '✓ 已完成' : '✗ 未完成'}: ${event.directory} / ${event.name}`,
          })
          if (!event.finished) {
            setMissing((prev) => [
              ...prev,
              {
                directory: event.directory,
                name: event.name,
                resourceID: event.resourceID,
                sysUuid: event.sysUuid,
                timeLength: event.timeLength,
                stat: event.stat,
              },
            ])
          }
          break
        case 'error':
          append({ kind: 'error', text: event.message })
          break
        case 'done':
          append({ kind: 'success', text: '— 检查完成 —' })
          es.close()
          setRunning(false)
          break
      }
    }
    es.onerror = () => {
      append({ kind: 'error', text: '连接中断' })
      es.close()
      setRunning(false)
    }
  }

  async function retryOne(item: MissingItem, index: number) {
    setMissing((prev) =>
      prev.map((m, i) => (i === index ? { ...m, retry: 'pending' } : m)),
    )
    try {
      const res = await fetch('/api/study/one', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          resourceID: item.resourceID,
          SYS_UUID: item.sysUuid,
          name: item.name,
          timeLength: item.timeLength,
        }),
      })
      const data = await res.json().catch(() => ({}))
      const ok = res.ok && data.ok
      setMissing((prev) =>
        prev.map((m, i) =>
          i === index ? { ...m, retry: ok ? 'done' : 'failed' } : m,
        ),
      )
      if (ok) toast.success(`已重试：${item.name}`)
      else toast.error(`重试失败：${item.name}`)
    } catch {
      setMissing((prev) =>
        prev.map((m, i) => (i === index ? { ...m, retry: 'failed' } : m)),
      )
      toast.error(`重试失败：${item.name}`)
    }
  }

  async function logout() {
    esRef.current?.close()
    await fetch('/api/auth/logout', { method: 'POST' })
    toast.success('已退出登录')
    onLogout()
  }

  return (
    <Card className="mx-auto w-full max-w-2xl">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>欢迎，{nickname}</CardTitle>
        <Button variant="ghost" size="sm" onClick={logout}>
          退出登录
        </Button>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <Button variant="outline" onClick={showDirectory} disabled={running}>
            查看课程目录
          </Button>
          <Button variant="outline" onClick={showProgress} disabled={running}>
            查看学习进度
          </Button>
          <Button variant="outline" onClick={checkMissing} disabled={running}>
            检查缺漏
          </Button>
          <Button onClick={() => runSse('/api/study', '开始自动刷课...')} disabled={running}>
            开始自动刷课
          </Button>
          <Button onClick={() => runSse('/api/exam', '开始自动完成考试...')} disabled={running}>
            自动完成考试
          </Button>
        </div>
        <LogConsole lines={lines} />
        {missing.length > 0 && (
          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium text-destructive">
              未完成资源（{missing.length} 项）
            </p>
            {missing.map((item, i) => (
              <div
                key={item.sysUuid}
                className="flex flex-col gap-2 rounded-md border p-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{item.name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {item.directory} · {item.timeLength}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant={item.retry === 'done' ? 'outline' : 'default'}
                    disabled={item.retry === 'pending' || item.retry === 'done'}
                    onClick={() => retryOne(item, i)}
                  >
                    {item.retry === 'pending'
                      ? '重试中...'
                      : item.retry === 'done'
                        ? '已重试 ✓'
                        : item.retry === 'failed'
                          ? '重试失败，再试'
                          : '重试'}
                  </Button>
                </div>
                {item.retry === 'done' && (
                  <p className="text-xs text-muted-foreground">
                    已重新提交，请再点「检查缺漏」复查是否计入完成。
                  </p>
                )}
                <details className="text-xs text-muted-foreground">
                  <summary className="cursor-pointer select-none">
                    原始统计数据
                  </summary>
                  <pre className="mt-1 overflow-x-auto whitespace-pre-wrap break-all">
                    {JSON.stringify(item.stat, null, 2)}
                  </pre>
                </details>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
