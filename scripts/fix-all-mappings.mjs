import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const questionsPath = path.join(__dirname, '../questions/questions.json');
const questionsBackupPath = path.join(__dirname, '../questions/questions.backup.json');
const mappingPath = path.join(__dirname, '../questions/question_id_mapping.json');

// バックアップから読み込み（元のelement_id情報を保持）
const questionsBackup = JSON.parse(fs.readFileSync(questionsBackupPath, 'utf-8'));
const mapping = JSON.parse(fs.readFileSync(mappingPath, 'utf-8'));

// MANAGER設問番号 → mgmt_no のマップを作成
const managerNumToMgmt = {};
mapping.forEach(m => {
  if (m.MANAGER) {
    const num = m.MANAGER.replace('MANAGER-Q', '');
    managerNumToMgmt[num] = m.mgmt_no;
  }
});

// 全question_id → mgmt_no のマップを作成
const qidToMgmt = {};

// 既存のマッピングを登録
mapping.forEach(m => {
  if (m.MANAGER) qidToMgmt[m.MANAGER] = m.mgmt_no;
  if (m.STAFF) qidToMgmt[m.STAFF] = m.mgmt_no;
  if (m.PA) qidToMgmt[m.PA] = m.mgmt_no;
});

// STAFF/PA設問で未マッピングのものを、対応するMANAGER設問の管理Noで補完
questionsBackup.questions.forEach(q => {
  if (qidToMgmt[q.question_id] !== undefined) return; // 既にマッピング済み

  let num;
  if (q.question_id.startsWith('STAFF-Q')) {
    num = q.question_id.replace('STAFF-Q', '');
  } else if (q.question_id.startsWith('PA-Q')) {
    num = q.question_id.replace('PA-Q', '');
  }

  if (num && managerNumToMgmt[num]) {
    qidToMgmt[q.question_id] = managerNumToMgmt[num];
    console.log(`補完: ${q.question_id} → mgmt_no: ${managerNumToMgmt[num]}`);
  }
});

// 特殊ケース: MANAGER-Q58 がマッピングなし → 管理No 62「共通の目的」に対応と推測
// Q57とQ58は両方「チーム目標」関連。Q57→63、Q58は62に割り当て
if (!qidToMgmt['MANAGER-Q58']) {
  qidToMgmt['MANAGER-Q58'] = 62;
  console.log('補完: MANAGER-Q58 → mgmt_no: 62 (共通の目的)');
}
if (!qidToMgmt['STAFF-Q58']) {
  qidToMgmt['STAFF-Q58'] = 62;
  console.log('補完: STAFF-Q58 → mgmt_no: 62 (共通の目的)');
}

console.log('\n=== questions.json を修正 ===');

// questions配列を更新
const questions = JSON.parse(fs.readFileSync(questionsBackupPath, 'utf-8'));
let fixedCount = 0;
let unfixedCount = 0;

questions.questions.forEach(q => {
  const mgmtNo = qidToMgmt[q.question_id];
  if (mgmtNo !== undefined) {
    q.element_id = String(mgmtNo);
    fixedCount++;
  } else {
    console.log(`未解決: ${q.question_id}`);
    unfixedCount++;
  }
});

// elements配列を管理Noカテゴリで再構築
const newElements = mapping.map(m => ({
  element_id: String(m.mgmt_no),
  element_name: m.category,
  factor_id: getFactor(m.mgmt_no),
  order: m.mgmt_no
}));

questions.elements = newElements;

// 保存
fs.writeFileSync(questionsPath, JSON.stringify(questions, null, 2));
console.log(`\n修正完了: ${fixedCount}問`);
console.log(`未解決: ${unfixedCount}問`);

// 管理Noから因子を判定
function getFactor(mgmtNo) {
  // PPTXスライド4-5に基づく分類
  // F1: 組織活性化の源泉（会社満足度、職務満足度 + 関連サブカテゴリ）
  // F2: 収益性向上に繋がるエンゲージメント（理念・ビジョン、顧客視点 + 関連サブカテゴリ）
  // F3: 業績拡大に繋がるチーム力と持続性（チーム、貢献、勤続 + 関連サブカテゴリ）

  // 7つのキーカテゴリ
  if (mgmtNo === 1 || mgmtNo === 2) return 'F1'; // 会社満足度、職務満足度
  if (mgmtNo === 3 || mgmtNo === 4) return 'F2'; // 将来像への期待、顧客視点意識
  if (mgmtNo >= 5 && mgmtNo <= 7) return 'F3';  // 貢献意欲、勤続意思、効果的チーム

  // 理念・ビジョン関連 → F2
  if (mgmtNo === 8 || mgmtNo === 9) return 'F2';

  // 職務・評価・労働環境関連 → F1
  if (mgmtNo >= 10 && mgmtNo <= 30) return 'F1';

  // リーダーシップ・関係性関連 → F1
  if (mgmtNo >= 31 && mgmtNo <= 45) return 'F1';

  // 顧客対応・従業員特性関連 → F2
  if (mgmtNo >= 46 && mgmtNo <= 50) return 'F2';

  // チーム関連 → F3
  if (mgmtNo >= 51 && mgmtNo <= 65) return 'F3';

  return 'F1';
}
