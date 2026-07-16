import {useState} from 'react';
import {supabase} from './lib';

export default function Login({error}:{error:string}){
  const [email,setEmail]=useState('');
  const [sent,setSent]=useState(false);
  const [busy,setBusy]=useState(false);
  const [localError,setLocalError]=useState('');

  const send=async()=>{
    if(!email.trim())return;
    setBusy(true);
    setLocalError('');
    const result=await supabase.auth.signInWithOtp({
      email:email.trim().toLowerCase(),
      options:{shouldCreateUser:true,emailRedirectTo:location.origin}
    });
    setBusy(false);
    if(result.error){
      setLocalError(result.error.message.includes('rate limit')
        ?'メール送信の上限に達しました。少し時間をおいて再度お試しください。'
        :result.error.message);
      return;
    }
    setSent(true);
  };

  return <div className="identity"><div className="identity-card">
    <span className="logo">S</span>
    <p className="eyebrow">シフト共有カレンダー</p>
    <h1>メールでログイン</h1>
    <p>登録済みのメールアドレスへログインリンクを送ります。同じ端末では通常、初回だけで大丈夫です。</p>
    {(error||localError)&&<div className="error">{error||localError}</div>}
    {sent?<div className="login-sent">
      <b>メールを送信しました</b>
      <p>届いたメール内のリンクを開いてください。</p>
      <button onClick={()=>setSent(false)}>メールアドレスを変更</button>
    </div>:<div className="login-form">
      <input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="name@example.com" autoComplete="email"/>
      <button disabled={busy||!email.trim()} onClick={()=>void send()}>{busy?'送信中…':'ログインリンクを送信'}</button>
    </div>}
  </div></div>;
}
