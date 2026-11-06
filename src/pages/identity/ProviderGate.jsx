import { useEffect, useState } from 'react';
import { Link, Navigate, Outlet } from 'react-router-dom';
import { loadAccountStatus } from '../../services/identityApi';
import './identity.css';
export default function ProviderGate() {
  const [status,setStatus]=useState(null),[error,setError]=useState(''),[attempt,setAttempt]=useState(0);
  useEffect(()=>{let current=true;loadAccountStatus().then(result=>{if(current)setStatus(result);}).catch(e=>{if(current)setError(e.message);});return()=>{current=false;};},[attempt]);
  if(error)return <main className="identity-page"><div className="identity-card" role="alert"><h1>Unable to check account approval</h1><p>{error}</p><button onClick={()=>{setError('');setAttempt(n=>n+1);}}>Retry</button><Link to="/account/verification">Account verification</Link></div></main>;
  if(!status)return <main className="identity-page" aria-busy="true"><p role="status">Checking account approval…</p></main>;
  if(status.approvalRequired && (!status.emailVerified || status.application?.status!=='approved'))return <Navigate to="/account/verification" replace />;
  return <Outlet />;
}
