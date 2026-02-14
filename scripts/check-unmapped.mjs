import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const questionsPath = path.join(__dirname, '../questions/questions.backup.json');
const mappingPath = path.join(__dirname, '../questions/question_id_mapping.json');

const questions = JSON.parse(fs.readFileSync(questionsPath, 'utf-8'));
const mapping = JSON.parse(fs.readFileSync(mappingPath, 'utf-8'));

// question_id → mgmt_no のマップ（既存）
const qidToMgmt = {};
mapping.forEach(m => {
  if (m.MANAGER) qidToMgmt[m.MANAGER] = m.mgmt_no;
  if (m.STAFF) qidToMgmt[m.STAFF] = m.mgmt_no;
  if (m.PA) qidToMgmt[m.PA] = m.mgmt_no;
});

// マッピングなしのSTAFF/PA設問を抽出
const unmappedStaff = questions.questions.filter(q =>
  q.question_id.startsWith('STAFF-') && qidToMgmt[q.question_id] === undefined
);
const unmappedPA = questions.questions.filter(q =>
  q.question_id.startsWith('PA-') && qidToMgmt[q.question_id] === undefined
);

console.log('=== マッピングなしのSTAFF設問 ===');
unmappedStaff.forEach(q => {
  console.log(`${q.question_id} | ${q.text.slice(0, 60)}`);
});

console.log('\n=== マッピングなしのPA設問 ===');
unmappedPA.forEach(q => {
  console.log(`${q.question_id} | ${q.text.slice(0, 60)}`);
});

console.log(`\nSTAFF未マッピング: ${unmappedStaff.length}問`);
console.log(`PA未マッピング: ${unmappedPA.length}問`);

// MANAGER設問と比較して対応を推測
console.log('\n=== MANAGER設問との対応推測 ===');

// 同じ設問番号（Q01, Q02など）で対応を推測
const managerQuestions = questions.questions.filter(q => q.question_id.startsWith('MANAGER-'));

unmappedStaff.forEach(sq => {
  const num = sq.question_id.replace('STAFF-', '');
  const mq = managerQuestions.find(m => m.question_id === `MANAGER-${num}`);
  const mgmtNo = mq ? qidToMgmt[`MANAGER-${num}`] : null;
  console.log(`${sq.question_id} → MANAGER-${num} → mgmt_no: ${mgmtNo || '不明'}`);
});
