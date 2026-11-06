import { pool } from './db.js';
import { identifiers,guestPathAllowed,DEMO_LIMITS } from './demoPolicy.js';
const member=(table,owner,join='')=>`SELECT r.id,u.demo_workspace_id AS workspace FROM ${table} r ${join} JOIN users u ON u.id=${owner}`;
const resources=[
 'SELECT id,demo_workspace_id AS workspace FROM users',
 ...['patients','doctors','hospitals'].map(t=>member(t,'r.user_id')),
 member('documents','p.user_id','JOIN patients p ON p.id=r.patient_id'),
 member('document_access_grants','p.user_id','JOIN patients p ON p.id=r.patient_id'),
 member('access_requests','p.user_id','JOIN patients p ON p.id=r.patient_id'),
 member('audit_logs','p.user_id','JOIN patients p ON p.id=r.patient_id'),
 member('patient_vitals','p.user_id','JOIN patients p ON p.id=r.patient_id'),
 member('drug_interactions','p.user_id','JOIN patients p ON p.id=r.patient_id'),
 member('emergency_access_events','p.user_id','JOIN patients p ON p.id=r.patient_id'),
 member('appointments','r.patient_user_id'),member('notifications','r.user_id'),member('chat_sessions','r.user_id'),
 member('chat_messages','s.user_id','JOIN chat_sessions s ON s.id=r.session_id'),
 member('provider_proofs','r.user_id'),
 'SELECT id,id AS workspace FROM demo_workspaces',
].join(' UNION ALL ');
export async function checkDemoIdentifiers(req,values){
  const {ids,emails}=identifiers(values);
  if(ids.length){
    const {rows}=await pool.query(`SELECT id,workspace FROM (${resources}) resources WHERE id=ANY($1::uuid[])`,[ids]);
    if(req.demoWorkspaceId){
      if(ids.some(id=>!rows.some(r=>r.id===id))||rows.some(r=>r.workspace!==req.demoWorkspaceId))return false;
    }else if(rows.some(r=>r.workspace))return false;
  }
  if(emails.length){
    const {rows}=await pool.query('SELECT email,demo_workspace_id AS workspace FROM users WHERE email=ANY($1::text[])',[emails]);
    if(req.demoWorkspaceId){if(emails.some(email=>!rows.some(r=>r.email===email))||rows.some(r=>r.workspace!==req.demoWorkspaceId))return false;}
    else if(rows.some(r=>r.workspace))return false;
  }
  return true;
}
export async function guardDemoRequest(req,res){
  const url=new URL(req.originalUrl,'http://internal');
  if(req.demoWorkspaceId && Buffer.byteLength(JSON.stringify(req.body||{}))>8192){res.status(413).json({message:'Please keep guest demo entries short.'});return false;}
  if(req.demoWorkspaceId&&!guestPathAllowed(req.method,url.pathname)){res.status(403).json({message:'This account action is not available in a guest demo.'});return false;}
  const parts=url.pathname.split('/').map(p=>decodeURIComponent(p));
  if(!await checkDemoIdentifiers(req,[parts,Object.fromEntries(url.searchParams),req.body])){res.status(404).json({message:'This resource is not part of your workspace.'});return false;}
  if(req.demoWorkspaceId && !['/demo/end','/demo/reset','/auth/logout'].includes(url.pathname)){
    const ai=req.method==='POST'&&(url.pathname==='/api/chat'||url.pathname.startsWith('/api/ai/summarize/'));
    if(ai&&typeof req.body?.message==='string'&&req.body.message.length>2000){res.status(400).json({message:'Keep guest AI messages within 2000 characters.'});return false;}
    const {rows}=await pool.query(`UPDATE demo_workspaces SET api_calls_used=api_calls_used+1,ai_requests_used=ai_requests_used+$2
      WHERE id=$1 AND expires_at>now() AND api_calls_used<$3 AND (NOT $4 OR ai_requests_used<$5) RETURNING id`,[req.demoWorkspaceId,ai?1:0,DEMO_LIMITS.apiCalls,ai,DEMO_LIMITS.aiRequests]);
    if(!rows.length){res.status(429).json({message:ai?'Your guest AI allowance has been used. You can continue exploring the other demo features.':'Your demo activity allowance has been used. Please start again later.'});return false;}
  }
  return true;
}
export async function consumeDemoProviderCall(){
  const {rows}=await pool.query(`INSERT INTO demo_daily_usage(day,provider_calls) VALUES(current_date,1)
    ON CONFLICT(day) DO UPDATE SET provider_calls=demo_daily_usage.provider_calls+1
    WHERE demo_daily_usage.provider_calls<$1 RETURNING provider_calls`,[DEMO_LIMITS.dailyProviderCalls]);
  if(!rows.length)throw Object.assign(new Error('The showcase AI allowance is used for today. All other demo features remain available.'),{status:429});
}
