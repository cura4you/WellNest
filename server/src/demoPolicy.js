export const DEMO_LIMITS = Object.freeze({ hours:2, resets:2, uploads:2, uploadBytes:1024*1024, aiRequests:4, apiCalls:500, activeWorkspaces:30, dailyWorkspaces:100, dailyProviderCalls:80 });
export const DEMO_ROLES = ['patient','doctor','hospital'];
export function demoRole(value) {
  if (!DEMO_ROLES.includes(value)) throw Object.assign(new Error('Choose the patient, doctor or hospital demo.'),{status:400});
  return value;
}
export function identifiers(values) {
  const ids=new Set(),emails=new Set();let visited=0;
  function walk(value,depth=0){
    if(++visited>3000||depth>12)throw Object.assign(new Error('This request is too complex for the demo.'),{status:400});
    if(typeof value==='string'){
      const v=value.trim().toLowerCase();
      if(/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(v))ids.add(v);
      else if(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v))emails.add(v);
    }else if(Array.isArray(value))value.forEach(v=>walk(v,depth+1));
    else if(value&&typeof value==='object')Object.values(value).forEach(v=>walk(v,depth+1));
  }
  walk(values);if(ids.size+emails.size>100)throw Object.assign(new Error('Too many identifiers in this request.'),{status:400});
  return {ids:[...ids],emails:[...emails]};
}
export function guestPathAllowed(method,path){
  if(path==='/demo/status')return method==='GET';
  if(['/demo/switch','/demo/reset','/demo/end'].includes(path))return method==='POST';
  if(['/auth/account-status','/auth/session'].includes(path))return method==='GET';
  if(path==='/auth/logout')return method==='POST';
  if(!path.startsWith('/api/'))return false;
  const routes={
    GET:[/^\/api\/dashboard\/(patient|doctor|hospital)$/,/^\/api\/patients\/search$/,/^\/api\/documents\/[^/]+\/download$/,/^\/api\/(vitals|appointments|notification-preferences|notifications)$/,/^\/api\/drug-interactions\/[^/]+$/,/^\/api\/chat\/sessions(?:\/[^/]+)?$/],
    POST:[/^\/api\/documents\/upload$/,/^\/api\/access-requests(?:\/documents)?$/,/^\/api\/documents\/by-ids$/,/^\/api\/grants\/(?:[^/]+\/revoke|revoke-by-grantee)$/,/^\/api\/emergency-access\/initiate$/,/^\/api\/ai\/summarize\/[^/]+$/,/^\/api\/(appointments|vitals|drug-interactions|chat)$/],
    PATCH:[/^\/api\/profile\/(patient|doctor|hospital)$/,/^\/api\/(appointments|access-requests)\/[^/]+$/,/^\/api\/notifications\/[^/]+\/read$/],
    PUT:[/^\/api\/notification-preferences\/[^/]+$/],
    DELETE:[/^\/api\/(vitals|drug-interactions)\/[^/]+$/,/^\/api\/chat\/sessions\/[^/]+$/],
  };
  return (routes[method]||[]).some(pattern=>pattern.test(path));
}
