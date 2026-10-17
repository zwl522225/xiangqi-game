import { createContext, useContext } from 'react'
import type { ReactNode } from 'react'
import { defaultPreferences } from '../core/preferences'
import type { DisplayPreferences } from '../core/preferences'

const { boardTheme, showCoordinates, showCaptured } = defaultPreferences()
const BoardDisplayContext = createContext<DisplayPreferences>({ boardTheme, showCoordinates, showCaptured })

export function BoardDisplayProvider({ value, children }: { value: DisplayPreferences; children: ReactNode }) {
  return <BoardDisplayContext.Provider value={value}>{children}</BoardDisplayContext.Provider>
}

export function useBoardDisplay(): DisplayPreferences {
  return useContext(BoardDisplayContext)
}
