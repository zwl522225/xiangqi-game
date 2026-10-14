// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { App } from '../src/ui/App'

afterEach(() => cleanup())

describe('application shell', () => {
  it('opens on the game and learning workspace', () => {
    render(<App />)
    expect(screen.getByRole('heading', { name: '弈象' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '开始对弈' })).toBeTruthy()
  })
})
