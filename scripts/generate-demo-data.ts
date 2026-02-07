/**
 * デモ用データ生成スクリプト
 *
 * 使い方:
 *   npx ts-node scripts/generate-demo-data.ts
 *
 * 生成されるファイル:
 *   - scripts/demo-data/respondents.json
 *   - scripts/demo-data/org_units.json
 *   - scripts/demo-data/responses/{respondent_id}.json
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 設問データを読み込み
const questionsPath = path.join(__dirname, '..', 'questions', 'questions.json');
const questionsData = JSON.parse(fs.readFileSync(questionsPath, 'utf-8'));
const questions = questionsData.questions as Array<{
  question_id: string;
  roles: string[];
}>;

// SHA256ハッシュ
function hashPassword(password: string): string {
  return crypto.createHash('sha256').update(password).digest('hex');
}

// UUID生成
function uuid(): string {
  return crypto.randomUUID();
}

// 店舗データ
const orgUnits = [
  { store_code: '1001', store_name: 'サンプル青山店', area: '関東', manager: '田中', business_type: '居酒屋', active: true },
  { store_code: '1002', store_name: 'サンプル新宿店', area: '関東', manager: '佐藤', business_type: 'ダイニング', active: true },
  { store_code: '1003', store_name: 'サンプル梅田店', area: '関西', manager: '鈴木', business_type: '居酒屋', active: true },
  { store_code: '1004', store_name: 'サンプル心斎橋店', area: '関西', manager: '高橋', business_type: 'カフェ', active: true },
  { store_code: '1005', store_name: 'サンプル栄店', area: '中部', manager: '伊藤', business_type: 'ダイニング', active: true },
];

// 対象者データ生成
interface Respondent {
  respondent_id: string;
  emp_no: string;
  password_hash: string;
  role: 'MANAGER' | 'STAFF' | 'PA';
  store_code: string;
  name: string;
  email: string;
  join_year: number;
  gender: string;
  active: boolean;
  is_admin: boolean;
}

const respondents: Respondent[] = [];
let empCounter = 10001;

const names = {
  MANAGER: ['山田太郎', '佐藤花子', '鈴木一郎', '高橋明美', '伊藤健二'],
  STAFF: ['田中美咲', '渡辺翔太', '小林優子', '中村大輔', '加藤恵子', '吉田誠', '山本理沙', '松本拓海', '井上綾香', '木村隆'],
  PA: ['斎藤結衣', '清水大地', '林美穂', '森田健太', '阿部さくら', '池田悠真', '橋本七海', '藤田陽介', '石井彩花', '前田蓮'],
};

// 各店舗にMANAGER 1名、STAFF 2名、PA 2名
orgUnits.forEach((store, storeIdx) => {
  // MANAGER
  const mgrName = names.MANAGER[storeIdx % names.MANAGER.length];
  const mgrEmpNo = String(empCounter++);
  respondents.push({
    respondent_id: `R${String(respondents.length + 1).padStart(5, '0')}`,
    emp_no: mgrEmpNo,
    password_hash: hashPassword(mgrEmpNo), // パスワード = 社員番号
    role: 'MANAGER',
    store_code: store.store_code,
    name: mgrName,
    email: `user${mgrEmpNo}@example.com`,
    join_year: 2010 + storeIdx,
    gender: storeIdx % 2 === 0 ? '男性' : '女性',
    active: true,
    is_admin: storeIdx === 0, // 最初の店舗のマネージャーのみ管理者
  });

  // STAFF 2名
  for (let i = 0; i < 2; i++) {
    const staffName = names.STAFF[(storeIdx * 2 + i) % names.STAFF.length];
    const staffEmpNo = String(empCounter++);
    respondents.push({
      respondent_id: `R${String(respondents.length + 1).padStart(5, '0')}`,
      emp_no: staffEmpNo,
      password_hash: hashPassword(staffEmpNo),
      role: 'STAFF',
      store_code: store.store_code,
      name: staffName,
      email: `user${staffEmpNo}@example.com`,
      join_year: 2015 + i,
      gender: i % 2 === 0 ? '女性' : '男性',
      active: true,
      is_admin: false,
    });
  }

  // PA 2名
  for (let i = 0; i < 2; i++) {
    const paName = names.PA[(storeIdx * 2 + i) % names.PA.length];
    const paEmpNo = String(empCounter++);
    respondents.push({
      respondent_id: `R${String(respondents.length + 1).padStart(5, '0')}`,
      emp_no: paEmpNo,
      password_hash: hashPassword(paEmpNo),
      role: 'PA',
      store_code: store.store_code,
      name: paName,
      email: `user${paEmpNo}@example.com`,
      join_year: 2020 + i,
      gender: i % 2 === 0 ? '女性' : '男性',
      active: true,
      is_admin: false,
    });
  }
});

// 回答データ生成
interface Response {
  response_id: string;
  survey_id: string;
  respondent_id: string;
  question_id: string;
  value: number;
  created_at: string;
  submitted_at: string;
}

const surveyId = '2026-02';
const now = new Date().toISOString();

function generateResponses(respondent: Respondent): Response[] {
  const roleQuestions = questions.filter(q => q.roles.includes(respondent.role));

  // 店舗ごとにベーススコアを変える（デモ用）
  const storeBaseScore: Record<string, number> = {
    '1001': 4.0,
    '1002': 3.5,
    '1003': 3.8,
    '1004': 3.2,
    '1005': 4.2,
  };
  const base = storeBaseScore[respondent.store_code] || 3.5;

  return roleQuestions.map(q => {
    // ランダムな変動を加える（-1.5 〜 +1.0）
    const variation = (Math.random() - 0.6) * 2.5;
    let value = Math.round(base + variation);
    value = Math.max(1, Math.min(5, value)); // 1-5にクランプ

    return {
      response_id: uuid(),
      survey_id: surveyId,
      respondent_id: respondent.respondent_id,
      question_id: q.question_id,
      value,
      created_at: now,
      submitted_at: now,
    };
  });
}

// 出力ディレクトリ
const outputDir = path.join(__dirname, 'demo-data');
const responsesDir = path.join(outputDir, 'responses', surveyId, 'by_respondent');

// ディレクトリ作成
fs.mkdirSync(responsesDir, { recursive: true });

// respondents.json
fs.writeFileSync(
  path.join(outputDir, 'respondents.json'),
  JSON.stringify({ respondents, updated_at: now }, null, 2)
);
console.log(`Created: respondents.json (${respondents.length} respondents)`);

// org_units.json
fs.writeFileSync(
  path.join(outputDir, 'org_units.json'),
  JSON.stringify({ org_units: orgUnits, updated_at: now }, null, 2)
);
console.log(`Created: org_units.json (${orgUnits.length} stores)`);

// 各対象者の回答データ
let totalResponses = 0;
respondents.forEach(r => {
  const responses = generateResponses(r);
  const filePath = path.join(responsesDir, `${r.respondent_id}.json`);
  fs.writeFileSync(
    filePath,
    JSON.stringify({ responses, updated_at: now }, null, 2)
  );
  totalResponses += responses.length;
});
console.log(`Created: ${respondents.length} response files (${totalResponses} total responses)`);

// manifest.json
const manifestDir = path.join(outputDir, 'indexes', surveyId);
fs.mkdirSync(manifestDir, { recursive: true });

const manifestEntries = respondents.map(r => ({
  respondent_id: r.respondent_id,
  file_id: '', // Driveアップロード後に更新が必要
  survey_id: surveyId,
  role: r.role,
  store_code: r.store_code,
  updated_at: now,
}));

fs.writeFileSync(
  path.join(manifestDir, 'manifest.json'),
  JSON.stringify({ entries: manifestEntries, updated_at: now }, null, 2)
);
console.log('Created: manifest.json');

console.log('\n--- Summary ---');
console.log(`Output directory: ${outputDir}`);
console.log('');
console.log('Login accounts (password = emp_no):');
console.log('  Admin: 10001 / 10001 (山田太郎, MANAGER, 青山店)');
console.log('  Staff: 10002 / 10002 (田中美咲, STAFF, 青山店)');
console.log('  PA: 10004 / 10004 (斎藤結衣, PA, 青山店)');
console.log('');
console.log('Next steps:');
console.log('1. Upload respondents.json and org_units.json to Drive setup/ folder');
console.log('2. Upload responses/ folder to Drive recording/ folder');
console.log('3. Upload indexes/ folder to Drive recording/ folder');
