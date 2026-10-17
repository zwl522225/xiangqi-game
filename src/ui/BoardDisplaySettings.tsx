import { useEffect, useId, useRef } from 'react'
import type { KeyboardEvent } from 'react'
import type { DisplayPreferences, Preferences } from '../core/preferences'

type Props = {
  preferences: Preferences
  onChange: (patch: Partial<DisplayPreferences>) => void
  persistenceStatus: 'pending' | 'saved' | 'failed'
  onClose: () => void
}

export function BoardDisplaySettings({ preferences, onChange, persistenceStatus, onClose }: Props) {
  const dialog = useRef<HTMLDivElement>(null)
  const titleId = useId()
  const coordinatesHelpId = useId()
  useEffect(() => {
    const previous = document.activeElement
    dialog.current?.querySelector<HTMLSelectElement>('select')?.focus()
    return () => { if (previous instanceof HTMLElement && previous.isConnected) previous.focus() }
  }, [])

  function handleKey(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') { event.preventDefault(); onClose(); return }
    if (event.key !== 'Tab') return
    const controls = dialog.current?.querySelectorAll<HTMLElement>('select:not(:disabled), input:not(:disabled), button:not(:disabled)')
    if (!controls?.length) return
    const first = controls[0], last = controls[controls.length - 1]
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
  }

  const status = persistenceStatus === 'pending' ? '正在保存…' : persistenceStatus === 'saved' ? '已保存' : '保存失败，页面仍保留当前选择，刷新后可能丢失。'
  return <div className="board-display-backdrop">
    <div className="panel board-display-settings" role="dialog" aria-modal="true" aria-labelledby={titleId} ref={dialog} onKeyDown={handleKey}>
      <h2 id={titleId}>棋盘显示</h2>
      <label className="board-display-theme">棋盘主题
        <select value={preferences.boardTheme} onChange={event => onChange({ boardTheme: event.target.value === 'clear' ? 'clear' : 'classic' })}>
          <option value="classic">传统木纹</option><option value="clear">清晰教学</option>
        </select>
      </label>
      <label className="board-display-toggle"><input type="checkbox" checked={preferences.showCoordinates} aria-describedby={coordinatesHelpId} onChange={event => onChange({ showCoordinates: event.target.checked })} />显示数字坐标</label>
      <p id={coordinatesHelpId}>数字坐标使用棋谱文件中的 (x,y)：横向 0 至 8、纵向 0 至 9，与中文记谱中的“一至九路”不同。</p>
      <label className="board-display-toggle"><input type="checkbox" checked={preferences.showCaptured} onChange={event => onChange({ showCaptured: event.target.checked })} />显示本局失子</label>
      <p className={`board-display-status${persistenceStatus === 'failed' ? ' board-display-status--failed' : ''}`} role="status">{status}</p>
      <div className="learning-actions"><button type="button" onClick={onClose}>关闭设置</button></div>
    </div>
  </div>
}
