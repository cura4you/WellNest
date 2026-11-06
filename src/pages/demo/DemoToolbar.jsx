import { useEffect,useState } from 'react';
import { Link,useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import './demo.css';
export default function DemoToolbar(){
  const {user,enterDemo,resetDemo,exitDemo,loading}=useAuth(),navigate=useNavigate();const [message,setMessage]=useState(''),[confirm,setConfirm]=useState(false),[showContacts,setShowContacts]=useState(false),[now,setNow]=useState(()=>Date.now());
  useEffect(()=>{if(!user?.isGuest)return;const timer=setInterval(()=>setNow(Date.now()),30000);return()=>clearInterval(timer);},[user?.isGuest]);
  if(!user?.isGuest)return null;
  const info=user.demo,minutes=Math.max(0,Math.ceil((new Date(info.expiresAt).getTime()-now)/60000)),expired=minutes===0;
  const run=async work=>{setMessage('');try{await work();}catch(e){setMessage(e.message||'Demo action failed. Please retry.');}};
  return <section className="demo-toolbar" aria-label="Guest demo controls"><div className="demo-toolbar-header"><div><strong>Guest showcase <span>· Synthetic data</span></strong><p>{expired?'Your session has expired.':`Your workspace expires in ${minutes} min.`} {info.limits.aiRequests} AI actions and {info.limits.uploads} uploads per session.</p></div><div className="demo-toolbar-actions"><label htmlFor="demo-role-switch">Switch demo role</label><select id="demo-role-switch" value={user.role} disabled={loading||expired} onChange={e=>{const role=e.target.value;void run(async()=>{const next=await enterDemo(role);navigate(`/dashboard/${next.role}`);});}}><option value="patient">Patient</option><option value="doctor">Doctor</option><option value="hospital">Hospital</option></select><button disabled={loading||expired} onClick={()=>setConfirm(!confirm)}>Reset demo</button><button disabled={loading} onClick={()=>void run(async()=>{await exitDemo();navigate('/');})}>Exit demo</button></div></div>
    {expired?<Link to="/demo">Start a fresh demo</Link>:<p className="demo-guidance">{user.role==='patient'?'Try approving the pending access request, then switch to Doctor.':user.role==='doctor'?'Explore Shared Documents or confirm the sample appointment.':'Explore Upload Queue, Staff Access, and the appointment schedule.'} <button className="demo-text-button" onClick={()=>setShowContacts(!showContacts)} aria-expanded={showContacts}>Demo contacts</button></p>}
    <datalist id="demo-patient-emails">{info.contacts.filter(c=>c.role==='patient').map(c=><option key={c.role} value={c.email}>{c.name}</option>)}</datalist><datalist id="demo-provider-emails">{info.contacts.filter(c=>c.role!=='patient').map(c=><option key={c.role} value={c.email}>{c.name}</option>)}</datalist>
    {showContacts && <div className="demo-contacts">{info.contacts.map(c=><div key={c.role}><label htmlFor={`demo-contact-${c.role}`}>{c.name} · {c.role}</label><input id={`demo-contact-${c.role}`} value={c.email} readOnly onFocus={e=>e.target.select()} aria-label={`${c.role} demo email`} /></div>)}</div>}
    {confirm && <div className="demo-reset-confirm" role="group" aria-label="Reset demo confirmation"><p>Restore your sample data? This resets changes across all three roles. Your expiry and usage allowances stay the same.</p><button disabled={loading} onClick={()=>void run(async()=>{const next=await resetDemo();setConfirm(false);navigate(`/dashboard/${next.role}`);})}>Reset my sample data</button><button disabled={loading} onClick={()=>setConfirm(false)}>Keep my changes</button></div>}
    {message && <p role="alert" className="demo-error">{message}</p>}
  </section>;
}
