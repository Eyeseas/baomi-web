import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { CoursePanel } from './CoursePanel'

describe('CoursePanel', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('渲染昵称与四个操作按钮', () => {
    render(<CoursePanel nickname="张三" onLogout={() => {}} />)
    expect(screen.getByText(/张三/)).toBeTruthy()
    expect(screen.getByRole('button', { name: '查看课程目录' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '查看学习进度' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '开始自动刷课' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '自动完成考试' })).toBeTruthy()
  })

  it('点击「查看学习进度」调用 /api/course/progress', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          courseName: '保密',
          progressRate: 0.5,
          studyResourceNum: 1,
          resourceSum: 2,
          totalStudyTime: 10,
          isFinish: false,
          isCertificate: false,
        },
      }),
    })
    vi.stubGlobal('fetch', fetchMock)
    render(<CoursePanel nickname="张三" onLogout={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: '查看学习进度' }))
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/api/course/progress')
    })
  })
})
