import { google } from 'googleapis';
import { JWT } from 'google-auth-library';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

function cleanEnvVar(val) {
  if (!val) return undefined;
  let clean = val.trim();
  if (clean.startsWith('"') && clean.endsWith('"')) {
    clean = clean.substring(1, clean.length - 1);
  }
  return clean.replace(/\\n/g, '\n');
}

async function run() {
  const auth = new JWT({
    email: cleanEnvVar(process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL),
    key: cleanEnvVar(process.env.GOOGLE_PRIVATE_KEY),
    scopes: ['https://www.googleapis.com/auth/drive'],
  });
  
  const drive = google.drive({ version: 'v3', auth });
  try {
    const res = await drive.files.list({ pageSize: 1 });
    console.log('Drive API Success! Files count:', res.data.files.length);
  } catch (err) {
    console.error('Drive API Error:', err.message);
    process.exit(1);
  }
}

run();
