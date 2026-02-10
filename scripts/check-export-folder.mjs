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
  return clean.replace(/\\n/g, '\n');
}

const auth = new JWT({
  email: cleanEnvVar(process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL),
  key: cleanEnvVar(process.env.GOOGLE_PRIVATE_KEY),
  scopes: ['https://www.googleapis.com/auth/drive'],
});

const drive = google.drive({ version: 'v3', auth });

// 顧客渡し用CSVのファイル
const customerCsvId = '1mHiesVLr6LDLxeoNJXzdSCemK2EPJBqD';

// 現在設定されているエクスポートフォルダ
const exportFolderId = process.env.APP_EXPORT_FOLDER_ID;

console.log('=== 保存先フォルダ確認 ===\n');

// 顧客渡し用CSVの親フォルダを辿る
async function getParentChain(fileId, depth = 0) {
  const res = await drive.files.get({
    fileId,
    fields: 'id,name,parents,mimeType',
    supportsAllDrives: true
  });

  const indent = '  '.repeat(depth);
  console.log(`${indent}${res.data.name} (${res.data.id})`);

  if (res.data.parents && res.data.parents.length > 0) {
    await getParentChain(res.data.parents[0], depth + 1);
  }
}

console.log('顧客渡し用CSVの場所:');
await getParentChain(customerCsvId);

console.log('\n現在のAPP_EXPORT_FOLDER_ID:');
try {
  const exportFolder = await drive.files.get({
    fileId: exportFolderId,
    fields: 'id,name,parents',
    supportsAllDrives: true
  });
  console.log(`  ${exportFolder.data.name} (${exportFolder.data.id})`);

  if (exportFolder.data.parents && exportFolder.data.parents.length > 0) {
    console.log('  親フォルダ:');
    await getParentChain(exportFolder.data.parents[0], 2);
  }
} catch (e) {
  console.log('  エラー:', e.message);
}

// 顧客渡し用CSVの親フォルダ（2026-02）の親を取得
console.log('\n顧客渡し用CSVの親フォルダ（2026-02）の親:');
const csvFile = await drive.files.get({
  fileId: customerCsvId,
  fields: 'parents',
  supportsAllDrives: true
});
const surveyFolderId = csvFile.data.parents[0]; // 2026-02

const surveyFolder = await drive.files.get({
  fileId: surveyFolderId,
  fields: 'id,name,parents',
  supportsAllDrives: true
});
console.log(`  ${surveyFolder.data.name} (${surveyFolder.data.id})`);

if (surveyFolder.data.parents && surveyFolder.data.parents.length > 0) {
  const targetFolderId = surveyFolder.data.parents[0];
  const targetFolder = await drive.files.get({
    fileId: targetFolderId,
    fields: 'id,name',
    supportsAllDrives: true
  });
  console.log(`  親: ${targetFolder.data.name} (${targetFolderId})`);
  console.log(`\n==> APP_EXPORT_FOLDER_IDを「${targetFolderId}」に設定すべき`);
}
