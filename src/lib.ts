import { createClient } from '@supabase/supabase-js';
const url=import.meta.env.VITE_SUPABASE_URL as string; const key=import.meta.env.VITE_SUPABASE_ANON_KEY as string;
export const configured=Boolean(url&&key);
export const supabase=createClient(url||'https://example.supabase.co',key||'missing',{auth:{persistSession:true,autoRefreshToken:true}});
export type Member={id:string;name:string;display_name:string|null;is_host:boolean};
export type Shift={id:string;member_id:string;shift_date:string;start_time:string;end_time:string;created_at?:string;updated_at?:string};
export type History={id:number;action:'insert'|'update'|'delete';actor_member_id:string|null;member_id:string|null;member_name:string|null;old_data:Shift|null;new_data:Shift|null;created_at:string};
export const shownName=(m?:Member)=>m?.display_name?.trim()||m?.name||'未登録';
export const min=(t:string)=>{const [h,m]=t.slice(0,5).split(':').map(Number);return h*60+m};
export const kind=(s:Shift):'lunch'|'dinner'|'both'=>min(s.end_time)<=17*60?'lunch':min(s.start_time)>=17*60?'dinner':'both';
export const includesKind=(s:Shift,k:'lunch'|'dinner')=>kind(s)===k||kind(s)==='both';
export const localDate=(d=new Date())=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
export function parseShiftBoard(text:string,year:number,memberId:string){const rows:Omit<Shift,'id'>[]=[];const re=/(\d{1,2})\s*\/\s*(\d{1,2})(?:\s*[（(][^）)]*[）)])?\s*(\d{1,2}:\d{2})\s*[-–—〜~]\s*(\d{1,2}:\d{2})/;for(const line of text.split(/\r?\n/)){const m=line.match(re);if(m)rows.push({member_id:memberId,shift_date:`${year}-${m[1].padStart(2,'0')}-${m[2].padStart(2,'0')}`,start_time:m[3],end_time:m[4]});}return rows;}
