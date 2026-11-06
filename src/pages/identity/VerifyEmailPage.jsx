import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import BrandLogo from '../../components/brand/BrandLogo';
import { identityRequest } from '../../services/identityApi';
import './identity.css';
export default function VerifyEmailPage(){
  const [token]=useState(()=>window.location.hash.slice(1)),[message,setMessage]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  useEffect(()=>{window.history.replaceState(null,'',window.location.pathname);},[]);
  const confirm=async()=>{setBusy(true);setError('');try{const result=await identityRequest('/verification/confirm',{method:'POST',body:{token},publicRequest:true});setMessage(result.message);}catch(e){setError(e.message);}finally{setBusy(false);}};
  return <main className="identity-page"><div className="identity-container"><Link to="/" aria-label="MediVault home"><BrandLogo /></Link><section className="identity-card" style={{maxWidth:560,margin:'40px auto'}}><h1>Verify your email</h1><p>Confirm that you requested verification for your MediVault account.</p>{message?<p role="status">{message}</p>:<>{error && <p role="alert" className="identity-message is-error">{error}</p>}{/^[a-f0-9]{64}$/.test(token)?<button disabled={busy} onClick={()=>void confirm()}>{busy?'Verifying…':'Confirm email address'}</button>:<p role="alert">This verification link is missing or invalid.</p>}</>}<nav className="identity-links"><Link to="/account/verification">Account verification</Link><Link to="/login">Sign in</Link></nav></section></div></main>;
}
