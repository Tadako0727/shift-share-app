import {useMemo,useState} from 'react';
import {Calculator,ChevronLeft,ChevronRight,Clock3,Save,TrainFront,X} from 'lucide-react';
import type {Member,Shift} from './lib';
import {shownName} from './lib';
import './payroll.css';

type Settings={hourly:number;latePremium:number;transport:number;fixedBreak:number;excludeClosedGap:boolean;rounding:1|15|30};
const defaults:Settings={hourly:1200,latePremium:25,transport:0,fixedBreak:0,excludeClosedGap:true,rounding:1};
const toMinutes=(time:string)=>{const [h,m]=time.slice(0,5).split(':').map(Number);return h*60+m};
const money=(value:number)=>new Intl.NumberFormat('ja-JP',{style:'currency',currency:'JPY',maximumFractionDigits:0}).format(Math.round(value));
const storageKey=(id:string)=>`shiftcal-payroll-test-${id}`;
const loadSettings=(id:string):Settings=>{try{return {...defaults,...JSON.parse(localStorage.getItem(storageKey(id))||'{}')}}catch{return defaults}};

function paidSegments(shift:Shift,excludeGap:boolean):[number,number][]{
  const start=toMinutes(shift.start_time),end=toMinutes(shift.end_time);
  if(!excludeGap)return [[start,end]];
  const windows:[[number,number],[number,number]]=[[11*60,15*60],[17*60,24*60]];
  return windows.map(([open,close])=>[Math.max(start,open),Math.min(end,close)] as [number,number]).filter(([from,to])=>to>from);
}

export default function PayrollSettings({member,shifts,onClose}:{member:Member;shifts:Shift[];onClose:()=>void}){
  const [settings,setSettings]=useState<Settings>(()=>loadSettings(member.id));
  const [breakInput,setBreakInput]=useState(()=>String(loadSettings(member.id).fixedBreak));
  const [transportInput,setTransportInput]=useState(()=>String(loadSettings(member.id).transport));
  const [month,setMonth]=useState(()=>new Date(new Date().getFullYear(),new Date().getMonth(),1));
  const [saved,setSaved]=useState(false);
  const prefix=`${month.getFullYear()}-${String(month.getMonth()+1).padStart(2,'0')}`;
  const result=useMemo(()=>{
    const rows=shifts.filter(s=>s.member_id===member.id&&s.shift_date.startsWith(prefix));
    let regular=0,late=0;
    for(const shift of rows){
      let segments=paidSegments(shift,settings.excludeClosedGap);
      const total=Math.max(0,segments.reduce((sum,[a,b])=>sum+b-a,0)-settings.fixedBreak);
      const rounded=Math.floor(total/settings.rounding)*settings.rounding;
      const lateRaw=segments.reduce((sum,[a,b])=>sum+Math.max(0,b-Math.max(a,22*60)),0);
      const lateRounded=Math.min(rounded,lateRaw);
      regular+=rounded-lateRounded;late+=lateRounded;
    }
    const base=(regular+late)/60*settings.hourly;
    const premium=late/60*settings.hourly*(settings.latePremium/100);
    const transport=rows.length*settings.transport;
    return {rows,regular,late,base,premium,transport,total:base+premium+transport};
  },[shifts,member.id,prefix,settings]);
  const change=<K extends keyof Settings>(key:K,value:Settings[K])=>{setSettings({...settings,[key]:value});setSaved(false)};
  const save=()=>{const fixedBreak=Math.max(0,Number(breakInput||0)),transport=Math.max(0,Number(transportInput||0));const next={...settings,fixedBreak,transport};setSettings(next);setBreakInput(String(fixedBreak));setTransportInput(String(transport));localStorage.setItem(storageKey(member.id),JSON.stringify(next));setSaved(true)};
  const y=month.getFullYear(),m=month.getMonth();
  return <div className="payroll-backdrop" onMouseDown={e=>e.target===e.currentTarget&&onClose()}><section className="payroll-panel">
    <header><div><small>PAYROLL ESTIMATE · TEST</small><h2><Calculator/>給料計算設定</h2><p>{shownName(member)}さんの端末内だけに保存します。</p></div><button onClick={onClose}><X/></button></header>
    <div className="payroll-month"><button onClick={()=>setMonth(new Date(y,m-1,1))}><ChevronLeft/></button><b>{y}年 {m+1}月</b><button onClick={()=>setMonth(new Date(y,m+1,1))}><ChevronRight/></button></div>
    <div className="payroll-total"><small>確定シフトからの概算</small><strong>{money(result.total)}</strong><span>{result.rows.length}回勤務・{((result.regular+result.late)/60).toFixed(1)}時間</span></div>
    <div className="payroll-breakdown"><div><Clock3/><span>基本給</span><b>{money(result.base)}</b></div><div><span className="night-icon">深夜</span><span>深夜加算</span><b>{money(result.premium)}</b></div><div><TrainFront/><span>交通費</span><b>{money(result.transport)}</b></div></div>
    <div className="payroll-form">
      <label>基本時給（円）<input type="number" min="0" step="10" value={settings.hourly} onChange={e=>change('hourly',Number(e.target.value))}/></label>
      <label>22時以降の加算率（%）<input type="number" min="0" step="1" value={settings.latePremium} onChange={e=>change('latePremium',Number(e.target.value))}/></label>
      <label>1勤務あたりの交通費（円）<input type="text" inputMode="numeric" pattern="[0-9]*" value={transportInput} onFocus={e=>e.currentTarget.select()} onChange={e=>{const value=e.target.value.replace(/\D/g,'').slice(0,6);setTransportInput(value);if(value!=='')change('transport',Number(value));else setSaved(false)}} onBlur={()=>{if(transportInput===''){setTransportInput('0');change('transport',0)}}}/></label>
      <label>1勤務あたりの追加休憩（分）<input type="text" inputMode="numeric" pattern="[0-9]*" value={breakInput} onFocus={e=>e.currentTarget.select()} onChange={e=>{const value=e.target.value.replace(/\D/g,'').slice(0,4);setBreakInput(value);if(value!=='')change('fixedBreak',Number(value));else setSaved(false)}} onBlur={()=>{if(breakInput===''){setBreakInput('0');change('fixedBreak',0)}}}/></label>
      <label>勤務時間の端数処理<select value={settings.rounding} onChange={e=>change('rounding',Number(e.target.value) as Settings['rounding'])}><option value={1}>端数処理なし</option><option value={15}>15分単位で切り捨て</option><option value={30}>30分単位で切り捨て</option></select></label>
      <label className="payroll-check"><input type="checkbox" checked={settings.excludeClosedGap} onChange={e=>change('excludeClosedGap',e.target.checked)}/><span><b>15:00〜17:00を勤務時間から除外</b><small>昼夜をまたぐシフトを、ランチとディナーに分けて計算します。</small></span></label>
    </div>
    <div className="payroll-caution">この金額はシフト予定から計算した概算です。残業、税金、社会保険、実際の休憩・打刻修正などは含みません。給与明細の代わりにはなりません。</div>
    <button className="payroll-save" onClick={save}><Save/>{saved?'保存しました':'この端末に設定を保存'}</button>
  </section></div>;
}
