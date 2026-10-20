import { useEffect, useMemo, useState } from 'react'
import { createGame, tryMove } from '../core/rules'
import type { Game } from '../core/rules'
import type { Position } from '../core/types'
import { formatMove } from '../core/notation'
import { openings } from '../content/openings'
import { glossary } from '../content/glossary'
import { Board, pieceName } from './Board'
import { OpeningTraining, type OpeningTrainingController } from './OpeningTraining'

export function OpeningLibrary({ onPractice, training, onOpenTraining, initialMode = 'demo' }: {
  onPractice: (game: Game) => void
  training?: OpeningTrainingController
  onOpenTraining?: () => void
  initialMode?: 'demo' | 'training'
}) {
  const [mode, setMode] = useState(initialMode)
  const [index, setIndex] = useState(0)
  const [step, setStep] = useState(0)
  const opening = openings[index]
  const playback = useMemo(() => {
    let game = createGame()
    const games = [game]
    const notation: string[] = []
    for (const item of opening.steps) {
      notation.push(formatMove(game.board, item.move))
      const result = tryMove(game, item.move)
      if (!result.ok) break
      game = result.game
      games.push(game)
    }
    return { games, notation }
  }, [opening])
  const shown = playback.games[Math.min(step, playback.games.length - 1)]
  const current = step > 0 ? opening.steps[step - 1] : null

  return <div className="opening-library">
    <div className="learning-actions opening-library-modes" role="group" aria-label="棋路馆模式">
      <button type="button" aria-pressed={mode === 'demo'} onClick={() => setMode('demo')}>看示范</button>
      {training || onOpenTraining ? <button type="button" aria-pressed={mode === 'training'} onClick={() => onOpenTraining ? onOpenTraining() : setMode('training')}>开局跟练</button> : null}
    </div>
    {mode === 'training' && training ? <OpeningTraining controller={training} /> : <div className="learning-layout">
    <section className="learning-main">
      <div className="learning-intro"><p className="eyebrow">开局棋路 · {index + 1} / {openings.length}</p><h2>{opening.title}</h2><p>{opening.summary}</p></div>
      <div className="lesson-prompt"><strong>{step === 0 ? '从第一着看起' : playback.notation[step - 1]}</strong><span>{current?.note ?? '每一步都可以回看。试着想一想：这枚棋子为什么先出动？'}</span></div>
      <Board board={shown.board} lastMove={current?.move} />
      <div className="learning-actions">
        <button type="button" disabled={step === 0} onClick={() => setStep(step - 1)}>上一着</button>
        <button type="button" disabled={step === opening.steps.length} onClick={() => setStep(step + 1)}>下一着</button>
        <button type="button" className="primary-action" onClick={() => onPractice(shown)}>从此局面练习</button>
      </div>
    </section>
    <aside className="learning-side panel">
      <p className="eyebrow">四条入门路线</p><h3>选择棋路</h3>
      <div className="lesson-list">
        {openings.map((item, optionIndex) => <button type="button" key={item.id} className={optionIndex === index ? 'active' : ''} onClick={() => { setIndex(optionIndex); setStep(0) }}><span>{item.title}</span><small>{item.steps.length} 着</small></button>)}
      </div>
      <div className="opening-steps"><h4>本路棋谱</h4>{opening.steps.map((_, moveIndex) => <button key={moveIndex} type="button" className={moveIndex + 1 === step ? 'active' : ''} onClick={() => setStep(moveIndex + 1)}><span>{moveIndex + 1}.</span><strong>{playback.notation[moveIndex]}</strong></button>)}</div>
      <p className="muted">棋路展示一种常见思路，不代表只有这一种好走法。</p>
    </aside>
  </div>}
  </div>
}

export function GlossaryLibrary({ initialId = glossary[0].id }: { initialId?: string }) {
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState(initialId)
  const [selectedPoint, setSelectedPoint] = useState<{ id: string; position: Position } | null>(null)
  useEffect(() => { setSelectedId(initialId); setQuery(''); setSelectedPoint(null) }, [initialId])
  const filtered = glossary.filter(entry => `${entry.term}${entry.definition}${entry.category}`.includes(query.trim()))
  const selected = filtered.find(entry => entry.id === selectedId) ?? filtered[0]

  return <div className="library-page">
    <div className="library-header"><p className="eyebrow">随手查，随手看</p><h2>术语词典</h2><p>把棋桌上常听到的词，换成能看懂的局面。</p></div>
    <div className="glossary-layout">
      <section className="panel glossary-list-panel">
        <label htmlFor="term-search">搜索术语</label>
        <input id="term-search" type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="例如：将军、马腿、屏风马" />
        <div className="glossary-list">{filtered.length ? filtered.map(entry => <button type="button" key={entry.id} className={selected?.id === entry.id ? 'active' : ''} onClick={() => setSelectedId(entry.id)}><span>{entry.term}</span><small>{entry.category}</small></button>) : <p className="muted">没有找到相关术语。试试更短的关键词。</p>}</div>
      </section>
      {selected ? <article className="panel glossary-detail"><p className="eyebrow">{selected.category}</p><h3>{selected.term}</h3><p>{selected.definition}</p><div className="mini-example"><Board board={selected.example.board} compact selected={selectedPoint?.id === selected.id ? selectedPoint.position : null} onCell={position => setSelectedPoint({ id: selected.id, position })} /><p>{selected.example.caption}</p>{selectedPoint?.id === selected.id ? <p role="status">所选位置 {selectedPoint.position.x},{selectedPoint.position.y}：{selected.example.board[selectedPoint.position.y][selectedPoint.position.x] ? pieceName(selected.example.board[selectedPoint.position.y][selectedPoint.position.x]!) : '空交叉点'}</p> : <p className="muted">点击棋盘上的棋子或交叉点，查看当前位置。</p>}</div></article> : null}
    </div>
  </div>
}

const ruleSections = [
  { title: '棋盘与先后手', body: '棋盘有九条竖线、十条横线，棋子放在交叉点。红方先行，双方轮流各走一着。帅将与仕士活动在九宫内；相象不能过河。', exampleId: 'intersection', mistake: '把棋子放进方格里，或以为黑方先行。' },
  { title: '七类棋子的走法', body: '车沿直线走且不能越子；马走日字，先走的一格若有子就是蹩马腿；相象斜走两格，象眼不能被堵；炮平常像车走，吃子时必须隔恰好一枚炮架；兵卒过河前只可前进，过河后也可横走，始终不后退。', exampleId: 'horse-leg', mistake: '只看马的落点，忘记检查马腿是否被挡住。' },
  { title: '将军、应将与终局', body: '一方威胁下一着吃对方将帅就是将军。被将军时必须应将；无合法应将是将死。轮到一方时未被将军却无合法着法是困毙，二者都判该方负。任何一步都不能让己方将帅受攻击，也不能形成将帅直接照面。', exampleId: 'check', mistake: '被将军时继续进攻，却没有先保护自己的将帅。' },
  { title: '和棋与自然限着', body: '本机双人可提和，须另一方接受。连续 60 回合双方都没有吃子，本游戏按自然限着判和。人机模式没有向电脑提和的按钮。', exampleId: 'draw', mistake: '把困毙当作和棋；困毙实际判无子可走的一方负。' },
  { title: '循环棋例的边界', body: '长将、长杀、长捉等重复局面需要按具体棋例裁决，不能简单套用三次重复自动和棋。本游戏会提示重复局面，但不会自动判定这些复杂循环，也不充当正式赛事裁判。', exampleId: 'perpetual-check', mistake: '看到同一局面三次出现就直接判和。' },
  { title: '棋谱怎么读', body: '例如“炮二平五”：红方二路的炮横向平到五路。“车九进一”表示九路车向前走一格。红方纵线用中文数字，黑方用阿拉伯数字。棋谱同时保留坐标，便于核对。', exampleId: 'notation', mistake: '把“进一”统一理解为前进一格；车、炮与兵的用法要结合子种判断。' },
]

export function RulesLibrary() {
  const [index, setIndex] = useState(0)
  const rule = ruleSections[index]
  const example = glossary.find(entry => entry.id === rule.exampleId)!
  return <div className="library-page rules-page">
    <div className="rules-copy">
      <div className="library-header"><p className="eyebrow">随时可查</p><h2>规则手册</h2><p>从基本走法到终局，遇到疑问再回来翻一页。</p></div>
      <div className="rules-layout">
        <nav className="panel rules-index" aria-label="规则章节">{ruleSections.map((section, optionIndex) => <button key={section.title} type="button" className={index === optionIndex ? 'active' : ''} onClick={() => setIndex(optionIndex)}>{section.title}</button>)}</nav>
        <article className="panel rule-detail"><h3>{rule.title}</h3><p>{rule.body}</p><p><strong>常见错误：</strong>{rule.mistake}</p></article>
      </div>
    </div>
    <div className="rule-example"><Board board={example.example.board} compact /><p>{example.example.caption}</p></div>
    <p className="source-note">依据：中国象棋协会审定的 <a href="https://cnchess.net/rules/rules2020.html" target="_blank" rel="noreferrer">《象棋竞赛规则（2020版）》</a>。页面对竞赛棋例作入门简化，并明确标注未自动裁决的部分。</p>
  </div>
}
