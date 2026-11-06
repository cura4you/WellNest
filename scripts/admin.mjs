// Privilege changes are deliberately CLI-only; public registration cannot grant admin.
import 'dotenv/config';
import { randomBytes } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import bcrypt from 'bcryptjs';
import { pool, withTransaction } from '../server/src/db.js';
const args=process.argv.slice(2), action=args[0];
const value=key=>{const i=args.indexOf(key);return i<0?'':args[i+1];};
const email=value('--email').trim().toLowerCase();
try {
  if (!['grant','revoke'].includes(action) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw Error('Usage: npm run admin -- grant|revoke --email <registered-email> [--create --credentials-file <private-path>]');
  let credentials;
  const result=await withTransaction(async client=>{
    await client.query("SELECT pg_advisory_xact_lock(hashtext('medivault-admin-management'))");
    let user=(await client.query('SELECT id,is_admin,demo_workspace_id FROM users WHERE email=$1 FOR UPDATE',[email])).rows[0];
    if (!user && action==='grant' && args.includes('--create')) {
      const file=value('--credentials-file');if(!file)throw Error('A private credentials file is required for a new portfolio account.');
      const password=randomBytes(24).toString('base64url')+'A1';
      // Write exclusively before provisioning; do not replace an existing credentials backup.
      writeFileSync(file,JSON.stringify({email,password},null,2)+'\n',{mode:0o600,flag:'wx'});
      user=(await client.query("INSERT INTO users(email,password_hash,role) VALUES($1,$2,'patient') RETURNING id,is_admin",[email,await bcrypt.hash(password,12)])).rows[0];
      await client.query("INSERT INTO patients(user_id,full_name,date_of_birth,blood_group) VALUES($1,'Portfolio Administrator','2000-01-01','O+')",[user.id]);
      credentials=file;
    }
    if(user?.demo_workspace_id)throw Error('Guest accounts cannot receive administrator access.');
    if(!user)throw Error('Register the account first, or explicitly create a portfolio account with --create.');
    if(action==='revoke' && user.is_admin){
      const others=await client.query('SELECT id FROM users WHERE is_admin=true AND id<>$1',[user.id]);
      if(!others.rowCount)throw Error('Grant another administrator before revoking the last one.');
    }
    await client.query('UPDATE users SET is_admin=$1,auth_version=auth_version+1,updated_at=now() WHERE id=$2',[action==='grant',user.id]);
    return {adminAccess:action==='grant',accountCreated:Boolean(credentials),credentialsFile:credentials||undefined};
  });
  console.log(JSON.stringify(result));
} catch(e) { console.error(e.message);process.exitCode=1; } finally { await pool.end(); }
