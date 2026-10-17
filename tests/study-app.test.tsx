// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../src/ui/App'
import { useStudyDraft } from '../src/ui/useStudyDraft'
import { createSession, play, resign, setView } from '../src/core/session'
import { defaultProgress, loadProgress, saveProgress } from '../src/core/storage'
import { defaultPractice, showPracticeHint, startPractice } from '../src/core/practice'
import { defaultPreferences, loadPreferences } from '../src/core/preferences'
import { setNote } from '../src/core/review'
import { archiveSession } from '../src/core/archive-codec'
import type { Result } from '../src/core/archive-codec'
import { createStudy } from '../src/core/study'
import { loadStudy, saveStudy } from '../src/core/study-storage'
import * as studyStorage from '../src/core/study-storage'
import { legalMoves } from '../src/core/rules'
import type { Game } from '../src/core/rules'
import type { Move } from '../src/core/types'

const line = [[0,6,0,5],[0,3,0,4],[0,5,0,4],[2,3,2,4],[2,6,2,5],[2,4,2,5]].map(([x,y,tx,ty]) => ({from:{x,y},to:{x:tx,y:ty}}))
function unwrap<T>(result: Result<T>) { if (!result.ok) throw new Error(result.error); return result.value }
function history() {
  let session = createSession()
  for (const move of line) { const result = play(session, move); if (!result.ok) throw new Error(result.error); session = result.session }
  return setView(setNote(session, 3, '来源笔记'), 3)
}
const fork = () => unwrap(createStudy(history(), {kind:'match',title:'当前对局',orientation:'black'}))
function seed(ended = false) {
  const p = defaultProgress()
  p.session = ended ? resign(history(), 'red') : history()
  p.completedLessons = ['welcome']; p.solvedPuzzles = ['puzzle']; p.practicedUnits = ['capture-target']; p.masteredUnits = ['give-check']; p.assistedVariants = ['used-hint']
  p.learningMatch = {active:false,standardStart:true,coachEnabled:true,coachEverUsed:true,checkpointSeen:true,toolMoveUsed:true}
  p.practice = showPracticeHint(startPractice(defaultPractice(), {mode:'recommended'}, p))
  p.collection = {version:1,items:[{id:'source',savedAt:1700000000000,archive:unwrap(archiveSession(p.session, '来源收藏'))}]}
  saveProgress(localStorage,p)
  localStorage.setItem('xiangqi-preferences',JSON.stringify({version:1,preferences:{...defaultPreferences(),boardView:'black'}}))
  return loadProgress(localStorage)
}
const click = (name: string) => fireEvent.click(screen.getByRole('button',{name,exact:true}))
const seek = (index: number) => fireEvent.change(screen.getByLabelText('回看进度'),{target:{value:String(index)}})
const read = () => loadProgress(localStorage)
const draft = () => { const result = loadStudy(localStorage); if (!result.study) throw new Error(result.error || 'Missing draft'); return result.study }
function cell(x:number,y:number) { return screen.getByLabelText(new RegExp(`^(?:[^，]+，坐标 |交叉点 )${x},${y}(?:，|$)`)) }
function move(value:Move) { fireEvent.click(cell(value.from.x,value.from.y)); fireEvent.click(cell(value.to.x,value.to.y)) }
function withoutCollection(p:ReturnType<typeof read>) { const {collection,...rest}=p; return rest }
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
afterEach(()=>{cleanup();vi.restoreAllMocks();vi.unstubAllGlobals();vi.useRealTimers();localStorage.clear();delete (document as Document & {modelContext?:unknown}).modelContext})

describe('study draft lifecycle',()=>{
  it('loads once without rewriting valid or damaged data and persists only actual draft changes',()=>{
    saveStudy(localStorage,fork())
    const set=vi.spyOn(Storage.prototype,'setItem'), hook=renderHook(()=>useStudyDraft())
    expect(hook.result.current.study?.session.origin?.startMoves).toEqual(line.slice(0,3));expect(set).not.toHaveBeenCalled()
    hook.rerender();expect(set).not.toHaveBeenCalled()
    act(()=>hook.result.current.change({...hook.result.current.study!,orientation:'red'}))
    expect(hook.result.current.persistenceStatus).toBe('saved');expect(draft().orientation).toBe('red')
    hook.unmount();localStorage.setItem('xiangqi-study','{damaged');set.mockClear()
    const bad=renderHook(()=>useStudyDraft())
    expect(bad.result.current.study).toBeNull();expect(bad.result.current.notice).toMatch(/草稿/)
    expect(localStorage.getItem('xiangqi-study')).toBe('{damaged');expect(set).not.toHaveBeenCalled()
  })
  it('retains failed saves in memory, retries on the next change and preserves drafts when clearing fails',()=>{
    const hook=renderHook(()=>useStudyDraft()), initial=fork()
    act(()=>hook.result.current.replace(initial))
    const old=localStorage.getItem('xiangqi-study'), native=Storage.prototype.setItem
    let blocked=true
    vi.spyOn(Storage.prototype,'setItem').mockImplementation(function(this:Storage,k,v){if(k==='xiangqi-study'&&blocked)throw new Error('blocked');native.call(this,k,v)})
    const changed={...initial,orientation:'red' as const}
    act(()=>hook.result.current.change(changed))
    expect(hook.result.current.study).toBe(changed);expect(hook.result.current.persistenceStatus).toBe('failed');expect(localStorage.getItem('xiangqi-study')).toBe(old)
    blocked=false;act(()=>hook.result.current.change({...changed,orientation:'black'}));expect(hook.result.current.persistenceStatus).toBe('saved')
    const removal=vi.spyOn(Storage.prototype,'removeItem').mockImplementation(()=>{throw new Error('blocked')})
    act(()=>{expect(hook.result.current.clear()).toBe(false)})
    expect(hook.result.current.study).not.toBeNull();expect(hook.result.current.notice).toMatch(/失败/)
    removal.mockRestore();act(()=>{expect(hook.result.current.clear()).toBe(true)})
    expect(hook.result.current.study).toBeNull();expect(localStorage.getItem('xiangqi-study')).toBeNull()
  })
  it('handles a blocked storage getter without claiming save or clear success',()=>{
    const getter=vi.spyOn(window,'localStorage','get').mockImplementation(()=>{throw new Error('blocked getter')})
    const hook=renderHook(()=>useStudyDraft())
    expect(hook.result.current.study).toBeNull();expect(hook.result.current.notice).toMatch(/草稿/)
    act(()=>hook.result.current.replace(fork()));expect(hook.result.current.persistenceStatus).toBe('failed')
    act(()=>{expect(hook.result.current.clear()).toBe(false)});expect(hook.result.current.study).not.toBeNull();getter.mockRestore()
  })
})
describe('study application integration',()=>{
  it('clears whitespace-only study notes and keeps subsequent moves persistable',()=>{
    const original=seed();render(<App/>);click('从此处试走');move(line[3])
    const note=screen.getByLabelText('本着笔记') as HTMLTextAreaElement
    fireEvent.change(note,{target:{value:'需要清除的试走笔记'}});click('保存笔记')
    expect(draft().session.notes).toEqual({'1':'需要清除的试走笔记'})
    fireEvent.change(note,{target:{value:' \n\t '}});click('保存笔记')
    expect(note.value).toBe('');expect(draft().session.notes).toEqual({})
    move(line[4]);expect(draft().session.records).toHaveLength(2)
    expect(screen.getByText('试走草稿已保存到当前浏览器。')).toBeTruthy();expect(read()).toEqual(original)
  })
  it('keeps the application usable when the browser blocks the storage getter',()=>{
    const original=seed(), raw=localStorage.getItem('xiangqi-progress')
    const getter=vi.spyOn(window,'localStorage','get').mockImplementation(()=>{throw new Error('blocked getter')})
    render(<App/>);click('试走研究')
    expect(screen.getByText(/试走草稿无法读取/)).toBeTruthy()
    click('前往对弈');click('从此处试走');move(line[0])
    expect(screen.getByText(/试走草稿暂留在当前页面/)).toBeTruthy()
    click('清空试走');expect(screen.getByText(/清空试走失败/)).toBeTruthy();expect(screen.getByLabelText('象棋棋盘')).toBeTruthy()
    getter.mockRestore()
    expect(localStorage.getItem('xiangqi-progress')).toBe(raw);expect(read()).toEqual(original)
  })
  it('forks the selected match position and orientation; ordinary study actions never write any progress',()=>{
    const original=seed();render(<App/>);click('试走研究');expect(screen.getByText('无草稿')).toBeTruthy();click('前往对弈')
    const writes=vi.spyOn(Storage.prototype,'setItem');writes.mockClear();click('从此处试走')
    expect(draft().session.origin?.startMoves).toEqual(line.slice(0,3));expect(draft().session.game.turn).toBe('black')
    expect(draft().orientation).toBe('black');expect(draft().session.notes).toEqual({});expect(read()).toEqual(original)
    for(const m of line.slice(3))move(m)
    fireEvent.change(screen.getByLabelText('本着笔记'),{target:{value:'独立观察'}});click('保存笔记');click('翻转棋盘');seek(1);click('从这里改走');click('悔棋')
    click('返回来源');expect((screen.getByLabelText('回看进度') as HTMLInputElement).value).toBe('3')
    click('试走研究');click('清空试走');expect(read()).toEqual(original)
    expect(writes.mock.calls.filter(([k])=>k==='xiangqi-progress')).toHaveLength(0);expect(loadPreferences(localStorage).boardView).toBe('black')
  })
  it('restores zero and nonempty drafts through navigation after reload, defaulting to the match',()=>{
    const original=seed();let page=render(<App/>);click('从此处试走');page.unmount()
    page=render(<App/>);expect(screen.getByRole('region',{name:'对弈'})).toBeTruthy();click('试走研究');expect(draft().session.records).toHaveLength(0)
    move(line[3]);fireEvent.change(screen.getByLabelText('本着笔记'),{target:{value:'刷新恢复'}});click('保存笔记');seek(0);click('翻转棋盘')
    page.unmount();render(<App/>);click('试走研究')
    expect(draft().session.records).toHaveLength(1);expect(draft().session.viewIndex).toBe(0);expect(draft().session.notes).toEqual({'1':'刷新恢复'});expect(draft().orientation).toBe('red');expect(read()).toEqual(original)
  })
  it('preserves old drafts when replacement is cancelled and rejects ended targets before confirmation',()=>{
    seed(true);render(<App/>);click('从此处试走');const old=localStorage.getItem('xiangqi-study')
    click('返回来源');seek(2);vi.mocked(window.confirm).mockReturnValueOnce(false);click('从此处试走')
    expect(localStorage.getItem('xiangqi-study')).toBe(old);expect(screen.getByRole('region',{name:'对弈'})).toBeTruthy()
    seek(6);const calls=vi.mocked(window.confirm).mock.calls.length;click('从此处试走')
    expect(localStorage.getItem('xiangqi-study')).toBe(old);expect(vi.mocked(window.confirm).mock.calls.length).toBe(calls);expect(screen.getByText(/所选局面已结束/)).toBeTruthy()
  })
  it('forks selected collection and file positions even when the complete source ended',async()=>{
    const original=seed(true);render(<App/>);click('棋局收藏');click('查看');seek(2);click('从此处试走')
    expect(draft().source).toEqual({kind:'collection',title:'来源收藏',ply:2});expect(draft().orientation).toBe('red');expect(draft().session.origin?.startMoves).toEqual(line.slice(0,2));expect(read()).toEqual(original)
    click('返回来源');const file=new File([''],'source.json',{type:'application/json'})
    Object.defineProperty(file,'text',{value:()=>Promise.resolve(JSON.stringify(original.collection!.items[0].archive))})
    await act(async()=>{fireEvent.change(screen.getByLabelText('导入棋局文件'),{target:{files:[file]}})})
    seek(3);click('从此处试走');expect(draft().source.kind).toBe('file');expect(draft().session.origin?.startMoves).toEqual(line.slice(0,3));expect(read()).toEqual(original)
  })
  it('collects an independent copy changing only collection and exports with notes off by default',()=>{
    const original=seed();render(<App/>);click('从此处试走');move(line[3])
    fireEvent.change(screen.getByLabelText('本着笔记'),{target:{value:'只属于试走'}});click('保存笔记')
    fireEvent.change(screen.getByLabelText('试走收藏名称'),{target:{value:'我的变化'}});click('收藏试走')
    const collected=read();expect(withoutCollection(collected)).toEqual(withoutCollection(original));expect(collected.collection!.items).toHaveLength(2)
    const saved=collected.collection!.items[1].archive;expect(saved.startMoves).toEqual(line.slice(0,3));expect(saved.moves).toEqual([line[3]]);expect(saved.notes).toEqual({'1':'只属于试走'})
    click('导出试走');expect((screen.getByLabelText('包含复盘笔记') as HTMLInputElement).checked).toBe(false);click('取消导出');click('悔棋');expect(read()).toEqual(collected)
  })
  it('keeps the board and selected piece through display changes without resaving the draft',()=>{
    seed();render(<App/>);click('从此处试走');fireEvent.click(cell(2,3))
    const board=screen.getByLabelText('象棋棋盘'),selected=cell(2,3),saved=localStorage.getItem('xiangqi-study'), spy=vi.spyOn(studyStorage,'saveStudy')
    click('棋盘显示');fireEvent.change(screen.getByLabelText('棋盘主题'),{target:{value:'clear'}});fireEvent.click(screen.getByLabelText('显示数字坐标'));click('关闭设置')
    expect(screen.getByLabelText('象棋棋盘')).toBe(board);expect(cell(2,3)).toBe(selected);expect(selected.getAttribute('aria-pressed')).toBe('true');expect(board.querySelectorAll('.board-coordinate')).toHaveLength(38)
    expect(localStorage.getItem('xiangqi-study')).toBe(saved);expect(spy).not.toHaveBeenCalled()
  })
  it('cancels the original computer request, ignores late replies and resumes on return',()=>{
    const p=defaultProgress();p.session=createSession('ai','black');saveProgress(localStorage,p)
    render(<App/>);const old=HeldWorker.instances[0];click('从此处试走')
    expect(old.terminate).toHaveBeenCalled();expect(HeldWorker.instances).toHaveLength(1);act(()=>old.reply());expect(read().session.records).toHaveLength(0)
    move(line[0]);expect(draft().session.records).toHaveLength(1);expect(read().session.records).toHaveLength(0);expect(HeldWorker.instances).toHaveLength(1)
    click('返回来源');expect(HeldWorker.instances).toHaveLength(2);act(()=>HeldWorker.instances[1].reply());expect(read().session.records).toHaveLength(1);click('试走研究');expect(draft().session.records).toHaveLength(1)
  })
  it('keeps formal tools targeting the formal match and retains the study after a tool move',()=>{
    type Tool={name:string;execute:(input:unknown)=>unknown};const tools=new Map<string,Tool>()
    Object.defineProperty(document,'modelContext',{configurable:true,value:{registerTool(t:Tool){tools.set(t.name,t)}}})
    const original=seed();saveProgress(localStorage,{...original,session:setView(original.session,6)})
    render(<App/>);click('从此处试走');move({from:{x:4,y:6},to:{x:4,y:5}});const saved=localStorage.getItem('xiangqi-study')
    act(()=>{expect(tools.get('play_move')!.execute({from:{x:6,y:6},to:{x:6,y:5}})).toMatchObject({ok:true})})
    expect(screen.getByRole('region',{name:'对弈'})).toBeTruthy();expect(read().session.records).toHaveLength(7);expect(read().milestones).toEqual(original.milestones);click('试走研究');expect(localStorage.getItem('xiangqi-study')).toBe(saved)
  })
})
