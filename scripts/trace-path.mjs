import { google } from 'googleapis';
import { JWT } from 'google-auth-library';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const clean = v => v?.trim().replace(/^"|"$/g, '').replace(/\\n/g, '\n');
const auth = new JWT({
  email: clean(process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL),
  key: clean(process.env.GOOGLE_PRIVATE_KEY),
  scopes: ['https://www.googleapis.com/auth/drive']
});
const drive = google.drive({ version: 'v3', auth });

async function findFileByName(name, folderId) {
    const q = `'${folderId}' in parents and name = '${name}' and trashed = false`;
    const res = await drive.files.list({
        q, fields: 'files(id, name)', includeItemsFromAllDrives: true, supportsAllDrives: true
    });
    return res.data.files;
}

const ROOT_ID = '1_yrnx1prka7ubm0Lt2EYOXWvd2fB3xuv';

async function trace() {
    console.log('Tracing path from ROOT:', ROOT_ID);
    
    console.log('\n--- under ROOT ---');
    const rootFiles = await findFileByName('', ROOT_ID); // actually this q is invalid, let's list all
    const resAll = await drive.files.list({ q: `'${ROOT_ID}' in parents and trashed = false`, includeItemsFromAllDrives: true, supportsAllDrives: true });
    resAll.data.files.forEach(f => console.log(`  ${f.name} (${f.id})`));

    const rec = await findFileByName('recording', ROOT_ID);
    if (rec.length === 0) { console.log('ERROR: recording NOT FOUND under ROOT'); return; }
    console.log(`\nFound recording: ${rec[0].id} (count: ${rec.length})`);

    const idx = await findFileByName('indexes', rec[0].id);
    if (idx.length === 0) { console.log('ERROR: indexes NOT FOUND under recording'); return; }
    console.log(`Found indexes: ${idx[0].id} (count: ${idx.length})`);

    const survey = await findFileByName('2026-02', idx[0].id);
    if (survey.length === 0) { console.log('ERROR: 2026-02 NOT FOUND under indexes'); return; }
    console.log(`Found 2026-02: ${survey[0].id} (count: ${survey.length})`);

    const manifest = await findFileByName('manifest.json', survey[0].id);
    if (manifest.length === 0) { console.log('ERROR: manifest.json NOT FOUND under 2026-02'); return; }
    console.log(`Found manifest.json: ${manifest[0].id} (count: ${manifest.length})`);
    
    const content = await drive.files.get({ fileId: manifest[0].id, alt: 'media' });
    console.log('\nManifest Content Header:', JSON.stringify(content.data).slice(0, 200));
}

trace().catch(console.error);
