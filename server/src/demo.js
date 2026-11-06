import express from 'express';
import crypto from 'node:crypto';
import { requireAuth } from './utils.js';
import { limited } from './securityLimits.js';
import { startDemo,useDemo,endDemo,pruneExpiredDemos } from './demoWorkspace.js';
const router=express.Router();
router.use((req,res,next)=>{req.body??={};res.set('Cache-Control','no-store');next();});
router.post('/start',async(req,res)=>{
  if(process.env.DEMO_ENABLED!=='true')return res.status(503).json({message:'The guest showcase is temporarily unavailable. Please try again later.'});
  if(await limited(`demo-start:${req.ip}`,10,3600))return res.status(429).json({message:'Too many guest sessions started from this connection. Please try again later.'});
  res.status(201).json(await startDemo(req.body.role));
});
router.use(requireAuth);
router.use((req,res,next)=>{if(!req.demoWorkspaceId)return res.status(403).json({message:'This action requires a guest workspace.'});next();});
router.get('/status',async(req,res)=>res.json(await useDemo(req,req.userRole)));
router.post('/switch',async(req,res)=>res.json(await useDemo(req,req.body.role)));
router.post('/reset',async(req,res)=>res.json(await useDemo(req,req.userRole,true)));
router.post('/end',async(req,res)=>{await endDemo(req);res.json({message:'Guest workspace closed.'});});
router.use((error,_req,res,next)=>{void next;if(!error.status)console.error('Guest workspace operation failed.');res.status(error.status||503).json({message:error.status?error.message:'Could not prepare your guest workspace. Please retry.'});});
export async function demoCleanupHandler(req,res){
  const secret=process.env.CRON_SECRET,provided=req.headers.authorization||'';
  if(!secret)return res.status(503).json({message:'Cleanup is not configured.'});
  const expected=`Bearer ${secret}`;
  if(Buffer.byteLength(provided)!==Buffer.byteLength(expected)||!crypto.timingSafeEqual(Buffer.from(provided),Buffer.from(expected)))return res.status(401).json({message:'Unauthorized.'});
  try{res.json(await pruneExpiredDemos());}catch{res.status(503).json({message:'Cleanup could not finish. Please retry.'});}
}
export default router;
