import { google } from 'googleapis';
import { JWT } from 'google-auth-library';
import { config } from 'dotenv';
import { Readable } from 'stream';
config({ path: '.env.local' });

function cleanEnvVar(val) {
  if (!val) return undefined;
  let clean = val.trim();
  if (clean.startsWith('"') && clean.endsWith('"')) {
    clean = clean.substring(1, clean.length - 1);
  }
  return clean.replace(/\\n/g, '\n');
}

const auth = new JWT({
  email: cleanEnvVar(process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL),
  key: cleanEnvVar(process.env.GOOGLE_PRIVATE_KEY),
  scopes: ['https://www.googleapis.com/auth/drive'],
});

const drive = google.drive({ version: 'v3', auth });

const exportFolderId = process.env.APP_EXPORT_FOLDER_ID;
const surveyId = '2026-02';
const testCsv = 'テスト,データ\n1,2';
const fileName = 'テスト_' + Date.now() + '.csv';

console.log('=== CSV保存テスト ===\n');
console.log('APP_EXPORT_FOLDER_ID:', exportFolderId);

async function findOrCreateFolder(name, parentId) {
  // 既存フォルダを検索
  const res = await drive.files.list({
    q: `'${parentId}' in parents and name = '${name}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
    fields: 'files(id,name)',
    supportsAllDrives: true,
    includeItemsFromAllDrives: true
  });

  if (res.data.files.length > 0) {
    console.log(`  フォルダ「${name}」が見つかりました: ${res.data.files[0].id}`);
    return res.data.files[0].id;
  }

  // 新規作成
  console.log(`  フォルダ「${name}」を作成します...`);
  const created = await drive.files.create({
    requestBody: {
      name: name,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parentId],
    },
    fields: 'id',
    supportsAllDrives: true,
  });
  console.log(`  作成完了: ${created.data.id}`);
  return created.data.id;
}

try {
  // 1. CSV出力フォルダを作成/取得
  console.log('\n1. CSV出力フォルダを確認...');
  const csvOutputFolderId = await findOrCreateFolder('CSV出力', exportFolderId);

  // 2. surveyIdフォルダを作成/取得
  console.log('\n2. surveyIdフォルダを確認...');
  const surveyFolderId = await findOrCreateFolder(surveyId, csvOutputFolderId);

  // 3. CSVファイルを作成
  console.log('\n3. CSVファイルを作成...');
  const media = {
    mimeType: 'text/csv',
    body: Readable.from([Buffer.from('\ufeff' + testCsv, 'utf-8')]),
  };

  const created = await drive.files.create({
    requestBody: {
      name: fileName,
      parents: [surveyFolderId],
      mimeType: 'text/csv',
    },
    media,
    fields: 'id,name,webViewLink',
    supportsAllDrives: true,
  });

  console.log('  CSVファイル作成完了:', created.data);
  console.log('\n=== 成功 ===');

} catch (e) {
  console.error('\n=== エラー ===');
  console.error(e.message);
  if (e.errors) {
    console.error('詳細:', JSON.stringify(e.errors, null, 2));
  }
}
