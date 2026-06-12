import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { LogConsole, type LogLine } from './LogConsole'

describe('LogConsole', () => {
  it('渲染各类型日志行', () => {
    const lines: LogLine[] = [
      { kind: 'log', text: '开始' },
      { kind: 'success', text: '完成 V' },
      { kind: 'error', text: '出错了' },
    ]
    render(<LogConsole lines={lines} />)
    expect(screen.getByText('开始')).toBeTruthy()
    expect(screen.getByText('完成 V')).toBeTruthy()
    expect(screen.getByText('出错了')).toBeTruthy()
  })

  it('为空时显示占位提示', () => {
    render(<LogConsole lines={[]} />)
    expect(screen.getByText(/暂无日志/)).toBeTruthy()
  })
})
