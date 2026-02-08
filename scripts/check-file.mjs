import { google } from 'googleapis';
import { JWT } from 'google-auth-library';
import { config } from 'dotenv';
config({ path: '.env.local' });

function cleanEnvVar(val) {
  if (!val) return undefined;
  let clean = val.trim();
  if (clean.startsWith('"') && clean.endsWith('"')) {
    clean = clean.substring(1, clean.length - 1);
  }
  return clean.replace(/\n/g, '\n');
}

const auth = new JWT({
  email: cleanEnvVar(process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL),
  key: cleanEnvVar(process.env.GOOGLE_PRIVATE_KEY),
  scopes: ['https://www.googleapis.com/auth/drive'],
});

const drive = google.drive({ version: 'v3', auth });

// 親フォルダの情報を取得
const folderId = '1OJDIDNN3RoDaB1bWIb98GiOUhLRsrC5K';

try {
  const folder = await drive.files.get({
    fileId: folderId,
    fields: 'id,name,parents',
    supportsAllDrives: true
  });
  console.log('親フォルダ:', folder.data.name);
  
  // フォルダ内のファイル一覧
  const files = await drive.files.list({
    q: `'${folderId}' in parents and trashed = false`,
    fields: 'files(id,name,mimeType,size)',
    supportsAllDrives: true,
    includeItemsFromAllDrives: true
  });
  console.log('\nフォルダ内のファイル:');
  files.data.files.forEach(f => console.log(`  - ${f.name} (${f.mimeType})`));
} catch (e) {
  console.error('Error:', e.message);
}
