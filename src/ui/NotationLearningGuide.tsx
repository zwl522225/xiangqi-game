import { notationFileRows } from '../core/notation-learning'
import type { Side } from '../core/types'

type Props = {
  orientation: Side
  showFiles: boolean
  onFlip: () => void
  onToggleFiles: () => void
}

export function NotationLearningGuide({ orientation, showFiles, onFlip, onToggleFiles }: Props) {
  const rows = notationFileRows(orientation)
  return <section className="notation-guide" aria-label="棋谱识读辅助">
    <p className="notation-view">当前视角：{orientation === 'red' ? '红' : '黑'}方在下</p>
    <div className="notation-guide-actions">
      <button type="button" onClick={onFlip}>翻转本题视角</button>
      <button type="button" aria-expanded={showFiles} onClick={onToggleFiles}>{showFiles ? '隐藏' : '显示'}路数辅助</button>
    </div>
    {showFiles ? <>
      <p className="notation-file-explanation">双方各按自己的方向数路。下表按屏幕从左到右排列，路数与棋盘数字坐标不同。</p>
      <table className="notation-file-table" aria-label="双方路数（屏幕从左到右）"><tbody>
        <tr><th scope="row">红方路数</th>{rows.red.map(value => <td key={value}>{value}</td>)}</tr>
        <tr><th scope="row">黑方路数</th>{rows.black.map(value => <td key={value}>{value}</td>)}</tr>
      </tbody></table>
    </> : null}
  </section>
}
