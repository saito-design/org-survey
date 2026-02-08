import { google } from 'googleapis';
import { JWT } from 'google-auth-library';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { Readable } from 'stream';

dotenv.config({ path: '.env.local' });

// --- Utils ---
const cleanEnvVar = (val) => {
  if (!val) return undefined;
  let clean = val.trim();
  if (clean.startsWith('"') && clean.endsWith('"')) {
    clean = clean.substring(1, clean.length - 1);
  }
  return clean.replace(/\\n/g, '\n');
};

const hashPassword = (password) => {
  return crypto.createHash('sha256').update(password).digest('hex');
};

const uuid = () => crypto.randomUUID();

// --- Auth ---
const auth = new JWT({
  email: cleanEnvVar(process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL),
  key: cleanEnvVar(process.env.GOOGLE_PRIVATE_KEY),
  scopes: ['https://www.googleapis.com/auth/drive'],
});
const drive = google.drive({ version: 'v3', auth });

// --- Drive Helpers ---
async function findFileByName(name, parentId) {
  const query = `'${parentId}' in parents and name = '${name}' and trashed = false`;
  const res = await drive.files.list({
    q: query,
    fields: 'files(id, name, mimeType)',
    includeItemsFromAllDrives: true,
    supportsAllDrives: true,
  });
  return res.data.files[0] || null;
}

async function ensureFolder(name, parentId) {
  const existing = await findFileByName(name, parentId);
  if (existing) return existing.id;
  const res = await drive.files.create({
    requestBody: { name, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] },
    fields: 'id',
    supportsAllDrives: true,
  });
  return res.data.id;
}

async function saveJsonFile(data, filename, folderId) {
  const content = JSON.stringify(data, null, 2);
  const existing = await findFileByName(filename, folderId);
  const media = { mimeType: 'application/json', body: Readable.from([content]) };
  if (existing) {
    await drive.files.update({ fileId: existing.id, media, supportsAllDrives: true });
    return existing.id;
  } else {
    const res = await drive.files.create({
      requestBody: { name: filename, parents: [folderId], mimeType: 'application/json' },
      media,
      fields: 'id',
      supportsAllDrives: true,
    });
    return res.data.id;
  }
}

function parseCSV(csvText) {
  const lines = csvText.trim().split('\n');
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
  return lines.slice(1).map(line => {
    const values = line.split(',').map(v => v.trim().replace(/^"|"$/g, ''));
    const row = {};
    headers.forEach((h, i) => { row[h] = values[i] || ''; });
    return row;
  });
}

// --- Main ---
const ROOT_ID = '1_yrnx1prka7ubm0Lt2EYOXWvd2fB3xuv';
const SURVEY_ID = '2026-02';

async function run() {
  console.log('Starting import process...');

  // 1. マスターデータの読み込み
  const orgCSV = fs.readFileSync('clients/組織構成_ダミー.csv', 'utf-8');
  const resCSV = fs.readFileSync('clients/対象者リスト_ダミー.csv', 'utf-8');
  const orgRows = parseCSV(orgCSV);
  const resRows = parseCSV(resCSV);

  const roleMap = {
    '店長': 'MANAGER',
    'MANAGER': 'MANAGER',
    '社員': 'STAFF',
    'STAFF': 'STAFF',
    'PA': 'PA',
    'パート': 'PA',
    'アルバイト': 'PA',
    'パート･アルバイト': 'PA'
  };

  const orgUnits = orgRows.map(row => ({
    store_code: row['事業所コード'] || row['store_code'],
    store_name: row['事業所名'] || row['store_name'],
    active: true,
    area: row['エリア名'] || row['area'],
    manager: row['管理者名'] || row['manager'],
    business_type: row['業態名'] || row['business_type'],
    dept: row['事業部名'] || row['dept'],
    section: row['課名'] || row['section'],
  }));

  const respondents = resRows.map(row => {
    const roleKey = row['役職区分'] || row['役職'] || 'STAFF';
    return {
      respondent_id: row['対象者ID'] || row['respondent_id'] || `R${row['社員番号']}`,
      emp_no: row['社員番号'] || row['emp_no'],
      password_hash: hashPassword(row['社員番号'] || ''),
      role: roleMap[roleKey] || 'STAFF',
      store_code: row['事業所コード'] || row['store_code'],
      name: row['氏名'] || row['name'] || undefined,
      join_year: row['入社年'] ? parseInt(row['入社年']) : undefined,
      gender: row['性別'] || undefined,
      active: true,
    };
  });

  // 2. 設問データの読み込み (回答生成用)
  const questionsData = JSON.parse(fs.readFileSync('questions/questions.json', 'utf-8'));
  const questions = questionsData.questions;

  // 3. Drive フォルダの準備
  const setupDir = await ensureFolder('setup', ROOT_ID);
  const recordingDir = await ensureFolder('recording', ROOT_ID);
  const respDir = await ensureFolder('responses', recordingDir);
  const surveyDir = await ensureFolder(SURVEY_ID, respDir);
  const byRespondentDir = await ensureFolder('by_respondent', surveyDir);
  const indexDir = await ensureFolder('indexes', recordingDir);
  const surveyIndexDir = await ensureFolder(SURVEY_ID, indexDir);

  // 4. マスターのアップロード
  await saveJsonFile({ org_units: orgUnits, updated_at: new Date().toISOString() }, 'org_units.json', setupDir);
  await saveJsonFile({ respondents, updated_at: new Date().toISOString() }, 'respondents.json', setupDir);
  console.log(`Uploaded masters: ${orgUnits.length} units, ${respondents.length} respondents.`);

  // 5. ダミー回答の生成とアップロード & Manifest 保存
  const now = new Date().toISOString();
  const allResponses = [];
  const respondentResponses = [];

  console.log('Generating responses in memory...');
  for (const r of respondents) {
    const roleQuestions = questions.filter(q => q.roles.includes(r.role));
    // 店舗ごとに多少スコアを変える
    const base = 3.5 + (parseInt(r.store_code) % 10) * 0.1;
    
    const responses = roleQuestions.map(q => ({
      response_id: uuid(),
      survey_id: SURVEY_ID,
      respondent_id: r.respondent_id,
      question_id: q.question_id,
      value: Math.max(1, Math.min(5, Math.round(base + (Math.random() - 0.5) * 3))),
      created_at: now,
      submitted_at: now,
    }));

    allResponses.push(...responses);
    respondentResponses.push({ respondent_id: r.respondent_id, responses });
  }

  // 先に一括回答ファイルを保存（これが本番での集計のベースになる）
  console.log('Uploading consolidated responses.json...');
  await saveJsonFile({ responses: allResponses, updated_at: now }, 'responses.json', surveyDir);
  
  // Manifest は空で保存（新規回答用として空けておく）
  await saveJsonFile({ entries: [], updated_at: now }, 'manifest.json', surveyIndexDir);

  console.log('Uploading individual response files (for personal view)...');
  let count = 0;
  for (const item of respondentResponses) {
    await saveJsonFile({ responses: item.responses, updated_at: now }, `${item.respondent_id}.json`, byRespondentDir);
    count++;
    if (count % 50 === 0) console.log(`Processed ${count} individual files...`);
  }
  
  console.log('Import complete! All data synchronized.');
}

run().catch(console.error);
