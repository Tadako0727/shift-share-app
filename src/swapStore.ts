import {supabase} from './lib';

export type SwapResponse='eager'|'yes'|'maybe'|'no';
export type SwapScope='lunch'|'dinner'|'both'|'custom';
export type Candidate={memberId:string;response?:SwapResponse;note:string;availableDate?:string;start?:string;end?:string;createdAt:string};
export type SwapRequest={id:string;shiftId:string;ownerId:string;scope?:SwapScope;swapStart?:string;swapEnd?:string;reason:string;memo:string;status:'open'|'confirmed';approvedMemberId?:string;candidates:Candidate[];createdAt:string};
export const SWAP_EVENT='shiftcal-swap-change';

type RequestRow={id:string;shift_id:string;owner_id:string;scope:SwapScope;swap_start:string|null;swap_end:string|null;reason:string;memo:string;status:'open'|'confirmed';approved_member_id:string|null;created_at:string};
type CandidateRow={request_id:string;member_id:string;response:SwapResponse;note:string;available_date:string|null;start_time:string|null;end_time:string|null;created_at:string};

export async function readSwapRequests(){
  const [{data:requests,error},{data:candidates,error:candidateError}]=await Promise.all([
    supabase.from('swap_requests').select('*').order('created_at',{ascending:false}),
    supabase.from('swap_candidates').select('*').order('created_at')
  ]);
  if(error||candidateError)throw error||candidateError;
  return ((requests||[]) as RequestRow[]).map(row=>({
    id:row.id,shiftId:row.shift_id,ownerId:row.owner_id,scope:row.scope,
    swapStart:row.swap_start?.slice(0,5),swapEnd:row.swap_end?.slice(0,5),reason:row.reason,memo:row.memo,
    status:row.status,approvedMemberId:row.approved_member_id||undefined,createdAt:row.created_at,
    candidates:((candidates||[]) as CandidateRow[]).filter(candidate=>candidate.request_id===row.id).map(candidate=>({
      memberId:candidate.member_id,response:candidate.response,note:candidate.note,
      availableDate:candidate.available_date||undefined,start:candidate.start_time?.slice(0,5),end:candidate.end_time?.slice(0,5),createdAt:candidate.created_at
    }))
  }));
}

export async function refreshSwapRequests(){
  const requests=await readSwapRequests();
  window.dispatchEvent(new CustomEvent(SWAP_EVENT,{detail:requests}));
  return requests;
}

export async function createSwapRequest(request:{shiftId:string;ownerId:string;scope:SwapScope;swapStart?:string;swapEnd?:string;reason:string;memo:string}){
  const {error}=await supabase.from('swap_requests').insert({shift_id:request.shiftId,owner_id:request.ownerId,scope:request.scope,swap_start:request.scope==='custom'?request.swapStart:null,swap_end:request.scope==='custom'?request.swapEnd:null,reason:request.reason,memo:request.memo});
  if(error)throw error;
  return refreshSwapRequests();
}

export async function updateSwapRequest(id:string,values:Partial<Pick<SwapRequest,'scope'|'swapStart'|'swapEnd'|'reason'|'memo'|'status'|'approvedMemberId'>>){
  const row:Record<string,unknown>={updated_at:new Date().toISOString()};
  if(values.scope!==undefined)row.scope=values.scope;
  if(values.swapStart!==undefined)row.swap_start=values.swapStart||null;
  if(values.swapEnd!==undefined)row.swap_end=values.swapEnd||null;
  if(values.reason!==undefined)row.reason=values.reason;
  if(values.memo!==undefined)row.memo=values.memo;
  if(values.status!==undefined)row.status=values.status;
  if(values.approvedMemberId!==undefined)row.approved_member_id=values.approvedMemberId||null;
  const {error}=await supabase.from('swap_requests').update(row).eq('id',id);
  if(error)throw error;
  return refreshSwapRequests();
}

export async function deleteSwapRequest(id:string){const {error}=await supabase.from('swap_requests').delete().eq('id',id);if(error)throw error;return refreshSwapRequests()}

export async function saveCandidate(requestId:string,memberId:string,candidate:Omit<Candidate,'memberId'|'createdAt'>){
  const {error}=await supabase.from('swap_candidates').upsert({request_id:requestId,member_id:memberId,response:candidate.response||'yes',note:candidate.note,available_date:candidate.availableDate||null,start_time:candidate.availableDate?candidate.start:null,end_time:candidate.availableDate?candidate.end:null,updated_at:new Date().toISOString()},{onConflict:'request_id,member_id'});
  if(error)throw error;
  return refreshSwapRequests();
}
