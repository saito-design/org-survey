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

const rootId = process.env.APP_DATA_ROOT_FOLDER_ID;

// setupフォルダを探す
const folders = await drive.files.list({
  q: `'${rootId}' in parents and name = 'setup' and mimeType = 'application/vnd.google-apps.folder'`,
  fields: 'files(id,name)',
  supportsAllDrives: true,
  includeItemsFromAllDrives: true
});

const setupId = folders.data.files[0].id;

// org_units.jsonを探す
const files = await drive.files.list({
  q: `'${setupId}' in parents and name = 'org_units.json'`,
  fields: 'files(id,name)',
  supportsAllDrives: true,
  includeItemsFromAllDrives: true
});

const res = await drive.files.get({
  fileId: files.data.files[0].id,
  alt: 'media',
  supportsAllDrives: true
});

console.log('OrgUnitsの最初の2件:');
const data = res.data;
const units = data.org_units || data;
console.log(JSON.stringify(units.slice(0, 2), null, 2));
