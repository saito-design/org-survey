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
const SURVEY_ID = '2026-02';

async function run() {
  try {
    // indexes フォルダを探す
    const resIdx = await drive.files.list({
      q: `'${ROOT_ID}' in parents and name = 'recording' and trashed = false`,
      fields: 'files(id)'
    });
    const recordingId = resIdx.data.files[0]?.id;
    if (!recordingId) throw new Error('recording folder not found');

    const resIdx2 = await drive.files.list({
      q: `'${recordingId}' in parents and name = 'indexes' and trashed = false`,
      fields: 'files(id)'
    });
    const indexesId = resIdx2.data.files[0]?.id;
    if (!indexesId) throw new Error('indexes folder not found');

    const resIdx3 = await drive.files.list({
      q: `'${indexesId}' in parents and name = '${SURVEY_ID}' and trashed = false`,
      fields: 'files(id)'
    });
    const surveyIdxId = resIdx3.data.files[0]?.id;
    if (!surveyIdxId) throw new Error(`indexes/${SURVEY_ID} folder not found`);

    const resManifest = await drive.files.list({
      q: `'${surveyIdxId}' in parents and name = 'manifest.json' and trashed = false`,
      fields: 'files(id)'
    });
    const manifestId = resManifest.data.files[0]?.id;
    if (!manifestId) throw new Error('manifest.json not found');

    const content = await drive.files.get({ fileId: manifestId, alt: 'media' });
    const manifest = content.data;
    console.log('Manifest Entries Count:', manifest.entries?.length);
    console.log('First Entry Sample:', JSON.stringify(manifest.entries?.[0], null, 2));
    
    // respondents.json も確認
    const resSetup = await drive.files.list({
      q: `'${ROOT_ID}' in parents and name = 'setup' and trashed = false`,
      fields: 'files(id)'
    });
    const setupId = resSetup.data.files[0]?.id;
    const resR = await drive.files.list({
      q: `'${setupId}' in parents and name = 'respondents.json' and trashed = false`,
      fields: 'files(id)'
    });
    const respondentsId = resR.data.files[0]?.id;
    const contentR = await drive.files.get({ fileId: respondentsId, alt: 'media' });
    console.log('Respondents Count:', contentR.data.respondents?.length);

  } catch (e) {
    console.error(e.message);
  }
}
run();
