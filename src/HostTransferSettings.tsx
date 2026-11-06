import {useEffect,useState} from 'react';
import {ShieldCheck} from 'lucide-react';
import {Member,shownName,supabase} from './lib';
import './host-transfer.css';

export default function HostTransferSettings({me,members,onTransferred}:{
  me:Member;members:Member[];onTransferred:()=>Promise<void>;
}){
  const [candidateIds,setCandidateIds]=useState<string[]>([]);
  const [target,setTarget]=useState('');
  const [open,setOpen]=useState(false);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [ack,setAck]=useState(false);
  const [success,setSuccess]=useState('');
  const candidates=members.filter(m=>candidateIds.includes(m.id)&&m.id!==me.id);
  const selected=candidates.find(m=>m.id===target);

  useEffect(()=>{
    if(!open||!me.is_host)return;
    let active=true;
    void supabase.rpc('host_transfer_candidates').then(({data,error:rpcError})=>{
      if(!active)return;
      if(rpcError){setError('譲渡先の情報を確認できませんでした');return;}
      const ids=(data||[]) as string[];
      setCandidateIds(ids);setTarget(value=>ids.includes(value)?value:'');
      setError('');
    });
    return()=>{active=false};
  },[open,me.id,me.is_host]);

  const transfer=async()=>{
    if(!selected||!ack||busy)return;
    const label=shownName(selected);
    if(!window.confirm(`${label}さんに管理者権限を譲渡します。あなたは一般メンバーになり、管理者機能が使えなくなります。元に戻すには新しい管理者から譲渡してもらう必要があります。実行しますか？`))return;
    setBusy(true);setError('');
    const result=await supabase.rpc('host_transfer_ownership',{p_target_member_id:selected.id});
    if(result.error){setError(result.error.message);setBusy(false);return;}
    setSuccess(`${label}さんに管理者権限を譲渡しました。`);
    setOpen(false);setAck(false);setTarget('');
    try{await onTransferred()}catch{setError('譲渡は完了しました。画面を再読み込みして最新の権限を確認してください。')}
    setBusy(false);
  };

  if(!me.is_host)return success?<div role="status" className="host-transfer-notice">{success}</div>:null;
  return <div className="setting-card host-transfer">
    <label><ShieldCheck size={18}/>管理者権限の譲渡</label>
    <p>登録済みメンバー1人へ管理者権限を引き継ぎます。譲渡すると、あなたは一般メンバーになります。</p>
    {!open?<button type="button" onClick={()=>{setOpen(true);setError('');setSuccess('')}}>譲渡先を選ぶ</button>:<>
      <label htmlFor="host-transfer-target">新しい管理者</label>
      <select id="host-transfer-target" value={target} onChange={e=>{setTarget(e.target.value);setAck(false)}}>
        <option value="">メンバーを選択してください</option>
        {candidates.map(m=><option key={m.id} value={m.id}>{shownName(m)}（{m.name}）</option>)}
      </select>
      {candidates.length===0&&<p>登録済みの譲渡先がいません。対象者が初回登録を完了してから操作してください。</p>}
      <label className="host-transfer-confirm"><input type="checkbox" checked={ack} onChange={e=>setAck(e.target.checked)}/>
        <span>譲渡後は自分の管理者権限がなくなることを理解しました</span>
      </label>
      <div className="host-transfer-actions">
        <button type="button" onClick={()=>{setOpen(false);setError('')}} disabled={busy}>キャンセル</button>
        <button type="button" className="host-transfer-danger" onClick={()=>void transfer()} disabled={busy||!selected||!ack}>{busy?'処理中…':'管理者権限を譲渡する'}</button>
      </div>
    </>}
    {error&&<p className="host-transfer-error" role="alert">{error}</p>}
  </div>;
}
