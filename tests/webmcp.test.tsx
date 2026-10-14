// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { App } from '../src/ui/App'

type Registered = { name: string; inputSchema: object; annotations?: { readOnlyHint?: boolean }; execute: (input: unknown) => unknown | Promise<unknown> }
const tools = new Map<string, Registered>()
const signals: AbortSignal[] = []

beforeEach(() => {
  localStorage.clear()
  tools.clear()
  signals.length = 0
  Object.defineProperty(document, 'modelContext', {
    configurable: true,
    value: { registerTool(tool: Registered, options: { signal: AbortSignal }) { tools.set(tool.name, tool); signals.push(options.signal) } },
  })
})
afterEach(() => {
  cleanup()
  delete (document as Document & { modelContext?: unknown }).modelContext
})

describe('page game tools', () => {
  it('registers, reads, rejects invalid moves, and updates the visible game for a legal move', async () => {
    render(<App />)
    const read = tools.get('read_game_state')!
    const move = tools.get('play_move')!
    expect(read.annotations?.readOnlyHint).toBe(true)
    expect(move.annotations?.readOnlyHint).toBe(false)
    expect(move.inputSchema).toMatchObject({ type: 'object', required: ['from', 'to'] })
    expect(read.execute({})).toMatchObject({ turn: 'red', moveCount: 0 })

    const before = screen.getByText('红方行棋')
    expect(before).toBeTruthy()
    await act(async () => {
      expect(await move.execute({ from: { x: 0, y: 6 }, to: { x: 0, y: 4 } })).toMatchObject({ ok: false })
    })
    expect(read.execute({})).toMatchObject({ turn: 'red', moveCount: 0 })

    await act(async () => {
      expect(await move.execute({ from: { x: 0, y: 6 }, to: { x: 0, y: 5 } })).toMatchObject({ ok: true, notation: '兵九进一' })
    })
    expect(screen.getByText('黑方行棋')).toBeTruthy()
    expect(screen.getAllByText('兵九进一').length).toBeGreaterThan(0)
    expect(read.execute({})).toMatchObject({ turn: 'black', moveCount: 1 })
    expect(signals.every(signal => !signal.aborted)).toBe(true)
  })

  it('unregisters tools when the page closes', () => {
    const { unmount } = render(<App />)
    unmount()
    expect(signals.every(signal => signal.aborted)).toBe(true)
  })
})
