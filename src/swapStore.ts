export type SwapResponse='eager'|'yes'|'maybe'|'no';
export type Candidate={memberId:string;response?:SwapResponse;note:string;availableDate?:string;start?:string;end?:string;createdAt:string};
export type SwapRequest={id:string;shiftId:string;ownerId:string;reason:string;memo:string;status:'open'|'confirmed';approvedMemberId?:string;candidates:Candidate[];createdAt:string};
export const SWAP_STORE='shiftcal-swap-requests-test-v1';
export const SWAP_EVENT='shiftcal-swap-change';
export const readSwapRequests=():SwapRequest[]=>{try{return JSON.parse(localStorage.getItem(SWAP_STORE)||'[]') as SwapRequest[]}catch{return []}};
export const saveSwapRequests=(requests:SwapRequest[])=>{localStorage.setItem(SWAP_STORE,JSON.stringify(requests));window.dispatchEvent(new CustomEvent(SWAP_EVENT,{detail:requests}))};
