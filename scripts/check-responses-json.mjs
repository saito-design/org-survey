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

const FILE_ID = '1N2G5GaSGY5DP30Gf91-bln2jARbHUBXl';

async function run() {
  try {
    const res = await drive.files.get({
      fileId: FILE_ID,
      alt: 'media',
      supportsAllDrives: true
    });
    const data = res.data;
    console.log('Type of data:', typeof data);
    console.log('Keys in data:', Object.keys(data));
    console.log('Number of responses:', data.responses?.length);
    if (data.responses && data.responses.length > 0) {
        console.log('First response sample:', JSON.stringify(data.responses[0], null, 2));
    }
  } catch (e) {
    console.error(e.message);
  }
}
run();
