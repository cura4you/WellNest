import { withTransaction } from './db.js';
import { encryptFile } from './crypto.js';
import { uploadFile } from './storage.js';
import { runDemoContext } from './demoContext.js';
import { DEMO_LIMITS,demoRole } from './demoPolicy.js';
import { samplePdf } from './demoPdf.js';
import { issueToken,makeSafeUser,camelRow } from './utils.js';
const fault=(status,message)=>Object.assign(new Error(message),{status});
export async function deleteDemoData(client,workspaceIds){
  const users=(await client.query('SELECT id FROM users WHERE demo_workspace_id=ANY($1::uuid[])',[workspaceIds])).rows.map(r=>r.id);
  if(users.length){
    await client.query('DELETE FROM appointment_events WHERE appointment_id IN (SELECT id FROM appointments WHERE patient_user_id=ANY($1::uuid[]) OR provider_user_id=ANY($1::uuid[]))',[users]);
    await client.query('DELETE FROM appointments WHERE patient_user_id=ANY($1::uuid[]) OR provider_user_id=ANY($1::uuid[])',[users]);
    await client.query('DELETE FROM emergency_access_events WHERE requester_user_id=ANY($1::uuid[]) OR patient_id IN (SELECT id FROM patients WHERE user_id=ANY($1::uuid[]))',[users]);
    await client.query('DELETE FROM documents WHERE uploaded_by_user_id=ANY($1::uuid[]) OR patient_id IN (SELECT id FROM patients WHERE user_id=ANY($1::uuid[]))',[users]);
    await client.query('DELETE FROM users WHERE id=ANY($1::uuid[])',[users]);
  }
  await client.query('DELETE FROM demo_files WHERE workspace_id=ANY($1::uuid[])',[workspaceIds]);
}
export async function pruneExpiredDemos(limit=100){
  return withTransaction(async client=>{
    const ids=(await client.query('SELECT id FROM demo_workspaces WHERE expires_at<=now() ORDER BY expires_at LIMIT $1 FOR UPDATE SKIP LOCKED',[limit])).rows.map(r=>r.id);
    if(ids.length){await deleteDemoData(client,ids);await client.query('DELETE FROM demo_workspaces WHERE id=ANY($1::uuid[])',[ids]);}
    return {removed:ids.length};
  });
}
function sampleDate(days,hour=14){const date=new Date();date.setUTCDate(date.getUTCDate()+days);date.setUTCHours(hour,0,0,0);return date;}
async function seed(client,workspace){
  const id=workspace.id,generation=workspace.generation;
  const accounts={};
  for(const [role,name]of [['patient','Jamie Morgan'],['doctor','Dr. Avery Patel'],['hospital','Willow Care Hospital']]){
    accounts[role]=(await client.query("INSERT INTO users(email,password_hash,role,demo_workspace_id) VALUES($1,'guest-session-only',$2,$3) RETURNING *",[`${role}+${id}.g${generation}@demo.wellnest.invalid`,role,id])).rows[0];accounts[role].name=name;
  }
  const p=accounts.patient,d=accounts.doctor,h=accounts.hospital;
  const patient=(await client.query("INSERT INTO patients(user_id,full_name,date_of_birth,blood_group,gender,allergies,current_medications) VALUES($1,$2,'1995-06-15','O+','Other','None recorded (synthetic)','Vitamin D3 sample entry') RETURNING id",[p.id,p.name])).rows[0].id;
  await client.query('INSERT INTO doctors(user_id,full_name,license_number,specialization) VALUES($1,$2,$3,$4)',[d.id,d.name,`DEMO-D-${id}-g${generation}`,'General Medicine']);
  const hospital=(await client.query('INSERT INTO hospitals(user_id,hospital_name,license_number,phone,address) VALUES($1,$2,$3,$4,$5) RETURNING id',[h.id,h.name,`DEMO-H-${id}-g${generation}`,'2125550100','100 Sample Lane, Demo City'])).rows[0].id;
  await client.query('INSERT INTO provider_applications(user_id) VALUES($1),($2)',[d.id,h.id]);
  const templates=[
    {name:'Sample blood test results.pdf',type:'lab_report',days:-7,text:'FICTIONAL PORTFOLIO RECORD. Patient: Jamie Morgan. Laboratory report. HbA1c: 5.6%. Hemoglobin: 13.8 g/dL. LDL cholesterol: 96 mg/dL. These are synthetic values for demonstrating record retrieval, not an actual patient result.'},
    {name:'Sample prescription.pdf',type:'prescription',days:-14,text:'FICTIONAL PORTFOLIO RECORD. Patient: Jamie Morgan. Sample prescription: Vitamin D3 1000 IU, one capsule daily. This is a synthetic example for the application demonstration, not a real prescription or a treatment recommendation.'},
    {name:'Sample annual health review.pdf',type:'diagnosis',days:-30,text:'FICTIONAL PORTFOLIO RECORD. Patient: Jamie Morgan. Annual health review. Recorded blood pressure: 118/76 mmHg. Pulse: 72 bpm. No allergies recorded in this fictional visit. Follow-up recorded for six months. This document is synthetic sample content.'},
  ];
  const docs=[];
  for(const t of templates){
    const text=`${t.text}\nReport date: ${sampleDate(t.days).toISOString().slice(0,10)}\n`,bytes=samplePdf(text),encrypted=encryptFile(bytes);
    const object=await runDemoContext({workspaceId:id,client,seed:true},()=>uploadFile(encrypted.blob,t.name));
    const doc=(await client.query(`INSERT INTO documents(patient_id,uploaded_by_user_id,hospital_id,document_type,original_filename,mime_type,file_size_bytes,total_chunks,file_checksum_sha256,dek_wrapped,dek_iv,visit_date,description,appwrite_file_id)
      VALUES($1,$2,$3,$4,$5,'application/pdf',$6,1,$7,$8,$9,$10,'Synthetic portfolio sample',$11) RETURNING id,dek_wrapped`,[patient,h.id,hospital,t.type,t.name,bytes.length,encrypted.checksum,encrypted.dekWrapped,encrypted.dekIv,sampleDate(t.days),object])).rows[0];docs.push(doc);
    await client.query('INSERT INTO document_chunks(document_id,chunk_index,content) VALUES($1,0,$2)',[doc.id,text]);
    await client.query("INSERT INTO audit_logs(patient_id,document_id,actor_user_id,action,status,reason) VALUES($1,$2,$3,'upload','success','Sample record added to your guest workspace')",[patient,doc.id,h.id]);
  }
  for(const doc of docs.slice(0,2))await client.query("INSERT INTO document_access_grants(document_id,patient_id,grantee_user_id,status,wrapped_dek_for_grantee,granted_at,expires_at,request_reason) VALUES($1,$2,$3,'approved',$4,now(),$5,'Sample consented access')",[doc.id,patient,d.id,doc.dek_wrapped,workspace.expires_at]);
  await client.query("INSERT INTO access_requests(patient_id,requester_user_id,requested_scope,reason,document_ids) VALUES($1,$2,'specific_documents','Please share the sample annual review so I can prepare for our appointment.',$3)",[patient,d.id,JSON.stringify([docs[2].id])]);
  for(const [offset,pulse,sys,dia,glucose]of [[-1,72,118,76,94],[-3,70,116,74,92],[-6,74,120,78,96]])await client.query("INSERT INTO patient_vitals(patient_id,measured_at,heart_rate,systolic,diastolic,glucose,notes) VALUES($1,$2,$3,$4,$5,$6,'Synthetic demo measurement')",[patient,sampleDate(offset),pulse,sys,dia,glucose]);
  for(const [provider,days,status]of [[d,2,'requested'],[h,4,'confirmed']]){
    const ap=(await client.query('INSERT INTO appointments(patient_user_id,provider_user_id,created_by_user_id,starts_at,duration_minutes,reason,location,status) VALUES($1,$2,$3,$4,30,$5,$6,$7) RETURNING id',[p.id,provider.id,status==='requested'?p.id:h.id,sampleDate(days),'Sample follow-up appointment',provider.role==='doctor'?'Demo consultation room':'Willow Care Hospital',status])).rows[0];
    await client.query("INSERT INTO appointment_events(appointment_id,actor_user_id,action) VALUES($1,$2,'created')",[ap.id,status==='requested'?p.id:h.id]);
  }
  for(const user of Object.values(accounts))await client.query("INSERT INTO notifications(user_id,title,body,channel) VALUES($1,'Welcome to your guest workspace','Explore synthetic records and appointments. Use Switch demo role to experience the other side.','in_app')",[user.id]);
  await client.query("INSERT INTO notifications(user_id,title,body,channel) VALUES($1,'Sample access request','Dr. Avery Patel requested your sample annual health review. Approve it, then switch to Doctor.','in_app')",[p.id]);
  return accounts;
}
async function session(client,workspace,role){
  const users=(await client.query('SELECT u.*,COALESCE(p.full_name,d.full_name,h.hospital_name) AS demo_name FROM users u LEFT JOIN patients p ON p.user_id=u.id LEFT JOIN doctors d ON d.user_id=u.id LEFT JOIN hospitals h ON h.user_id=u.id WHERE u.demo_workspace_id=$1',[workspace.id])).rows;
  const user=users.find(u=>u.role===role);if(!user)throw fault(409,'The demo changed. Start a fresh guest session.');
  const profile=(await client.query(`SELECT * FROM ${role==='patient'?'patients':role==='doctor'?'doctors':'hospitals'} WHERE user_id=$1`,[user.id])).rows[0];
  const contacts=users.map(u=>({role:u.role,email:u.email,name:u.demo_name}));
  const demo={expiresAt:workspace.expires_at,contacts,limits:DEMO_LIMITS,usage:{resets:workspace.resets_used,uploads:workspace.uploads_used,aiRequests:workspace.ai_requests_used}};
  return {token:issueToken(user.id,role,user.auth_version,new Date(workspace.expires_at).getTime()-Date.now()),user:{...makeSafeUser(user,camelRow(profile)),demo}};
}
export async function startDemo(role){
  demoRole(role);await pruneExpiredDemos(5);
  const workspace=await withTransaction(async client=>{
    await client.query("SELECT pg_advisory_xact_lock(hashtext('medivault-demo-capacity'))");
    const count=(await client.query('SELECT count(*)::int AS count FROM demo_workspaces WHERE expires_at>now()')).rows[0].count;
    if(count>=DEMO_LIMITS.activeWorkspaces)throw fault(429,'The guest demo is busy. Please try again shortly.');
    const daily=await client.query(`INSERT INTO demo_daily_usage(day,workspaces_created) VALUES(current_date,1) ON CONFLICT(day) DO UPDATE SET workspaces_created=demo_daily_usage.workspaces_created+1 WHERE demo_daily_usage.workspaces_created<$1 RETURNING day`,[DEMO_LIMITS.dailyWorkspaces]);
    if(!daily.rowCount)throw fault(429,'The guest showcase capacity is used for today. Please try again tomorrow.');
    return (await client.query("INSERT INTO demo_workspaces(expires_at) VALUES(now()+$1*interval '1 hour') RETURNING *",[DEMO_LIMITS.hours])).rows[0];
  });
  try{return await withTransaction(async client=>{await seed(client,workspace);return session(client,workspace,role);});}
  catch(error){await withTransaction(async client=>{await deleteDemoData(client,[workspace.id]);await client.query('DELETE FROM demo_workspaces WHERE id=$1',[workspace.id]);});throw error;}
}
export async function useDemo(req,role,reset=false){
  demoRole(role);
  return withTransaction(async client=>{
    let workspace=(await client.query('SELECT * FROM demo_workspaces WHERE id=$1 AND expires_at>now() FOR UPDATE',[req.demoWorkspaceId])).rows[0];
    if(!workspace)throw fault(401,'Your guest session has expired. Start a fresh demo.');
    const owner=await client.query('SELECT id FROM users WHERE id=$1 AND demo_workspace_id=$2',[req.userId,workspace.id]);
    if(!owner.rowCount)throw fault(409,'This demo was reset in another tab. Start again from the demo page.');
    if(reset){
      if(workspace.resets_used>=DEMO_LIMITS.resets)throw fault(429,'Your guest reset allowance is used. You can continue exploring the current data.');
      await deleteDemoData(client,[workspace.id]);
      workspace=(await client.query('UPDATE demo_workspaces SET generation=generation+1,resets_used=resets_used+1 WHERE id=$1 RETURNING *',[workspace.id])).rows[0];await seed(client,workspace);
    }
    return session(client,workspace,role);
  });
}
export async function endDemo(req){
  await withTransaction(async client=>{await client.query('SELECT id FROM demo_workspaces WHERE id=$1 FOR UPDATE',[req.demoWorkspaceId]);await deleteDemoData(client,[req.demoWorkspaceId]);await client.query('DELETE FROM demo_workspaces WHERE id=$1',[req.demoWorkspaceId]);});
}
