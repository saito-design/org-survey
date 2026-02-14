import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { findFileByName, ensureFolder, saveFile } from '@/lib/drive';
import {
  loadQuestionsLocal,
  loadRespondents,
  loadResponses,
  loadOrgUnits,
} from '@/lib/data-fetching';
import { promises as fs } from 'fs';
import path from 'path';

// CSVエクスポートマッピングの型
interface CsvExportMapping {
  metaColumns: string[];
  dataStartColumn: number;
  questions: Array<{
    number: number;
    factor: string;
    text: string;
  }>;
}

// 会社名（環境変数またはデフォルト）
const COMPANY_NAME = process.env.COMPANY_NAME || '株式会社サンプル';

/**
 * GET /api/admin/export?survey_id=2026-02
 *
 * 顧客渡し用CSV（横持ち形式）をエクスポート
 */
export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session.isLoggedIn || !session.is_admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const surveyId = searchParams.get('survey_id') || getCurrentSurveyId();

    const rootId = process.env.APP_DATA_ROOT_FOLDER_ID;
    if (!rootId) throw new Error('APP_DATA_ROOT_FOLDER_ID not set');

    // フォルダ構成対応
    const setupFolder = await findFileByName('setup', rootId);
    const setupFolderId = setupFolder?.id || rootId;
    const recordingFolder = await findFileByName('recording', rootId);
    const recordingFolderId = recordingFolder?.id || rootId;

    // データ読み込み
    const [questionsData, respondents, responses, orgUnits] = await Promise.all([
      loadQuestionsLocal(),
      loadRespondents(setupFolderId),
      loadResponses(recordingFolderId, surveyId),
      loadOrgUnits(setupFolderId),
    ]);

    // CSVエクスポートマッピングを読み込み
    const mapping = await loadCsvExportMapping();

    // CSV生成
    const csv = generateCustomerCsv(surveyId, responses, respondents, orgUnits, mapping);

    // ファイル名: 株式会社サンプル様_組織診断回答データ_202602実施分_20260210-153045.csv
    const surveyMonth = formatSurveyMonth(surveyId);
    const safeCompanyName = COMPANY_NAME.replace(/[\/\\:*?"<>|]/g, '_');
    const jstTimestamp = getJstTimestamp();
    const fileName = `${safeCompanyName}様_組織診断回答データ_${surveyMonth}実施分_${jstTimestamp}.csv`;

    // UTF-8 with BOM for Excel
    const bom = Buffer.from([0xEF, 0xBB, 0xBF]);
    const content = Buffer.concat([bom, Buffer.from(csv)]);

    // Driveに保存
    try {
      const exportFolderId = process.env.APP_EXPORT_FOLDER_ID;

      // 顧客共有フォルダに保存
      if (exportFolderId) {
        await saveCsvToDrive(csv, fileName, exportFolderId, surveyId);
        console.log(`CSV saved to export folder: ${fileName}`);
      }

      // recording配下にもアーカイブ保存
      if (recordingFolderId && recordingFolderId !== rootId) {
        await saveCsvToDrive(csv, fileName, recordingFolderId, surveyId);
        console.log(`CSV archived to recording folder: ${fileName}`);
      }
    } catch (driveError) {
      console.error('Failed to save CSV to Drive:', driveError);
    }

    return new NextResponse(content, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      },
    });
  } catch (error) {
    console.error('Export error:', error);
    return NextResponse.json({ error: 'Export failed' }, { status: 500 });
  }
}

/**
 * CSVエクスポートマッピングを読み込み
 */
async function loadCsvExportMapping(): Promise<CsvExportMapping> {
  const mappingPath = path.join(process.cwd(), 'questions', 'csv-export-mapping.json');
  const data = await fs.readFile(mappingPath, 'utf-8');
  return JSON.parse(data);
}

/**
 * 顧客渡し用CSV（横持ち形式）を生成
 */
function generateCustomerCsv(
  surveyId: string,
  responses: any[],
  respondents: any[],
  orgUnits: any[],
  mapping: CsvExportMapping
): string {
  const respMap = new Map(respondents.map(r => [r.respondent_id, r]));
  const orgMap = new Map(orgUnits.map(o => [o.store_code, o]));

  // 回答者ごとに回答をまとめる
  const respondentResponses = new Map<string, Record<string, number>>();
  responses.forEach(r => {
    if (!respondentResponses.has(r.respondent_id)) {
      respondentResponses.set(r.respondent_id, {});
    }
    respondentResponses.get(r.respondent_id)![r.question_id] = r.value;
  });

  // 1行目: 因子名（メタ列に回答尺度の説明を追加）
  const scaleDescription = [
    '【回答尺度】',
    '5=強くそう思う',
    '4=そう思う',
    '3=どちらとも言えない',
    '2=そう思わない',
    '1=全くそう思わない',
  ];
  const row1Meta = mapping.metaColumns.map((_, i) => scaleDescription[i] || '');
  const row1 = [
    ...row1Meta,
    ...mapping.questions.map(q => q.factor)
  ];

  // 2行目: 設問文（メタ列に信号判定条件を追加）
  const signalDescription = [
    '【信号判定基準】',
    '良好(青)=スコア≧3.8 かつ ネガティブ<10%',
    '注意(黄)=どちらか一方のみ満たす',
    '要改善(赤)=スコア<3.8 かつ ネガティブ≧10%',
    '※ネガティブ=回答1または2の比率',
  ];
  const row2Meta = mapping.metaColumns.map((_, i) => signalDescription[i] || '');
  const row2 = [
    ...row2Meta,
    ...mapping.questions.map(q => q.text)
  ];

  // 3行目: ヘッダー列名
  const row3 = [
    ...mapping.metaColumns,
    ...mapping.questions.map(q => String(q.number))
  ];

  // データ行を生成
  const dataRows = Array.from(respondentResponses.entries()).map(([rid, answers]) => {
    const resp = respMap.get(rid);
    const org = resp ? orgMap.get(resp.store_code) : null;
    const currentYear = new Date().getFullYear();
    const joinYear = resp?.join_year;
    const tenure = joinYear ? currentYear - joinYear : '';
    const ageBand = resp?.age_band || '';

    // メタデータ列
    const meta = [
      formatSurveyMonthShort(surveyId),           // 実施月
      org?.hq_code || '',                          // 本部コード
      org?.hq || '',                               // 事業本部名
      org?.dept_code || '',                        // 事業部コード
      org?.dept || '',                             // 事業部名
      org?.section_code || '',                     // 課コード
      org?.section || '',                          // 課名
      '',                                          // 係コード
      '',                                          // 係名
      org?.area_code || '',                        // エリアコード
      org?.area || '',                             // エリア名
      '',                                          // 業種コード
      '',                                          // 業種名
      org?.business_type_code || '',               // 業態コード
      org?.business_type || '',                    // 業態名
      org?.manager_code || resp?.emp_no || '',     // 管理者コード
      org?.manager || '',                          // 管理者名
      resp?.store_code || '',                      // 事業所コード
      org?.store_name || '',                       // 事業所名
      formatRole(resp?.role),                      // 役職区分
      resp?.emp_type || '正社員',                  // 社員区分
      resp?.emp_no || '',                          // 社員番号
      resp?.anonymous ? '' : (resp?.name || ''),   // 氏名（匿名時は空白）
      joinYear || '',                              // 入社年
      resp?.birth_date || '',                      // 生年月日
      ageBand,                                     // 年代（生年月日から計算）
      tenure,                                      // 在籍年数
      resp?.anonymous ? 1 : 0,                     // 匿名希望
      resp?.is_admin ? 1 : 0,                      // is_admin
      resp?.active ? 1 : 0,                        // 有効
      resp?.role || '',                            // アンケートフォーマット
      rid,                                         // 対象者ID
      '',                                          // 適用開始日
      '',                                          // 適用終了日
    ];

    // 回答データ列（設問番号順）
    const answerCols = mapping.questions.map(q => {
      // 設問番号から対応する回答を取得
      // question_idのフォーマットに応じて変換が必要
      const qId = findQuestionId(answers, q.number);
      return qId ? (answers[qId] ?? '') : '';
    });

    return [...meta, ...answerCols];
  });

  // CSV組み立て
  const escape = (v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = [
    row1.map(escape).join(','),
    row2.map(escape).join(','),
    row3.map(escape).join(','),
    ...dataRows.map(row => row.map(escape).join(','))
  ];

  return lines.join('\n');
}

/**
 * 設問番号から回答のquestion_idを探す
 */
function findQuestionId(answers: Record<string, number>, questionNumber: number): string | null {
  // question_idのパターン: Q001, Q002, ... または 1, 2, ...
  const patterns = [
    `Q${String(questionNumber).padStart(3, '0')}`,
    `Q${questionNumber}`,
    String(questionNumber),
  ];

  for (const pattern of patterns) {
    if (pattern in answers) {
      return pattern;
    }
  }

  // 全キーを検索（末尾が番号に一致するものを探す）
  for (const key of Object.keys(answers)) {
    if (key.endsWith(String(questionNumber)) || key.endsWith(`_${questionNumber}`)) {
      return key;
    }
  }

  return null;
}

/**
 * 役職をフォーマット
 */
function formatRole(role: string | undefined): string {
  switch (role) {
    case 'MANAGER': return '店長';
    case 'STAFF': return '正社員';
    case 'PA': return 'パート・アルバイト';
    default: return role || '';
  }
}

/**
 * survey_idを実施月形式に変換（ファイル名用）
 * 例: "2026-02" → "202602"
 */
function formatSurveyMonth(surveyId: string): string {
  return surveyId.replace('-', '');
}

/**
 * survey_idを短い実施月形式に変換（データ用）
 * 例: "2026-02" → "26-Feb"
 */
function formatSurveyMonthShort(surveyId: string): string {
  const [year, month] = surveyId.split('-');
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const monthName = monthNames[parseInt(month) - 1] || month;
  return `${year.slice(-2)}-${monthName}`;
}

/**
 * CSVをDriveに保存
 * 保存先: parentFolderId/CSV出力/surveyId/fileName
 */
async function saveCsvToDrive(csv: string, fileName: string, parentFolderId: string, surveyId: string) {
  // 「CSV出力」フォルダを作成/取得
  const csvOutputFolderId = await ensureFolder('CSV出力', parentFolderId);
  // surveyIdフォルダを作成/取得
  const surveyFolderId = await ensureFolder(surveyId, csvOutputFolderId);

  // 既存ファイルをチェック
  const existing = await findFileByName(fileName, surveyFolderId, 'text/csv');

  // UTF-8 with BOM
  const csvWithBom = '\ufeff' + csv;

  // drive.ts の saveFile を使用（共有ドライブ対応済み）
  await saveFile(
    csvWithBom,
    fileName,
    'text/csv',
    surveyFolderId,
    existing?.id || undefined
  );
}

function getCurrentSurveyId(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * 日本時間のタイムスタンプを生成
 * 例: "20260210-153045"
 */
function getJstTimestamp(): string {
  const now = new Date();
  // UTC+9 (日本時間)
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const year = jst.getUTCFullYear();
  const month = String(jst.getUTCMonth() + 1).padStart(2, '0');
  const day = String(jst.getUTCDate()).padStart(2, '0');
  const hour = String(jst.getUTCHours()).padStart(2, '0');
  const min = String(jst.getUTCMinutes()).padStart(2, '0');
  const sec = String(jst.getUTCSeconds()).padStart(2, '0');
  return `${year}${month}${day}-${hour}${min}${sec}`;
}

/**
 * 生年月日から年代を計算
 * @param birthDate - 生年月日（YYYY-MM-DD形式）
 * @returns 年代（例: "10代", "20代", "30代"）、無効な場合は空文字
 */
function calcAgeBand(birthDate: string | undefined): string {
  if (!birthDate) return '';

  const birth = new Date(birthDate);
  if (isNaN(birth.getTime())) return '';

  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();

  // 誕生日がまだ来ていない場合は1歳引く
  const monthDiff = today.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age--;
  }

  if (age < 10) return '10代未満';
  if (age >= 70) return '70代以上';

  const decade = Math.floor(age / 10) * 10;
  return `${decade}代`;
}
