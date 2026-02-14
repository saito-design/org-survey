import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const questionsPath = path.join(__dirname, '../questions/questions.json');
const mappingPath = path.join(__dirname, '../questions/question_id_mapping.json');

const questions = JSON.parse(fs.readFileSync(questionsPath, 'utf-8'));
const mapping = JSON.parse(fs.readFileSync(mappingPath, 'utf-8'));

// question_id → mgmt_no, category のマップを作成
const qidToMgmt = {};
mapping.forEach(m => {
  if (m.MANAGER) qidToMgmt[m.MANAGER] = { mgmt_no: m.mgmt_no, category: m.category };
  if (m.STAFF) qidToMgmt[m.STAFF] = { mgmt_no: m.mgmt_no, category: m.category };
  if (m.PA) qidToMgmt[m.PA] = { mgmt_no: m.mgmt_no, category: m.category };
});

console.log('=== 現在の設問と正しい管理Noの対応 ===');
console.log('question_id        | 現element_id | 正mgmt_no | カテゴリ');
console.log('-'.repeat(90));

let fixCount = 0;
const fixes = [];

questions.questions.forEach(q => {
  const correct = qidToMgmt[q.question_id];
  if (!correct) {
    console.log(`${q.question_id.padEnd(18)} | ${String(q.element_id).padEnd(12)} | マッピングなし`);
    return;
  }

  const needsFix = String(q.element_id) !== String(correct.mgmt_no);
  if (needsFix) {
    console.log(`${q.question_id.padEnd(18)} | ${String(q.element_id).padEnd(12)} | ${String(correct.mgmt_no).padEnd(9)} | ${correct.category}`);
    fixes.push({ qid: q.question_id, from: q.element_id, to: correct.mgmt_no });
    fixCount++;
  }
});

console.log('');
console.log(`修正が必要な設問数: ${fixCount}`);
console.log('');

// 修正を適用
if (fixCount > 0) {
  console.log('=== 修正を適用中... ===');

  // questions配列を更新
  questions.questions.forEach(q => {
    const correct = qidToMgmt[q.question_id];
    if (correct) {
      q.element_id = String(correct.mgmt_no);
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

  // バックアップを作成
  const backupPath = questionsPath.replace('.json', '.backup.json');
  fs.writeFileSync(backupPath, fs.readFileSync(questionsPath));
  console.log(`バックアップ作成: ${backupPath}`);

  // 保存
  fs.writeFileSync(questionsPath, JSON.stringify(questions, null, 2));
  console.log(`修正完了: ${questionsPath}`);
}

// 管理Noから因子を判定（PPTXの構造に基づく）
function getFactor(mgmtNo) {
  // コンセプト1: 組織活性化の源泉 (F1) - 会社満足度、職務満足度関連
  // コンセプト2: 収益性向上に繋がるエンゲージメント (F2) - 理念・ビジョン、顧客視点関連
  // コンセプト3: 業績拡大に繋がるチーム力と持続性 (F3) - チーム、貢献、勤続関連

  // 7つのキーカテゴリの因子
  if ([1, 2].includes(mgmtNo)) return 'F1'; // 会社満足度、職務満足度
  if ([3, 4, 8, 9].includes(mgmtNo)) return 'F2'; // 将来像、顧客視点、理念
  if ([5, 6, 7].includes(mgmtNo)) return 'F3'; // 貢献、勤続、チーム

  // その他のカテゴリ（暫定的にF1に割り当て - 後で調整が必要）
  if (mgmtNo >= 10 && mgmtNo <= 30) return 'F1'; // 職務・労働環境関連
  if (mgmtNo >= 31 && mgmtNo <= 50) return 'F1'; // リーダーシップ・関係性
  if (mgmtNo >= 51 && mgmtNo <= 65) return 'F3'; // チーム関連

  return 'F1';
}
