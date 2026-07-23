import { createClient } from '@supabase/supabase-js';
const url=import.meta.env.VITE_SUPABASE_URL as string; const key=import.meta.env.VITE_SUPABASE_ANON_KEY as string;
export const configured=Boolean(url&&key);
export const supabase=createClient(url||'https://example.supabase.co',key||'missing',{auth:{persistSession:true,autoRefreshToken:true}});
export type Member={id:string;name:string;display_name:string|null;is_host:boolean};
export type Shift={id:string;member_id:string;shift_date:string;start_time:string;end_time:string;created_at?:string;updated_at?:string};
export type ClosedDay={closed_date:string;label:string;kind:'holiday'|'temporary'};
export type History={id:number;action:'insert'|'update'|'delete';actor_member_id:string|null;member_id:string|null;member_name:string|null;old_data:Shift|null;new_data:Shift|null;created_at:string};
export const shownName=(m?:Member)=>m?.display_name?.trim()||m?.name||'未登録';
export const min=(t:string)=>{const [h,m]=t.slice(0,5).split(':').map(Number);return h*60+m};
export const serviceRange=(s:Shift,k:'lunch'|'dinner')=>{const start=min(s.start_time),end=min(s.end_time),open=k==='lunch'?11*60:17*60,close=k==='lunch'?15*60:24*60;if(start>=close||end<=open)return null;const from=Math.max(start,open),to=Math.min(end,close),format=(value:number)=>`${String(Math.floor(value/60)).padStart(2,'0')}:${String(value%60).padStart(2,'0')}`;return {start:format(from),end:format(to)}};
export const includesKind=(s:Shift,k:'lunch'|'dinner')=>serviceRange(s,k)!==null;
export const localDate=(d=new Date())=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const cappedEndTime=(value:string)=>{const [hour,minute]=value.split(':').map(Number);return hour>=24?'24:00':`${String(hour).padStart(2,'0')}:${String(minute).padStart(2,'0')}`};
const splitServiceRow=(row:Omit<Shift,'id'>):Omit<Shift,'id'>[]=>min(row.start_time)<15*60&&min(row.end_time)>17*60
  ?[{...row,end_time:'15:00'},{...row,start_time:'17:00'}]
  :[row];
export function parseShiftBoard(text:string,year:number,memberId:string){
  const rows:Omit<Shift,'id'>[]=[];
  const datePart=/(\d{1,2})\s*\/\s*(\d{1,2})(?:\s*[（(][^）)]*[）)])?/;
  const timed=/(\d{1,2})\s*\/\s*(\d{1,2})(?:\s*[（(][^）)]*[）)])?\s*(\d{1,2}:\d{2})\s*[-–—〜~]\s*(\d{1,2}:\d{2})/;
  for(const line of text.split(/\r?\n/)){
    const timeMatch=line.match(timed);
    if(timeMatch){
      rows.push(...splitServiceRow({member_id:memberId,shift_date:`${year}-${timeMatch[1].padStart(2,'0')}-${timeMatch[2].padStart(2,'0')}`,start_time:timeMatch[3],end_time:cappedEndTime(timeMatch[4])}));
      continue;
    }
    const dateMatch=line.match(datePart);
    if(dateMatch&&/\u7d42\u65e5/.test(line)){
      rows.push(...splitServiceRow({member_id:memberId,shift_date:`${year}-${dateMatch[1].padStart(2,'0')}-${dateMatch[2].padStart(2,'0')}`,start_time:'11:00',end_time:'24:00'}));
    }
  }
  return rows;
}
