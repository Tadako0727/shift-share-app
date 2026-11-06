import {useState} from 'react';
import {Copy,KeyRound,RefreshCw} from 'lucide-react';
import {supabase} from './lib';
import './registration-code.css';

export default function RegistrationCodeSettings(){
  const [code,setCode]=useState('');
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState('');
  const [copied,setCopied]=useState(false);

  const rotate=async()=>{
    if(!window.confirm('店舗登録コードを再発行します。現在のコードはすぐに使えなくなります。既存メンバーはログインしたまま利用できます。続けますか？'))return;
    setBusy(true);
    setCode('');
    setCopied(false);
    setMessage('');
    try{
      const {data,error}=await supabase.rpc('rotate_registration_code');
      if(error)throw error;
      if(typeof data!=='string'||!data)throw new Error('新しいコードを受け取れませんでした。再発行する前に管理者に確認してください。');
      setCode(data);
      setMessage('新しいコードを発行しました。必要な方に共有し、安全な場所に控えてください。');
    }catch(e){
      setMessage(e instanceof Error?e.message:'コードの発行に失敗しました。');
    }finally{
      setBusy(false);
    }
  };

  const copy=async()=>{
    try{
      await navigator.clipboard.writeText(code);
      setCopied(true);
    }catch{
      setMessage('コピーできませんでした。表示されたコードを手動で控えてください。');
    }
  };

  return <div className="setting-card registration-settings">
    <label><KeyRound size={18}/>店舗登録コード（管理者のみ）</label>
    <p>新しく入ったメンバーの初回登録に使います。現在のコードは安全のため表示できません。</p>
    <button type="button" className="registration-rotate" disabled={busy} onClick={()=>void rotate()}>
      <RefreshCw size={17}/>{busy?'発行中…':'新しいコードを発行'}
    </button>
    {code&&<div className="registration-result" role="status">
      <small>新しい店舗登録コード（この画面でのみ表示）</small>
      <strong>{code}</strong>
      <button type="button" onClick={()=>void copy()}><Copy size={16}/>{copied?'コピーしました':'コードをコピー'}</button>
      <p>以前のコードは無効です。コードを忘れた場合は再発行してください。</p>
    </div>}
    {message&&<p aria-live="polite" className={code?'registration-success':'registration-error'}>{message}</p>}
  </div>;
}
