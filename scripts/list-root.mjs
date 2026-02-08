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

const ROOT_ID = '1_yrnx1prka7ubm0Lt2EYOXWvd2fB3xuv';

async function run() {
  const res = await drive.files.list({
    q: `'${ROOT_ID}' in parents and trashed = false`,
    fields: 'files(id, name, mimeType)',
    includeItemsFromAllDrives: true,
    supportsAllDrives: true
  });
  console.log(JSON.stringify(res.data.files, null, 2));
}
run();
