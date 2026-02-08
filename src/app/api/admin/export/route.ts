import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { findFileByName, saveJsonFile, ensureFolder } from '@/lib/drive';
import {
  loadQuestionsLocal,
  loadRespondents,
  loadResponses,
} from '@/lib/data-fetching';
import { generateSurveySummary } from '@/lib/aggregation';
import { promises as fs } from 'fs';
import path from 'path';

// 統一設問マッピングの型
interface QuestionMapping {
  mgmt_no: number;
  category: string;
  question_text: string;
  note: string;
  MANAGER: string | null;
  STAFF: string | null;
  PA: string | null;
}

// 会社名（環境変数またはデフォルト）
const COMPANY_NAME = process.env.COMPANY_NAME || '株式会社サンプル';

/**
 * GET /api/admin/export?type=markdown|csv&survey_id=2026-02
 *
 * 分析用データ（NotebookLM向レポート または CSV）を出力
 * CSVの場合はDriveにも保存する
 */
export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session.isLoggedIn || !session.is_admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const type = searchParams.get('type') || 'markdown';
    const surveyId = searchParams.get('survey_id') || getCurrentSurveyId();

    const rootId = process.env.APP_DATA_ROOT_FOLDER_ID;
    if (!rootId) throw new Error('APP_DATA_ROOT_FOLDER_ID not set');

    // フォルダ構成対応
    const setupFolder = await findFileByName('setup', rootId);
    const setupFolderId = setupFolder?.id || rootId;
    const recordingFolder = await findFileByName('recording', rootId);
    const recordingFolderId = recordingFolder?.id || rootId;

    // データ読み込み
    const [questionsData, respondents, responses] = await Promise.all([
      loadQuestionsLocal(),
      loadRespondents(setupFolderId),
      loadResponses(recordingFolderId, surveyId),
    ]);

    const { questions, elements, factors } = questionsData;
    const summary = generateSurveySummary(surveyId, responses, respondents, questions, elements, factors);

    // ファイル名に会社名と日時を含める
    const timestamp = new Date().toISOString().slice(0, 19).replace(/[:-]/g, '');
    const safeCompanyName = COMPANY_NAME.replace(/[\/\\:*?"<>|]/g, '_');

    if (type === 'markdown') {
      const markdown = generateMarkdownReport(surveyId, summary);
      const fileName = `${safeCompanyName}_診断レポート_${surveyId}.md`;

      return new NextResponse(markdown, {
        headers: {
          'Content-Type': 'text/markdown; charset=utf-8',
          'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
        },
      });
    } else if (type === 'csv') {
      const csv = await generateRawDataCsv(responses, respondents, questions);
      const fileName = `${safeCompanyName}_回答データ_${surveyId}_${timestamp}.csv`;

      // UTF-8 with BOM for Excel
      const bom = Buffer.from([0xEF, 0xBB, 0xBF]);
      const content = Buffer.concat([bom, Buffer.from(csv)]);

      // Driveに保存（2箇所：顧客共有 + アーカイブ）
      try {
        const exportFolderId = process.env.APP_EXPORT_FOLDER_ID;

        // 1. 顧客共有フォルダに保存（環境変数で設定）
        if (exportFolderId) {
          await saveCsvToDrive(csv, fileName, exportFolderId, surveyId);
          console.log(`CSV saved to export folder: ${fileName}`);
        } else {
          console.warn('APP_EXPORT_FOLDER_ID not set, skipping export folder save');
        }

        // 2. recording配下にもアーカイブ保存
        if (recordingFolderId && recordingFolderId !== rootId) {
          await saveCsvToDrive(csv, fileName, recordingFolderId, surveyId);
          console.log(`CSV archived to recording folder: ${fileName}`);
        }
      } catch (driveError) {
        console.error('Failed to save CSV to Drive:', driveError);
        // Driveへの保存に失敗してもダウンロードは続行
      }

      return new NextResponse(content, {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
        },
      });
    }

    return NextResponse.json({ error: 'Invalid export type' }, { status: 400 });
  } catch (error) {
    console.error('Export error:', error);
    return NextResponse.json({ error: 'Export failed' }, { status: 500 });
  }
}

/**
 * CSVをDriveに保存
 */
async function saveCsvToDrive(csv: string, fileName: string, parentFolderId: string, surveyId: string) {
  // CSV用フォルダを作成
  const csvFolderId = await ensureFolder('CSV出力', parentFolderId);
  const surveyFolderId = await ensureFolder(surveyId, csvFolderId);

  // CSVファイルを保存（テキストとして保存）
  const { google } = await import('googleapis');
  const auth = await getGoogleAuth();
  const drive = google.drive({ version: 'v3', auth });

  // 既存ファイルをチェック
  const existing = await findFileByName(fileName, surveyFolderId, 'text/csv');

  const media = {
    mimeType: 'text/csv',
    body: require('stream').Readable.from([Buffer.from('\ufeff' + csv, 'utf-8')]),
  };

  if (existing?.id) {
    // 更新
    await drive.files.update({
      fileId: existing.id,
      media,
    });
  } else {
    // 新規作成
    await drive.files.create({
      requestBody: {
        name: fileName,
        parents: [surveyFolderId],
        mimeType: 'text/csv',
      },
      media,
    });
  }
}

async function getGoogleAuth() {
  const { GoogleAuth } = await import('google-auth-library');

  const credentials = {
    client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  };

  const auth = new GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/drive'],
  });

  return auth;
}

function generateMarkdownReport(surveyId: string, summary: any) {
  const { overallScore, factorScores, responseRate } = summary;

  let md = `# ${COMPANY_NAME} 組織診断分析レポート\n\n`;
  md += `**診断期間:** ${surveyId}\n\n`;

  md += `## 1. 総合評価\n\n`;
  md += `| 指標 | 値 |\n`;
  md += `| :--- | :---: |\n`;
  md += `| 総合スコア | **${overallScore?.toFixed(2) || '-'}** / 5.00 |\n`;
  md += `| 回答者数 | ${summary.n}名 |\n`;
  md += `| 回答率 | ${(responseRate.byRespondent.rate * 100).toFixed(1)}% |\n\n`;

  md += `## 2. 因子別分析\n\n`;
  md += `| 因子名 | スコア | 判定 |\n`;
  md += `| :--- | :---: | :---: |\n`;

  factorScores.forEach((fs: any) => {
    const signal = fs.mean !== null && fs.mean >= 3.8 ? '良好' : fs.mean !== null && fs.mean >= 3.0 ? '注意' : '要改善';
    md += `| ${fs.factor_name} | ${fs.mean?.toFixed(2) || '-'} | ${signal} |\n`;
  });

  md += `\n## 3. 強み・弱み分析\n\n`;
  md += `### 組織の強み (Top 3)\n\n`;
  summary.strengths.slice(0, 3).forEach((s: any, i: number) => {
    md += `${i + 1}. **${s.element_name}** (スコア: ${s.mean.toFixed(2)})\n`;
  });

  md += `\n### 改善が必要な項目 (Bottom 3)\n\n`;
  summary.weaknesses.slice(0, 3).forEach((w: any, i: number) => {
    md += `${i + 1}. **${w.element_name}** (スコア: ${w.mean.toFixed(2)})\n`;
  });

  md += `\n---\n\n`;
  md += `*このレポートは ${new Date().toLocaleDateString('ja-JP')} に自動生成されました。*\n`;
  md += `*NotebookLMなどのAIツールに読み込ませることで、詳細な分析や施策立案が可能です。*\n`;

  return md;
}

async function loadQuestionMapping(): Promise<QuestionMapping[]> {
  const mappingPath = path.join(process.cwd(), 'questions', 'question_id_mapping.json');
  const data = await fs.readFile(mappingPath, 'utf-8');
  return JSON.parse(data);
}

async function generateRawDataCsv(responses: any[], respondents: any[], questions: any[]): Promise<string> {
  const respMap = new Map(respondents.map(r => [r.respondent_id, r]));

  // マッピングを読み込み
  let mapping: QuestionMapping[];
  try {
    mapping = await loadQuestionMapping();
  } catch {
    // マッピングがない場合は従来の形式
    return generateLegacyCsv(responses, respondents, questions);
  }

  // メタデータ列
  const metaCols = ['診断期間', '事業所コード', '事業所名', '役職', '回答者ID'];

  // 1行目: カテゴリ名（メタ列は空）
  const row1 = [...metaCols.map(() => ''), ...mapping.map(m => m.category)];

  // 2行目: メタ列名 + 管理番号
  const row2 = [...metaCols, ...mapping.map(m => String(m.mgmt_no))];

  // 個人ごとに回答をまとめる
  const respondentResponses = new Map<string, Record<string, number>>();
  responses.forEach(r => {
    if (!respondentResponses.has(r.respondent_id)) {
      respondentResponses.set(r.respondent_id, {});
    }
    respondentResponses.get(r.respondent_id)![r.question_id] = r.value;
  });

  // データ行を生成
  const dataRows = Array.from(respondentResponses.entries()).map(([rid, answers]) => {
    const res = respMap.get(rid);
    const role = res?.role || '';
    const surveyId = responses.find(r => r.respondent_id === rid)?.survey_id || '';

    // メタデータ
    const meta = [
      surveyId,
      res?.store_code || '',
      '', // 事業所名（現在未対応）
      role,
      rid,
    ];

    // 各管理番号に対応する回答を取得
    const answerCols = mapping.map(m => {
      // 役職に応じた設問IDを取得
      const questionId = m[role as 'MANAGER' | 'STAFF' | 'PA'];
      if (!questionId) return ''; // この役職では回答対象外
      return answers[questionId] ?? '';
    });

    return [...meta, ...answerCols];
  });

  // CSV組み立て
  const escape = (v: any) => `"${String(v).replace(/"/g, '""')}"`;
  const lines = [
    row1.map(escape).join(','),
    row2.map(escape).join(','),
    ...dataRows.map(row => row.map(escape).join(','))
  ];

  return lines.join('\n');
}

function generateLegacyCsv(responses: any[], respondents: any[], questions: any[]): string {
  const respMap = new Map(respondents.map(r => [r.respondent_id, r]));

  // ヘッダー
  const headers = ['回答者ID', '事業所コード', '役職', ...questions.map(q => q.text.replace(/"/g, '""').replace(/\*\*/g, ''))];

  // 個人ごとに回答をまとめる
  const respondentResponses = new Map<string, Record<string, number>>();
  responses.forEach(r => {
    if (!respondentResponses.has(r.respondent_id)) {
      respondentResponses.set(r.respondent_id, {});
    }
    respondentResponses.get(r.respondent_id)![r.question_id] = r.value;
  });

  const rows = Array.from(respondentResponses.entries()).map(([rid, answers]) => {
    const res = respMap.get(rid);
    const row = [
      rid,
      res?.store_code || '',
      res?.role || '',
      ...questions.map(q => answers[q.question_id] ?? '')
    ];
    return row.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',');
  });

  return [headers.map(h => `"${h}"`).join(','), ...rows].join('\n');
}

function getCurrentSurveyId(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}
