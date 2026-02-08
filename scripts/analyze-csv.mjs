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

console.log('=== CSV仕様分析 ===\n');
console.log('総列数:', row3.length);
console.log('\n--- 3行ヘッダー構造 ---\n');

// メタ列とデータ列を分析
let dataStartCol = 0;
for (let i = 0; i < row3.length; i++) {
  if (row3[i].match(/^\d+$/)) {
    dataStartCol = i;
    break;
  }
}

console.log('メタデータ列 (0-' + (dataStartCol-1) + '):');
for (let i = 0; i < dataStartCol; i++) {
  console.log('  ' + i + ': ' + row3[i]);
}

console.log('\n回答データ列 (' + dataStartCol + '-' + (row3.length-1) + '):');
console.log('  設問数:', row3.length - dataStartCol);
console.log('  最初の5設問:');
for (let i = dataStartCol; i < Math.min(dataStartCol + 5, row3.length); i++) {
  const qText = row2[i] ? row2[i].substring(0, 40) : '';
  console.log('    列' + i + ': 番号=' + row3[i] + ', 因子=' + row1[i] + ', 設問=' + qText + '...');
}

// 仕様をJSONで出力
const spec = {
  totalColumns: row3.length,
  metaColumns: row3.slice(0, dataStartCol),
  dataStartColumn: dataStartCol,
  questionCount: row3.length - dataStartCol,
  headerRows: {
    row1_factors: row1.slice(dataStartCol, dataStartCol + 10),
    row2_questions: row2.slice(dataStartCol, dataStartCol + 10),
    row3_numbers: row3.slice(dataStartCol, dataStartCol + 10)
  }
};

writeFileSync('docs/csv-export-spec.json', JSON.stringify(spec, null, 2));
console.log('\n仕様をdocs/csv-export-spec.jsonに保存しました');
