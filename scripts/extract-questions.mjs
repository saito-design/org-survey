import { google } from 'googleapis';
import { JWT } from 'google-auth-library';
import { config } from 'dotenv';
import { writeFileSync } from 'fs';
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

const res = await drive.files.get({
  fileId: '1mHiesVLr6LDLxeoNJXzdSCemK2EPJBqD',
  alt: 'media',
  supportsAllDrives: true
}, { responseType: 'text' });

const lines = res.data.split('\n');
const row1 = lines[0].split(','); // 因子名
const row2 = lines[1].split(','); // 設問文
const row3 = lines[2].split(','); // ヘッダー

// メタ列数を特定
let dataStartCol = 0;
for (let i = 0; i < row3.length; i++) {
  if (row3[i].match(/^\d+$/)) {
    dataStartCol = i;
    break;
  }
}

// 設問マッピングを生成
const questions = [];
for (let i = dataStartCol; i < row3.length; i++) {
  questions.push({
    number: parseInt(row3[i]),
    factor: row1[i] || '',
    text: row2[i] || ''
  });
}

// メタ列名も保存
const metaColumns = row3.slice(0, dataStartCol);

const exportSpec = {
  metaColumns,
  dataStartColumn: dataStartCol,
  questions
};

writeFileSync('questions/csv-export-mapping.json', JSON.stringify(exportSpec, null, 2));
console.log('設問マッピングを questions/csv-export-mapping.json に保存しました');
console.log('メタ列数:', metaColumns.length);
console.log('設問数:', questions.length);
