import { useState } from 'react';
import { Link,useNavigate } from 'react-router-dom';
import BrandLogo from '../../components/brand/BrandLogo';
import { useAuth } from '../../hooks/useAuth';
import './demo.css';
const roles=[
  {role:'patient',number:'01',title:'See care from your side.',description:'Browse sample records, track vitals, and approve a doctor’s access request.',name:'Patient'},
  {role:'doctor',number:'02',title:'Connect the clinical picture.',description:'Review shared records, try the AI assistant, and manage appointments.',name:'Doctor'},
  {role:'hospital',number:'03',title:'Keep the care team connected.',description:'Explore uploads, shared access, appointment scheduling, and audit activity.',name:'Hospital'},
];
export default function DemoEntryPage(){
  const {enterDemo,loading,user}=useAuth(),navigate=useNavigate();const [error,setError]=useState(''),[chosen,setChosen]=useState('');
  const start=async role=>{setChosen(role);setError('');try{const next=await enterDemo(role);navigate(`/dashboard/${next.role}`);}catch(e){setError(e.message||'Could not start the guest demo. Please retry.');}finally{setChosen('');}};
  return <main className="demo-entry"><div className="demo-entry-container"><header className="demo-entry-nav"><Link to="/" aria-label="MediVault home"><BrandLogo /></Link><nav><Link to="/login">Sign in</Link><Link to="/register">Create an account</Link></nav></header><section className="demo-entry-intro"><span className="demo-eyebrow">A LITTLE LOOK INSIDE · LIVE DEMO</span><h1 id="demo-title">Try every side of care.</h1><p>A working sample workspace, ready to explore. Choose a role and switch between all three as you go.</p><div className="demo-entry-facts"><span>Synthetic records</span><span>Your own temporary workspace</span><span>No registration needed</span></div></section>
    {error && <div role="alert" className="demo-error">{error}</div>}
    <section className="demo-role-grid" aria-label="Choose your guest role">{roles.map(r=><article className="demo-role-card" key={r.role}><div className="demo-role-top"><span>{r.name} workspace</span><span>{r.number}</span></div><h2>{r.title}</h2><p>{r.description}</p><button disabled={loading} onClick={()=>void start(r.role)}>{loading&&chosen===r.role?'Preparing your workspace…':`${user?.isGuest?'Continue':'Explore'} as ${r.role}`}<span aria-hidden="true">→</span></button></article>)}</section>
    <section className="demo-how"><h2>A connected demo, just for you.</h2><p>Approve a request as the patient, then switch to the doctor to see the shared record. Changes stay in your workspace. Use sample information only: the session expires after two hours, and AI, uploads, and resets have small usage allowances.</p></section><footer className="demo-entry-footer"><Link to="/">Back to MediVault</Link><span>Portfolio showcase · All records are fictional</span></footer>
  </div></main>;
}
