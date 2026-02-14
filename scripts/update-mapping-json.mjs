import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const mappingPath = path.join(__dirname, '../questions/question_id_mapping.json');
const questionsPath = path.join(__dirname, '../questions/questions.json');

const mapping = JSON.parse(fs.readFileSync(mappingPath, 'utf-8'));
const questions = JSON.parse(fs.readFileSync(questionsPath, 'utf-8'));

// 設問番号 → mgmt_no のマップ（MANAGERベース）
const numToMgmt = {};
mapping.forEach(m => {
  if (m.MANAGER) {
    const num = m.MANAGER.replace('MANAGER-Q', '');
    numToMgmt[num] = m.mgmt_no;
  }
});

// 各設問のquestion_idからelement_id（= mgmt_no）を取得
const qidToMgmt = {};
questions.questions.forEach(q => {
  qidToMgmt[q.question_id] = parseInt(q.element_id);
});

console.log('=== question_id_mapping.json にSTAFF/PA設問を追加 ===');
let addedCount = 0;

mapping.forEach(m => {
  const num = m.MANAGER ? m.MANAGER.replace('MANAGER-Q', '') : null;

  // STAFF設問を追加
  if (m.STAFF === null && num) {
    const staffQid = 'STAFF-Q' + num;
    const q = questions.questions.find(x => x.question_id === staffQid);
    if (q && parseInt(q.element_id) === m.mgmt_no) {
      m.STAFF = staffQid;
      console.log('追加: mgmt_no ' + m.mgmt_no + ' ← ' + staffQid);
      addedCount++;
    }
  }

  // PA設問を追加
  if (m.PA === null && num) {
    const paQid = 'PA-Q' + num;
    const q = questions.questions.find(x => x.question_id === paQid);
    if (q && parseInt(q.element_id) === m.mgmt_no) {
      m.PA = paQid;
      console.log('追加: mgmt_no ' + m.mgmt_no + ' ← ' + paQid);
      addedCount++;
    }
  }
});

// バックアップを作成
const backupPath = mappingPath.replace('.json', '.backup.json');
fs.writeFileSync(backupPath, fs.readFileSync(mappingPath));
console.log('\nバックアップ作成: ' + backupPath);

// 保存
fs.writeFileSync(mappingPath, JSON.stringify(mapping, null, 2));
console.log('保存完了: ' + mappingPath);
console.log('追加件数: ' + addedCount);
