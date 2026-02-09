import { google } from 'googleapis';
import { JWT } from 'google-auth-library';
import { config } from 'dotenv';
import { readFileSync } from 'fs';
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

const rootId = process.env.APP_DATA_ROOT_FOLDER_ID;
console.log('rootId:', rootId);

// setupフォルダを探す
const folders = await drive.files.list({
  q: `'${rootId}' in parents and name = 'setup' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
  fields: 'files(id,name)',
  supportsAllDrives: true,
  includeItemsFromAllDrives: true
});

if (folders.data.files.length === 0) {
  console.error('setupフォルダが見つかりません');
  process.exit(1);
}

const setupId = folders.data.files[0].id;
console.log('setupフォルダID:', setupId);

// 新しいデータを読み込み
const newData = JSON.parse(readFileSync('setup/org_units_new.json', 'utf-8'));
console.log('アップロードする事業所数:', newData.org_units.length);

const { Readable } = await import('stream');

// 新規作成（共有ドライブ対応）
const media = {
  mimeType: 'application/json',
  body: Readable.from([JSON.stringify(newData, null, 2)]),
};

try {
  const created = await drive.files.create({
    requestBody: {
      name: 'org_units.json',
      parents: [setupId],
      mimeType: 'application/json',
    },
    media,
    fields: 'id,name,webViewLink',
    supportsAllDrives: true,
  });

  console.log('org_units.jsonを作成しました:', created.data);
  console.log('完了！');
} catch (e) {
  console.error('作成エラー:', e.message);

  // 既存ファイルを更新する方法を試す
  console.log('既存ファイルの更新を試みます...');

  const files = await drive.files.list({
    q: `'${setupId}' in parents and name = 'org_units.json' and trashed = false`,
    fields: 'files(id,name)',
    supportsAllDrives: true,
    includeItemsFromAllDrives: true
  });

  if (files.data.files.length > 0) {
    const fileId = files.data.files[0].id;
    console.log('既存ファイルID:', fileId);

    const media2 = {
      mimeType: 'application/json',
      body: Readable.from([JSON.stringify(newData, null, 2)]),
    };

    const updated = await drive.files.update({
      fileId,
      media: media2,
      supportsAllDrives: true,
    });

    console.log('org_units.jsonを更新しました:', updated.data);
  }
}
