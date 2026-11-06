import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { loadAccountStatus } from '../../services/identityApi';
import './identity.css';
export default function AccountStatusBanner() {
  const [status,setStatus]=useState(null),[failed,setFailed]=useState(false);
  useEffect(()=>{let current=true;loadAccountStatus().then(s=>{if(current && typeof s.emailVerified==='boolean')setStatus(s);}).catch(()=>{if(current)setFailed(true);});return()=>{current=false;};},[]);
  if(failed)return <div className="identity-banner">Account verification status is unavailable.<Link to="/account/verification">Check status</Link></div>;
  if(!status)return null;
  if(status.emailVerified && (!status.application || status.application.status==='approved') && !status.isAdmin)return null;
  return <div className="identity-banner">{!status.emailVerified && <span>Email not verified. </span>}{status.application && <span>Provider review: {status.application.status}. </span>}<Link to="/account/verification">Account verification</Link>{status.isAdmin && <Link to="/admin/reviews">Review applications</Link>}</div>;
}
