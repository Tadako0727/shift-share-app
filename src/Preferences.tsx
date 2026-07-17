import {useMemo,useState} from 'react';
import {CalendarDays,ChevronLeft,ChevronRight,Link2,Save,Trash2} from 'lucide-react';
import {localDate} from './lib';

type PreferenceStatus='want'|'available'|'avoid'|'unavailable';
type Period='lunch'|'dinner'|'both'|'custom';
type Preference={status:PreferenceStatus;period:Period;start:string;end:string;pairWith?:string};
type PreferenceMap=Record<string,Preference>;

const statusLabel:Record<PreferenceStatus,string>={want:'入りたい',available:'入ってもよい',avoid:'できれば避けたい',unavailable:'入れない'};
const periodLabel:Record<Period,string>={lunch:'ランチ',dinner:'ディナー',both:'ランチ＋ディナー',custom:'時間指定'};
const pad=(n:number)=>String(n).padStart(2,'0');
const dateKey=(d:Date)=>`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const dayLabel=(value:string)=>new Intl.DateTimeFormat('ja-JP',{month:'long',day:'numeric',weekday:'short'}).format(new Date(`${value}T12:00:00`));

function readPreferences(key:string):PreferenceMap{
  try{return JSON.parse(localStorage.getItem(key)||'{}') as PreferenceMap}catch{return {}}
}

export default function Preferences({memberId}:{memberId:string}){
  const storageKey=`shiftcal-preferences-test-${memberId}`;
  const [month,setMonth]=useState(()=>new Date(new Date().getFullYear(),new Date().getMonth()+1,1));
  const [items,setItems]=useState<PreferenceMap>(()=>readPreferences(storageKey));
  const [selected,setSelected]=useState<string|null>(null);
  const [pairFirst,setPairFirst]=useState<string|null>(null);
  const y=month.getFullYear(),m=month.getMonth();
  const start=useMemo(()=>new Date(y,m,1-new Date(y,m,1).getDay()),[y,m]);
  const days=useMemo(()=>Array.from({length:42},(_,i)=>{const d=new Date(start);d.setDate(start.getDate()+i);return d}),[start]);
  const plans=useMemo(()=>({
    [`${y}-${pad(m+1)}-04`]:'予定あり 13:00〜',
    [`${y}-${pad(m+1)}-12`]:'予定あり 18:00〜',
    [`${y}-${pad(m+1)}-21`]:'終日予定あり'
  }),[y,m]);
  const saveAll=(next:PreferenceMap)=>{setItems(next);localStorage.setItem(storageKey,JSON.stringify(next))};
  const openDay=(date:string)=>{
    if(pairFirst&&pairFirst!==date){
      if(!items[pairFirst]){setPairFirst(null);setSelected(date);return}
      const next={...items,[pairFirst]:{...items[pairFirst],pairWith:date},[date]:{...(items[date]||{status:'available',period:'both',start:'11:00',end:'23:30'}),pairWith:pairFirst}};
      saveAll(next);setPairFirst(null);setSelected(date);return;
    }
    setSelected(date);
  };
  const anonymousCount=(date:string)=>{const day=Number(date.slice(-2));const base=(day*7)%5;return base+(items[date]&&items[date].status!=='unavailable'?1:0)};

  return <section className="preference-page">
    <div className="test-banner"><b>希望シフト・テスト版</b><span>この入力は現在この端末だけに保存され、本番シフトには影響しません。</span></div>
    <div className="preference-summary">
      <div><small>提出対象</small><b>{y}年{m+1}月分</b></div>
      <div><small>入力済み</small><b>{Object.keys(items).filter(d=>d.startsWith(`${y}-${pad(m+1)}`)).length}日</b></div>
    </div>
    {pairFirst&&<div className="pair-notice"><Link2/>「{dayLabel(pairFirst)}」と、どちらか一方にしたい日を選んでください。<button onClick={()=>setPairFirst(null)}>解除</button></div>}
    <div className="preference-calendar">
      <div className="preference-month"><button onClick={()=>setMonth(new Date(y,m-1,1))}><ChevronLeft/></button><h2>{y}年 {m+1}月</h2><button onClick={()=>setMonth(new Date(y,m+1,1))}><ChevronRight/></button></div>
      <div className="preference-week">{'日月火水木金土'.split('').map(x=><span key={x}>{x}</span>)}</div>
      <div className="preference-days">{days.map(d=>{const key=dateKey(d),pref=items[key],plan=plans[key as keyof typeof plans],count=anonymousCount(key);return <button key={key} className={`${d.getMonth()!==m?'outside':''} ${key===localDate()?'today':''} ${pref?`has-pref ${pref.status}`:''}`} onClick={()=>openDay(key)}><b>{d.getDate()}</b>{plan&&<span className="private-plan">予定あり</span>}{pref&&<span className="pref-mark">{statusLabel[pref.status]}</span>}<small>希望 {count}人</small>{pref?.pairWith&&<em>A/B</em>}</button>})}</div>
    </div>
    <div className="privacy-note"><CalendarDays/><span><b>Googleカレンダー表示の試作品</b>「予定あり」は本人だけに見えるダミー予定です。ほかのメンバーには予定名を公開しない想定です。</span></div>
    {selected&&<PreferenceEditor date={selected} value={items[selected]} plan={plans[selected as keyof typeof plans]} onClose={()=>setSelected(null)} onPair={()=>{if(!items[selected])return;setPairFirst(selected);setSelected(null)}} onDelete={()=>{const next={...items};const paired=next[selected]?.pairWith;delete next[selected];if(paired&&next[paired])next[paired]={...next[paired],pairWith:undefined};saveAll(next);setSelected(null)}} onSave={value=>{saveAll({...items,[selected]:value});setSelected(null)}}/>}
  </section>;
}

function PreferenceEditor({date,value,plan,onClose,onPair,onDelete,onSave}:{date:string;value?:Preference;plan?:string;onClose:()=>void;onPair:()=>void;onDelete:()=>void;onSave:(value:Preference)=>void}){
  const [status,setStatus]=useState<PreferenceStatus>(value?.status||'available');
  const [period,setPeriod]=useState<Period>(value?.period||'both');
  const [start,setStart]=useState(value?.start||'11:00'),[end,setEnd]=useState(value?.end||'23:30');
  const save=()=>{const times:Record<Exclude<Period,'custom'>,[string,string]>={lunch:['11:00','15:00'],dinner:['17:00','23:30'],both:['11:00','23:30']};const range=period==='custom'?[start,end]:times[period];onSave({status,period,start:range[0],end:range[1],pairWith:value?.pairWith})};
  return <div className="preference-sheet-backdrop" onMouseDown={e=>e.target===e.currentTarget&&onClose()}><div className="preference-sheet"><div className="sheet-grip"/><h2>{dayLabel(date)}</h2>{plan&&<div className="personal-plan">あなたの予定：{plan}</div>}<label>希望度</label><div className="status-options">{(Object.keys(statusLabel) as PreferenceStatus[]).map(key=><button type="button" className={status===key?`selected ${key}`:''} onClick={()=>setStatus(key)} key={key}>{statusLabel[key]}</button>)}</div><label>時間帯</label><div className="period-options">{(Object.keys(periodLabel) as Period[]).map(key=><button type="button" className={period===key?'selected':''} onClick={()=>setPeriod(key)} key={key}>{periodLabel[key]}</button>)}</div>{period==='custom'&&<div className="custom-time"><input type="time" value={start} onChange={e=>setStart(e.target.value)}/><span>〜</span><input type="time" value={end} onChange={e=>setEnd(e.target.value)}/></div>}{value?.pairWith&&<p className="paired-label"><Link2/> {dayLabel(value.pairWith)}とのどちらか一方</p>}<button className="preference-save" onClick={save}><Save/>保存</button>{value&&<div className="preference-actions"><button onClick={onPair}><Link2/>別の日とどちらか一方</button><button className="remove" onClick={onDelete}><Trash2/>削除</button></div>}</div></div>;
}
