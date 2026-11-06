import 'dotenv/config';
import { pool } from '../server/src/db.js';
import { pruneExpiredDemos } from '../server/src/demoWorkspace.js';
try{console.log(JSON.stringify(await pruneExpiredDemos()));}finally{await pool.end();}
