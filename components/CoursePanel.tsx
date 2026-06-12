'use client'

import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { LogConsole, type LogLine } from './LogConsole'

export function CoursePanel({
  nickname,
  onLogout,
}: {
  nickname: string
  onLogout: () => void
}) {
  const [lines, setLines] = useState<LogLine[]>([])
  const [running, setRunning] = useState(false)
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
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Button variant="outline" onClick={showDirectory} disabled={running}>
            查看课程目录
          </Button>
          <Button variant="outline" onClick={showProgress} disabled={running}>
            查看学习进度
          </Button>
          <Button onClick={() => runSse('/api/study', '开始自动刷课...')} disabled={running}>
            开始自动刷课
          </Button>
          <Button onClick={() => runSse('/api/exam', '开始自动完成考试...')} disabled={running}>
            自动完成考试
          </Button>
        </div>
        <LogConsole lines={lines} />
      </CardContent>
    </Card>
  )
}
