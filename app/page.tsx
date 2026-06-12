'use client'

import { useEffect, useState } from 'react'
import { LoginCard } from '@/components/LoginCard'
import { CoursePanel } from '@/components/CoursePanel'

export default function Home() {
  const [nickname, setNickname] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  async function refresh() {
    setLoading(true)
    try {
      const res = await fetch('/api/auth/check')
      if (res.ok) {
        const { nickname } = await res.json()
        setNickname(nickname)
      } else {
        setNickname(null)
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refresh()
  }, [])

  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-4">
      {loading ? (
        <p className="text-muted-foreground">加载中...</p>
      ) : nickname ? (
        <CoursePanel nickname={nickname} onLogout={() => setNickname(null)} />
      ) : (
        <LoginCard onSuccess={refresh} />
      )}
    </main>
  )
}
