import {useState} from 'react';
import {supabase} from './lib';

type RegistrationOption={id:string;name:string;display_name:string|null};

export default function Login({error}:{error:string}){
  const [existing,setExisting]=useState(false);
  const [code,setCode]=useState('');
  const [options,setOptions]=useState<RegistrationOption[]>([]);
  const [memberId,setMemberId]=useState('');
  const [email,setEmail]=useState('');
  const [otp,setOtp]=useState('');
  const [sent,setSent]=useState(false);
  const [busy,setBusy]=useState(false);
  const [localError,setLocalError]=useState('');

  const registerDevice=async()=>{
    if(!memberId||!code.trim())return;
    setBusy(true);setLocalError('');
    try{
      const sessionResult=await supabase.auth.getSession();
      if(sessionResult.error)throw sessionResult.error;
      if(sessionResult.data.session&&!sessionResult.data.session.user.is_anonymous){
        throw new Error('メールでログイン済みです。一度ログアウトしてから端末登録してください。');
      }
      if(!sessionResult.data.session){
        const signIn=await supabase.auth.signInAnonymously();
        if(signIn.error)throw signIn.error;
      }
      const claimed=await supabase.rpc('claim_anonymous_member',{
        p_member_id:memberId,p_code:code.trim()
      });
      if(claimed.error)throw claimed.error;
      window.location.reload();
    }catch(e){
      const message=e instanceof Error?e.message:'';
      setLocalError(message.includes('Anonymous sign-ins are disabled')||message.includes('anonymous')&&message.includes('disabled')
        ?'端末登録がまだ利用できません。管理者に連絡するか、メール登録を利用してください。'
        :message.includes('店舗コードが違います')||message.includes('既に登録済み')||message.includes('既に登録')
          ?message
          :'端末登録に失敗しました。通信状態を確認して、もう一度お試しください。');
      const active=await supabase.auth.getSession();
      if(active.data.session?.user.is_anonymous)await supabase.auth.signOut();
    }finally{setBusy(false)}
  };

  const checkCode=async()=>{
    if(!code.trim())return;
    setBusy(true);setLocalError('');
    const result=await supabase.rpc('get_registration_options',{p_code:code.trim()});
    setBusy(false);
    if(result.error){
      setLocalError(result.error.message.includes('店舗コードが違います')
        ? '店舗コードが違います。入力内容を確認してください。'
        : '店舗コードの確認処理でエラーが発生しました。時間をおいて再度お試しください。');
      return;
    }
    if(!result.data?.length){
      setLocalError('登録できる名前がありません。管理者にメンバーの追加を依頼してください。');
      return;
    }
    setOptions(result.data as RegistrationOption[]);
    setMemberId(result.data[0].id);
  };

  const send=async()=>{
    const normalizedEmail=email.trim().toLowerCase();
    if(!normalizedEmail)return;
    if(!existing&&!memberId){setLocalError('自分の名前を選択してください。');return}
    setBusy(true);setLocalError('');
    if(!existing)localStorage.setItem('shiftcal-pending-registration',JSON.stringify({memberId,code:code.trim()}));
    const result=await supabase.auth.signInWithOtp({
      email:normalizedEmail,
      options:{shouldCreateUser:true}
    });
    setBusy(false);
    if(result.error){
      if(!existing)localStorage.removeItem('shiftcal-pending-registration');
      setLocalError(result.error.message.toLowerCase().includes('rate limit')
        ?'メール送信が上限に達しました。少し時間を空けて、もう一度お試しください。'
        :'ログインメールを送信できませんでした。メールアドレスを確認してください。');
      return;
    }
    setSent(true);
  };

  const verify=async()=>{
    if(otp.length!==6)return;
    setBusy(true);setLocalError('');
    const result=await supabase.auth.verifyOtp({email:email.trim().toLowerCase(),token:otp,type:'email'});
    setBusy(false);
    if(result.error){setLocalError('認証コードが違うか、有効期限が切れています。');return}
  };

  const switchMode=()=>{
    setExisting(value=>!value);setLocalError('');setOptions([]);setMemberId('');setCode('');setSent(false);
  };

  return <div className="identity"><div className="identity-card">
    <span className="logo">S</span>
    <p className="eyebrow">シフト共有カレンダー</p>
    <h1>{existing?'メールでログイン':'初回登録'}</h1>
    <p>{existing?'登録済みのメールアドレスへ6桁の認証コードを送ります。':'店舗コードを確認し、自分の名前をこの端末に登録します。'}</p>
    {(error||localError)&&<div className="error">{error||localError}</div>}
    {sent?<div className="login-sent otp-form">
      <b>6桁の認証コードを送信しました</b>
      <p>メールに記載された数字を、この画面へ入力してください。</p>
      <input inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={otp} onChange={e=>setOtp(e.target.value.replace(/\D/g,'').slice(0,6))} placeholder="123456"/>
      <button disabled={busy||otp.length!==6} onClick={()=>void verify()}>{busy?'確認中…':'認証してログイン'}</button>
      <button className="login-switch" onClick={()=>{setSent(false);setOtp('')}}>メールアドレスを変更</button>
    </div>:<div className="login-form">
      {!existing&&<>
        {options.length===0
          ?<div className="registration-code"><input inputMode="text" autoCapitalize="characters" autoComplete="off" maxLength={24} value={code} onChange={e=>setCode(e.target.value)} placeholder="店舗コード"/><button disabled={busy||!code.trim()} onClick={()=>void checkCode()}>{busy?'確認中…':'コードを確認'}</button></div>
          :<><label>自分の名前</label><select value={memberId} onChange={e=>setMemberId(e.target.value)}>{options.map(option=><option value={option.id} key={option.id}>{option.display_name?.trim()||option.name}</option>)}</select></>}
      </>}
      {!existing&&options.length>0&&<>
        <button disabled={busy||!memberId} onClick={()=>void registerDevice()}>{busy?'登録中…':'この端末で登録（メール不要）'}</button>
        <p className="login-note">次回から自動ログインします。端末変更・ブラウザデータ削除・ログアウト時は管理者による再登録が必要です。</p>
        <details className="email-registration"><summary>メールアドレスで登録する場合</summary>
          <label>メールアドレス</label>
          <input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="name@example.com" autoComplete="email"/>
          <button disabled={busy||!email.trim()} onClick={()=>void send()}>{busy?'送信中…':'6桁コードを送信'}</button>
        </details>
      </>}
      {existing&&<>
        <label>メールアドレス</label>
        <input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="name@example.com" autoComplete="email"/>
        <button disabled={busy||!email.trim()} onClick={()=>void send()}>{busy?'送信中…':'6桁コードを送信'}</button>
      </>}
      <button className="login-switch" onClick={switchMode}>{existing?'初めて利用する方':'登録済みの方はこちら'}</button>
    </div>}
    <p className="login-note">メールアドレスは他のメンバーには表示されません。</p>
  </div></div>;
}
