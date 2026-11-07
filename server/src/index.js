import 'dotenv/config';          // load .env BEFORE anything else
import { testConnection } from './db.js';
import { ensureBucket, isStorageConfigured } from './storage.js';
import app from './app.js';

const port = Number(process.env.API_PORT || 3001);
const host = process.env.API_HOST || '0.0.0.0';

async function start() {
  // Verify DB connection before accepting requests
  const dbOk = await testConnection();
  if (!dbOk) {
    console.error('❌  Could not connect to database. Check DATABASE_URL in .env');
    process.exit(1);
  }
  console.log('✅  Database connection verified');

  // Ensure the S3/MinIO bucket exists
  if (isStorageConfigured()) {
    try {
      await ensureBucket();
    } catch (err) {
      console.warn('⚠️  Storage bucket setup failed (is MinIO running? `docker compose up -d`):', err.message);
    }
  } else {
    console.warn('⚠️  S3_ACCESS_KEY / S3_SECRET_KEY not set — file uploads will fail. Add them to .env');
  }

  app.listen(port, host, () => {
    console.log(`✅  WellNest API running on http://${host}:${port}`);
  });
}

start().catch((err) => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});
