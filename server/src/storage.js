import { pool,withTransaction } from './db.js';
import { getDemoContext } from './demoContext.js';
import { DEMO_LIMITS } from './demoPolicy.js';
import { randomUUID } from 'node:crypto';
// Object storage for encrypted document blobs. S3-compatible, so it works with
// MinIO (docker-compose.yml), AWS S3, Cloudflare R2, etc. Configure via .env:
//   S3_ENDPOINT   e.g. http://localhost:9000 (MinIO)
//   S3_ACCESS_KEY / S3_SECRET_KEY
//   S3_BUCKET     default: medivault-documents
//   S3_REGION     default: us-east-1 (MinIO ignores it but the SDK requires one)
import {
  S3Client,
  HeadBucketCommand,
  CreateBucketCommand,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';

const BUCKET = process.env.S3_BUCKET || 'medivault-documents';

const s3 = new S3Client({
  endpoint: process.env.S3_ENDPOINT || 'http://localhost:9000',
  region: process.env.S3_REGION || 'us-east-1',
  forcePathStyle: true, // MinIO serves buckets as /bucket/key, not bucket.host
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY || '',
    secretAccessKey: process.env.S3_SECRET_KEY || '',
  },
});

export function isStorageConfigured() {
  return Boolean(process.env.S3_ACCESS_KEY && process.env.S3_SECRET_KEY);
}

/** Ensure the bucket exists, creating it if needed. Call once on server startup. */
export async function ensureBucket() {
  try {
    await s3.send(new HeadBucketCommand({ Bucket: BUCKET }));
  } catch (err) {
    const status = err.$metadata?.httpStatusCode;
    if (status === 404 || err.name === 'NotFound' || err.name === 'NoSuchBucket') {
      await s3.send(new CreateBucketCommand({ Bucket: BUCKET }));
      console.log(`✓ Created storage bucket "${BUCKET}"`);
    } else {
      throw err;
    }
  }
  console.log(`✓ Storage bucket "${BUCKET}" ready at ${process.env.S3_ENDPOINT || 'http://localhost:9000'}`);
}

/**
 * Upload an encrypted buffer. Returns the object key, which is stored in
 * documents.appwrite_file_id (column name kept from the earlier Appwrite backend).
 * @param {Buffer} buffer
 * @param {string} filename  Caller already prefixes a UUID; we only sanitize.
 */
export async function uploadFile(buffer, filename) {
  const demo=getDemoContext();
  if(demo){
    const key=`demo/${demo.workspaceId}/${randomUUID()}`;
    const write=async client=>{
      if(!demo.seed){const r=await client.query('UPDATE demo_workspaces SET uploads_used=uploads_used+1 WHERE id=$1 AND expires_at>now() AND uploads_used<$2 RETURNING id',[demo.workspaceId,DEMO_LIMITS.uploads]);if(!r.rowCount)throw Object.assign(new Error('Your guest upload allowance is used.'),{status:429});}
      if(buffer.length>DEMO_LIMITS.uploadBytes+128)throw Object.assign(new Error('Guest files must be 1 MB or smaller.'),{status:400});
      await client.query('INSERT INTO demo_files(object_key,workspace_id,ciphertext) VALUES($1,$2,$3)',[key,demo.workspaceId,buffer]);
    };
    if(demo.client)await write(demo.client);else await withTransaction(write);
    return key;
  }
  const key = filename.replace(/[^\w.-]+/g, '_');
  await s3.send(new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    Body: buffer,
    ContentType: 'application/octet-stream',
  }));
  return key;
}

/** @returns {Promise<Buffer>} */
export async function downloadFile(key) {
  if(key.startsWith('demo/')){const demo=getDemoContext();if(!demo||!key.startsWith(`demo/${demo.workspaceId}/`))throw new Error('Workspace file unavailable.');const r=await pool.query('SELECT ciphertext FROM demo_files WHERE object_key=$1 AND workspace_id=$2',[key,demo.workspaceId]);if(!r.rows[0])throw new Error('Workspace file unavailable.');return r.rows[0].ciphertext;}
  const res = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
  return Buffer.from(await res.Body.transformToByteArray());
}

export async function deleteFile(key) {
  if(key.startsWith('demo/')){const demo=getDemoContext();if(!demo||!key.startsWith(`demo/${demo.workspaceId}/`))throw new Error('Workspace file unavailable.');await pool.query('DELETE FROM demo_files WHERE object_key=$1 AND workspace_id=$2',[key,demo.workspaceId]);return;}
  await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
}
