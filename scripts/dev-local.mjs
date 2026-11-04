// Local-only services; leaves private hosted-provider settings in .env untouched.
import 'dotenv/config';
import { execFileSync, spawn } from 'node:child_process';
const database = new URL(process.env.DATABASE_URL || 'postgresql://localhost:5432/medivault');
if (!['localhost', '127.0.0.1'].includes(database.hostname)) throw new Error('dev:local requires a local DATABASE_URL.');
const container = JSON.parse(execFileSync('docker', ['inspect', 'medivault-minio-1'], { encoding: 'utf8' }))[0];
const vars = Object.fromEntries(container.Config.Env.map((entry) => { const i = entry.indexOf('='); return [entry.slice(0, i), entry.slice(i + 1)]; }));
const env = { ...process.env, DATABASE_URL: database.toString(), API_PORT: '3001',
  VITE_API_BASE_URL: 'http://localhost:3001', VITE_ENABLE_MOCK_AUTH: 'false', ALLOWED_ORIGINS: 'http://localhost:5177,http://127.0.0.1:5177',
  S3_ENDPOINT: 'http://localhost:9000', S3_BUCKET: 'medivault-documents', S3_REGION: 'us-east-1',
  S3_ACCESS_KEY: vars.MINIO_ROOT_USER, S3_SECRET_KEY: vars.MINIO_ROOT_PASSWORD,
  AI_BASE_URL: 'http://localhost:11434/v1', AI_MODEL: process.env.LOCAL_AI_MODEL || 'qwen2.5vl:7b', AI_API_KEY: '', GEMINI_API_KEY: '',
  AI_INTENT_MODEL: 'llama3.2:1b', AI_TIMEOUT_MS: '120000',
  EMBEDDING_BASE_URL: 'http://localhost:11434/v1', EMBEDDING_MODEL: 'nomic-embed-text', EMBEDDING_API_KEY: '', EMBEDDING_DIMENSIONS: '768' };
const children = [
  spawn(process.execPath, ['server/src/index.js'], { env, stdio: 'inherit' }),
  spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', 'localhost', '--port', '5177', '--strictPort'], { env, stdio: 'inherit' }),
];
let closing = false;
function stop() { if (closing) return; closing = true; for (const child of children) child.kill('SIGTERM'); }
process.on('SIGINT', stop); process.on('SIGTERM', stop);
for (const child of children) child.on('exit', (code) => { if (code && !closing) process.exitCode = code; stop(); });
console.log('Local MediVault: http://localhost:5177 (API :3001, MinIO :9000, Ollama :11434)');
