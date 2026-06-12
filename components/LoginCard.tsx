'use client'

import { useEffect, useRef, useState } from 'react'
import QRCode from 'qrcode'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

export function LoginCard({ onSuccess }: { onSuccess: () => void }) {
  return (
    <Card className="mx-auto w-full max-w-md">
      <CardHeader>
        <CardTitle>保密观自动助手 · 登录</CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="qr">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="qr">扫码登录</TabsTrigger>
            <TabsTrigger value="password">账号密码</TabsTrigger>
          </TabsList>
          <TabsContent value="qr">
            <QrLogin onSuccess={onSuccess} />
          </TabsContent>
          <TabsContent value="password">
            <PasswordLogin onSuccess={onSuccess} />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  )
}

function QrLogin({ onSuccess }: { onSuccess: () => void }) {
  const [qrDataUrl, setQrDataUrl] = useState('')
  const [hint, setHint] = useState('正在获取二维码...')
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  async function loadQr() {
    setHint('正在获取二维码...')
    const res = await fetch('/api/auth/qr', { method: 'POST' })
    if (!res.ok) {
      setHint('获取二维码失败，请刷新重试')
      return
    }
    const { qrContent, qrToken } = await res.json()
    setQrDataUrl(await QRCode.toDataURL(qrContent))
    setHint('请使用保密观 APP 扫码登录')
    startPolling(qrToken)
  }

  function startPolling(qrToken: string) {
    if (pollRef.current) clearInterval(pollRef.current)
    pollRef.current = setInterval(async () => {
      const res = await fetch(`/api/auth/qr?qrToken=${encodeURIComponent(qrToken)}`)
      const { status } = await res.json()
      if (status === 1) {
        clearInterval(pollRef.current!)
        toast.success('扫码登录成功')
        onSuccess()
      } else if (status === -1) {
        clearInterval(pollRef.current!)
        setHint('二维码已失效，正在刷新...')
        loadQr()
      }
    }, 3000)
  }

  useEffect(() => {
    // 挂载时拉取二维码（其内部会 setState 更新提示），属正常的 fetch-on-mount 模式
    loadQr()
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="flex flex-col items-center gap-3 py-4">
      {qrDataUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={qrDataUrl} alt="登录二维码" className="h-48 w-48" />
      ) : (
        <div className="h-48 w-48 animate-pulse rounded bg-muted" />
      )}
      <p className="text-sm text-muted-foreground">{hint}</p>
      <Button variant="outline" size="sm" onClick={loadQr}>
        刷新二维码
      </Button>
    </div>
  )
}

function PasswordLogin({ onSuccess }: { onSuccess: () => void }) {
  const [loginName, setLoginName] = useState('')
  const [passWord, setPassWord] = useState('')
  const [loading, setLoading] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ loginName, passWord }),
      })
      const data = await res.json()
      if (res.ok) {
        toast.success('登录成功')
        onSuccess()
      } else {
        toast.error(data.message ?? '登录失败')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4 py-4">
      <div className="grid gap-2">
        <Label htmlFor="loginName">用户名</Label>
        <Input
          id="loginName"
          value={loginName}
          onChange={(e) => setLoginName(e.target.value)}
          required
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="passWord">密码</Label>
        <Input
          id="passWord"
          type="password"
          value={passWord}
          onChange={(e) => setPassWord(e.target.value)}
          required
        />
      </div>
      <Button type="submit" disabled={loading}>
        {loading ? '登录中...' : '登录'}
      </Button>
    </form>
  )
}
