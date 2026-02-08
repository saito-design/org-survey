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

async function check(id, name) {
  console.log(`\n--- ${name} (${id}) ---`);
  const res = await drive.files.list({
    q: `'${id}' in parents and trashed = false`,
    fields: 'files(id, name, mimeType)',
    includeItemsFromAllDrives: true,
    supportsAllDrives: true
  });
  if (res.data.files.length === 0) {
    console.log('  (empty)');
  }
  for (const f of res.data.files) {
    console.log(`  ${f.name} (${f.mimeType}) [${f.id}]`);
    if (f.mimeType === 'application/vnd.google-apps.folder') {
      const subRes = await drive.files.list({
        q: `'${f.id}' in parents and trashed = false`,
        fields: 'files(id, name, mimeType)',
        includeItemsFromAllDrives: true,
        supportsAllDrives: true
      });
      subRes.data.files.forEach(sf => console.log(`    -> ${sf.name} (${sf.mimeType})`));
    }
  }
}

(async () => {
  try {
    // ユーザー指定のフォルダを直接チェック
    await check('1_yrnx1prka7ubm0Lt2EYOXWvd2fB3xuv', '株式会社サンプル');
  } catch (e) {
    console.error(e);
  }
})();
