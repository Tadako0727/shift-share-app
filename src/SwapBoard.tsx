import {useMemo,useState} from 'react';
import {ArrowRightLeft,Check,Clock3,MessageSquareText,Plus,Trash2,UserCheck,X} from 'lucide-react';
import type {Member,Shift} from './lib';
import {localDate,shownName} from './lib';
import './swaps.css';

type Candidate={memberId:string;note:string;availableDate?:string;start?:string;end?:string;createdAt:string};
type SwapRequest={id:string;shiftId:string;ownerId:string;reason:string;memo:string;status:'open'|'confirmed';approvedMemberId?:string;candidates:Candidate[];createdAt:string};
const STORE='shiftcal-swap-requests-test-v1';
const read=():SwapRequest[]=>{try{return JSON.parse(localStorage.getItem(STORE)||'[]') as SwapRequest[]}catch{return []}};
const jaDate=(date:string)=>new Intl.DateTimeFormat('ja-JP',{month:'long',day:'numeric',weekday:'short'}).format(new Date(`${date}T12:00:00`));
const time=(value:string)=>value.slice(0,5);

export default function SwapBoard({member,members,shifts}:{member:Member;members:Member[];shifts:Shift[]}){
  const [requests,setRequests]=useState<SwapRequest[]>(read);
  const [creating,setCreating]=useState(false);
  const [candidateFor,setCandidateFor]=useState<string|null>(null);
  const save=(next:SwapRequest[])=>{setRequests(next);localStorage.setItem(STORE,JSON.stringify(next))};
  const shiftById=(id:string)=>shifts.find(s=>s.id===id);
  const upcoming=useMemo(()=>shifts.filter(s=>s.member_id===member.id&&s.shift_date>=localDate()).sort((a,b)=>a.shift_date.localeCompare(b.shift_date)||a.start_time.localeCompare(b.start_time)),[shifts,member.id]);
  const open=requests.filter(r=>r.status==='open'),confirmed=requests.filter(r=>r.status==='confirmed');
  const approve=(requestId:string,candidateId:string)=>save(requests.map(r=>r.id===requestId?{...r,status:'confirmed',approvedMemberId:candidateId}:r));
  const remove=(id:string)=>{if(confirm('この交代募集を削除しますか？'))save(requests.filter(r=>r.id!==id))};
  return <div className="swap-board">
    <div className="swap-test-note"><b>交代募集・テスト版</b><span>操作結果はこの端末内だけに保存され、確定シフトは変更しません。</span></div>
    <button className="create-swap" onClick={()=>setCreating(true)}><Plus/>自分のシフトから交代を募集</button>
    <div className="swap-heading"><div><small>OPEN REQUESTS</small><h2>交代募集中</h2></div><b>{open.length}件</b></div>
    <div className="swap-list">{open.length?open.map(request=>{const shift=shiftById(request.shiftId);if(!shift)return null;const owner=members.find(m=>m.id===request.ownerId);const canApprove=request.ownerId===member.id||member.is_host;const already=request.candidates.some(c=>c.memberId===member.id);return <article className="swap-card" key={request.id}><div className="swap-card-top"><span><ArrowRightLeft/></span><div><small>{jaDate(shift.shift_date)}</small><h3>{time(shift.start_time)}〜{time(shift.end_time)}</h3><p>現在：{shownName(owner)}</p></div><em>募集中</em></div>{request.reason&&<p className="swap-reason"><b>理由：</b>{request.reason}</p>}{request.memo&&<p className="swap-memo"><MessageSquareText/>{request.memo}</p>}<div className="candidate-title"><b>立候補 {request.candidates.length}人</b>{request.ownerId!==member.id&&!already&&<button onClick={()=>setCandidateFor(request.id)}>このシフトに入れます</button>}</div>{request.candidates.length>0&&<div className="candidate-list">{request.candidates.map(candidate=><div key={`${request.id}-${candidate.memberId}`}><span className="avatar">{shownName(members.find(m=>m.id===candidate.memberId)).slice(0,1)}</span><div><b>{shownName(members.find(m=>m.id===candidate.memberId))}</b>{candidate.availableDate?<small>{jaDate(candidate.availableDate)} {candidate.start}〜{candidate.end}なら可能</small>:<small>このシフトにそのまま入れます</small>}{candidate.note&&<p>{candidate.note}</p>}</div>{canApprove&&<button className="approve" onClick={()=>approve(request.id,candidate.memberId)}><Check/>承認</button>}</div>)}</div>}{request.ownerId===member.id&&request.candidates.length===0&&<div className="waiting">立候補を待っています</div>}{(request.ownerId===member.id||member.is_host)&&<button className="delete-swap" onClick={()=>remove(request.id)}><Trash2/>募集を削除</button>}</article>}):<div className="swap-empty"><UserCheck/><b>現在、交代募集はありません</b><span>募集が公開されるとここに表示されます。</span></div>}</div>
    {confirmed.length>0&&<><div className="swap-heading confirmed-heading"><div><small>CONFIRMED</small><h2>交代確定（テスト）</h2></div></div><div className="swap-list">{confirmed.map(request=>{const shift=shiftById(request.shiftId);if(!shift)return null;return <article className="swap-card confirmed" key={request.id}><Check/><div><b>{jaDate(shift.shift_date)} {time(shift.start_time)}〜{time(shift.end_time)}</b><p>{shownName(members.find(m=>m.id===request.ownerId))} → {shownName(members.find(m=>m.id===request.approvedMemberId))}</p></div>{(request.ownerId===member.id||member.is_host)&&<button onClick={()=>remove(request.id)}><X/></button>}</article>})}</div></>}
    {creating&&<CreateSwap shifts={upcoming} existing={requests} onClose={()=>setCreating(false)} onCreate={(shiftId,reason,memo)=>{save([{id:crypto.randomUUID(),shiftId,ownerId:member.id,reason,memo,status:'open',candidates:[],createdAt:new Date().toISOString()},...requests]);setCreating(false)}}/>}
    {candidateFor&&<CandidateSheet onClose={()=>setCandidateFor(null)} onSave={candidate=>{save(requests.map(r=>r.id===candidateFor?{...r,candidates:[...r.candidates.filter(c=>c.memberId!==member.id),{...candidate,memberId:member.id,createdAt:new Date().toISOString()}]}:r));setCandidateFor(null)}}/>}
  </div>;
}

function CreateSwap({shifts,existing,onClose,onCreate}:{shifts:Shift[];existing:SwapRequest[];onClose:()=>void;onCreate:(shiftId:string,reason:string,memo:string)=>void}){
  const available=shifts.filter(s=>!existing.some(r=>r.shiftId===s.id&&r.status==='open'));
  const [shiftId,setShiftId]=useState(available[0]?.id||''),[reason,setReason]=useState(''),[memo,setMemo]=useState('');
  return <div className="swap-backdrop" onMouseDown={e=>e.target===e.currentTarget&&onClose()}><form className="swap-sheet" onSubmit={e=>{e.preventDefault();if(shiftId)onCreate(shiftId,reason.trim(),memo.trim())}}><div className="sheet-grip"/><h2>交代をお願いする</h2>{available.length?<><label>自分のシフト<select value={shiftId} onChange={e=>setShiftId(e.target.value)}>{available.map(s=><option key={s.id} value={s.id}>{jaDate(s.shift_date)} {time(s.start_time)}〜{time(s.end_time)}</option>)}</select></label><label>募集理由（任意）<input value={reason} maxLength={40} onChange={e=>setReason(e.target.value)} placeholder="例：学校の予定が入ったため"/></label><label>メモ（任意）<textarea rows={3} value={memo} maxLength={160} onChange={e=>setMemo(e.target.value)} placeholder="引き継ぎや相談したいこと"/></label><button className="publish-swap" type="submit"><ArrowRightLeft/>交代募集を公開</button></>:<div className="swap-empty"><Clock3/><b>募集できる今後のシフトがありません</b></div>}<button className="sheet-cancel" type="button" onClick={onClose}>キャンセル</button></form></div>;
}

function CandidateSheet({onClose,onSave}:{onClose:()=>void;onSave:(candidate:Omit<Candidate,'memberId'|'createdAt'>)=>void}){
  const [alternative,setAlternative]=useState(false),[note,setNote]=useState(''),[availableDate,setDate]=useState(localDate()),[start,setStart]=useState('11:00'),[end,setEnd]=useState('15:00');
  return <div className="swap-backdrop" onMouseDown={e=>e.target===e.currentTarget&&onClose()}><form className="swap-sheet" onSubmit={e=>{e.preventDefault();onSave({note:note.trim(),...(alternative?{availableDate,start,end}:{})})}}><div className="sheet-grip"/><h2>このシフトに立候補</h2><label className="alternative-check"><input type="checkbox" checked={alternative} onChange={e=>setAlternative(e.target.checked)}/><span>指定されたシフトとは別の日時なら入れる</span></label>{alternative&&<div className="alternative-fields"><label>日付<input type="date" value={availableDate} onChange={e=>setDate(e.target.value)}/></label><label>開始<input type="time" value={start} onChange={e=>setStart(e.target.value)}/></label><label>終了<input type="time" value={end} onChange={e=>setEnd(e.target.value)}/></label></div>}<label>メモ（任意）<textarea rows={3} value={note} onChange={e=>setNote(e.target.value)} placeholder="例：19時からなら入れます"/></label><button className="publish-swap" type="submit"><UserCheck/>立候補する</button><button className="sheet-cancel" type="button" onClick={onClose}>キャンセル</button></form></div>;
}
