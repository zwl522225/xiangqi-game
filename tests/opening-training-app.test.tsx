// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../src/ui/App'
import { defaultProgress, loadProgress, saveProgress } from '../src/core/storage'
import { createSession, play, setView } from '../src/core/session'
import { setNote } from '../src/core/review'
import { archiveSession } from '../src/core/archive-codec'
import { createStudy } from '../src/core/study'
import { saveStudy } from '../src/core/study-storage'
import { defaultPractice, showPracticeHint, startPractice } from '../src/core/practice'
import { defaultPreferences, loadPreferences, savePreferences } from '../src/core/preferences'
import { OPENING_TRAINING_KEY, loadOpeningTraining } from '../src/core/opening-training-storage'
import { legalMoves, type Game } from '../src/core/rules'
import type { Move } from '../src/core/types'
import { openings } from '../src/content/openings'

const click = (name: string) => fireEvent.click(screen.getByRole('button', { name, exact: true, hidden: true }))
const region = () => screen.getByRole('region', { name: '开局跟练' })
function cell(x: number, y: number) { return within(region()).getByLabelText(new RegExp(`^(?:[^，]+，坐标 |交叉点 )${x},${y}(?:，|$)`)) }
function move(value: Move) { fireEvent.click(cell(value.from.x, value.from.y)); fireEvent.click(cell(value.to.x, value.to.y)) }
function enter() { click('棋路馆'); click('开局跟练') }
const read = () => loadProgress(localStorage)
const round = () => loadOpeningTraining(localStorage).data.active
function seed() {
  const p = defaultProgress()
  const played = play(createSession(), {from:{x:0,y:6},to:{x:0,y:5}})
  if (!played.ok) throw new Error(played.error)
  p.session = setNote(played.session, 1, '正式复盘笔记')
  p.completedLessons=['welcome']; p.practicedUnits=['capture-target']; p.masteredUnits=['give-check']; p.assistedVariants=['hint']; p.solvedPuzzles=['puzzle']
  p.learningMatch={active:true,standardStart:true,coachEnabled:true,coachEverUsed:true,checkpointSeen:true,toolMoveUsed:false}
  p.practice=showPracticeHint(startPractice(defaultPractice(),{mode:'recommended'},p))
  const archive=archiveSession(p.session,'正式收藏'); if (!archive.ok) throw new Error(archive.error)
  p.collection={version:1,items:[{id:'formal',savedAt:1700000000000,archive:archive.value}]}
  saveProgress(localStorage,p)
  const study=createStudy(p.session,{kind:'match',title:'当前对局',orientation:'black'});if(!study.ok)throw new Error(study.error)
  expect(saveStudy(localStorage,study.value)).toBe(true)
  savePreferences(localStorage,{...defaultPreferences(),boardView:'black',boardTheme:'clear',showCoordinates:true})
  return {progress:read(), study:localStorage.getItem('xiangqi-study'),preferences:loadPreferences(localStorage)}
}
class HeldWorker {
  static instances: HeldWorker[]=[]
  request!: {id:number;game:Game}
  onmessage: ((event:{data:{id:number;move:Move}})=>void)|null=null
  terminate=vi.fn()
  constructor(){HeldWorker.instances.push(this)}
  postMessage(request:HeldWorker['request']){this.request=request}
  reply(){this.onmessage?.({data:{id:this.request.id,move:legalMoves(this.request.game.board,this.request.game.turn)[0]}})}
}
beforeEach(()=>{localStorage.clear();HeldWorker.instances=[];vi.stubGlobal('Worker',HeldWorker);vi.spyOn(window,'confirm').mockReturnValue(true)})
afterEach(()=>{cleanup();vi.restoreAllMocks();vi.unstubAllGlobals();localStorage.clear();delete(document as Document & {modelContext?:unknown}).modelContext})

describe('opening training application boundary',()=>{
  it('enters through the real match sidebar, trains in one board and keeps all other business data intact',()=>{
    const original=seed();render(<App/>);click('棋路馆')
    expect(screen.getByRole('heading',{name:'中炮起手'})).toBeTruthy()
    expect(screen.getByRole('region',{name:'对弈'})).toBeTruthy()
    click('开局跟练');click('开始跟练')
    expect(screen.queryByRole('region',{name:'对弈'})).toBeNull()
    expect(screen.getAllByLabelText('象棋棋盘')).toHaveLength(1)
    click('提示第 1 层');move({from:{x:0,y:6},to:{x:0,y:5}});click('示范本步');click('查看黑方应手')
    const own=localStorage.getItem(OPENING_TRAINING_KEY)
    expect(read()).toEqual(original.progress)
    expect(localStorage.getItem('xiangqi-study')).toBe(original.study)
    expect(loadPreferences(localStorage)).toEqual(original.preferences)
    expect(cell(0,0).style.left).toBe('5%')
    expect(region().querySelector('.board-frame--clear')).toBeTruthy()
    expect(region().querySelectorAll('.board-coordinate')).toHaveLength(38)
    click('新手课堂');click('棋路馆');click('开局跟练');click('继续上次练习')
    expect(localStorage.getItem(OPENING_TRAINING_KEY)).toBe(own)
    expect(region().textContent).toContain('你的第 2 步 / 共 4 步')
    click('开始对弈');expect(screen.getByRole('region',{name:'对弈'})).toBeTruthy()
    expect(read()).toEqual(original.progress)
  })

  it('restores a saved round on reload and requires continue instead of silently restarting',()=>{
    seed();const page=render(<App/>);enter();click('开始跟练');move(openings[0].steps[0].move)
    const saved=localStorage.getItem(OPENING_TRAINING_KEY);page.unmount()
    render(<App/>);expect(screen.getByRole('region',{name:'对弈'})).toBeTruthy();enter()
    expect(within(region()).queryByLabelText('象棋棋盘')).toBeNull();click('继续上次练习')
    expect(round()?.ply).toBe(1);expect(localStorage.getItem(OPENING_TRAINING_KEY)).toBe(saved)
    click('查看黑方应手');expect(round()?.ply).toBe(2)
  })

  it('retains unsaved memory across main navigation and can retry saving the exact round',()=>{
    seed();render(<App/>);enter();click('开始跟练');const saved=localStorage.getItem(OPENING_TRAINING_KEY)
    const native=Storage.prototype.setItem
    const writes=vi.spyOn(Storage.prototype,'setItem').mockImplementation(function(this:Storage,key,value){if(key===OPENING_TRAINING_KEY)throw new Error('quota');native.call(this,key,value)})
    click('提示第 1 层');move(openings[0].steps[0].move)
    expect(localStorage.getItem(OPENING_TRAINING_KEY)).toBe(saved)
    click('主题练习');enter();click('继续上次练习')
    expect(region().textContent).toContain('保存失败')
    expect(cell(4,7).getAttribute('aria-label')).toContain('红炮')
    writes.mockRestore();click('重试保存')
    expect(round()).toMatchObject({ply:1,hinted:true})
    expect(screen.getByRole('status',{name:'跟练保存状态'}).textContent).toContain('已保存')
  })

  it('keeps the selected demonstration position contract for from-here formal practice',()=>{
    const original=seed();render(<App/>);click('棋路馆');click('下一着');click('下一着')
    const confirm=vi.mocked(window.confirm);confirm.mockReturnValueOnce(false);click('从此局面练习')
    expect(read()).toEqual(original.progress)
    click('从此局面练习')
    expect(read().session.game.board[2][6]).toEqual({side:'black',type:'horse'})
    expect(read().session.records).toHaveLength(0)
    expect(read().completedLessons).toEqual(original.progress.completedLessons)
    expect(localStorage.getItem(OPENING_TRAINING_KEY)).toBeNull()
  })

  it('cancels a pending formal worker, ignores its stale reply and resumes it on return',()=>{
    const p=defaultProgress();p.session=createSession('ai','black');saveProgress(localStorage,p)
    render(<App/>);const old=HeldWorker.instances[0];enter()
    expect(old.terminate).toHaveBeenCalled();expect(HeldWorker.instances).toHaveLength(1)
    act(()=>old.reply());expect(read().session.records).toHaveLength(0)
    click('开始跟练');move(openings[0].steps[0].move);click('查看黑方应手')
    expect(HeldWorker.instances).toHaveLength(1);expect(read().session.records).toHaveLength(0)
    click('开始对弈');expect(HeldWorker.instances).toHaveLength(2)
    act(()=>HeldWorker.instances[1].reply());expect(read().session.records).toHaveLength(1)
    enter();click('继续上次练习');expect(round()?.ply).toBe(2)
  })

  it('keeps all formal game tools targeting the formal session and resumes training unchanged after a tool move',()=>{
    type Tool={name:string;execute:(input:unknown)=>unknown};const tools=new Map<string,Tool>()
    Object.defineProperty(document,'modelContext',{configurable:true,value:{registerTool(tool:Tool){tools.set(tool.name,tool)}}})
    const original=seed();saveProgress(localStorage,{...original.progress,session:setView(original.progress.session,1)})
    render(<App/>);enter();click('开始跟练');click('示范本步');const saved=localStorage.getItem(OPENING_TRAINING_KEY)
    expect(tools.size).toBe(2)
    expect(tools.get('read_game_state')!.execute({})).toMatchObject({moveCount:1,turn:'black'})
    act(()=>{expect(tools.get('play_move')!.execute({from:{x:0,y:3},to:{x:0,y:4}})).toMatchObject({ok:true})})
    expect(screen.getByRole('region',{name:'对弈'})).toBeTruthy();expect(read().session.records).toHaveLength(2)
    expect(read().milestones).toEqual(original.progress.milestones)
    expect(read().practice).toEqual(original.progress.practice)
    enter();click('继续上次练习');expect(localStorage.getItem(OPENING_TRAINING_KEY)).toBe(saved)
    expect(round()?.ply).toBe(1)
  })
})
