import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { findFileByName } from '@/lib/drive';
import {
  loadQuestionsLocal,
  loadRespondents,
  loadResponses,
} from '@/lib/data-fetching';
import { generateSurveySummary } from '@/lib/aggregation';

/**
 * GET /api/admin/export?type=markdown|csv&survey_id=2026-02
 * 
 * 分析用データ（NotebookLM向レポート または CSV）を出力
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

    if (type === 'markdown') {
      const summary = generateSurveySummary(surveyId, responses, respondents, questions, elements, factors);
      const markdown = generateMarkdownReport(surveyId, summary);
      
      return new NextResponse(markdown, {
        headers: {
          'Content-Type': 'text/markdown; charset=utf-8',
          'Content-Disposition': `attachment; filename="survey-report-${surveyId}.md"`,
        },
      });
    } else if (type === 'csv') {
      const csv = generateRawDataCsv(responses, respondents, questions);
      // UTF-8 with BOM for Excel
      const bom = Buffer.from([0xEF, 0xBB, 0xBF]);
      const content = Buffer.concat([bom, Buffer.from(csv)]);

      return new NextResponse(content, {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="survey-data-${surveyId}.csv"`,
        },
      });
    }

    return NextResponse.json({ error: 'Invalid export type' }, { status: 400 });
  } catch (error) {
    console.error('Export error:', error);
    return NextResponse.json({ error: 'Export failed' }, { status: 500 });
  }
}

function generateMarkdownReport(surveyId: string, summary: any) {
  const { overallScore, factorScores } = summary;

  let md = `# 組織診断分析レポート (${surveyId})\n\n`;
  md += `## 1. 総合評価\n`;
  md += `- **総合スコア: ${overallScore.overallMean.toFixed(2)}**\n`;
  md += `- 回答者数: ${overallScore.totaln}名\n\n`;

  md += `## 2. 因子別分析\n`;
  md += `| 因子名 | スコア | 信号 | 評価 |\n`;
  md += `| :--- | :---: | :---: | :--- |\n`;
  
  factorScores.forEach((fs: any) => {
    md += `| ${fs.factor_name} | ${fs.mean?.toFixed(2) || '-'} | ${fs.signal.color === 'green' ? '🔵' : fs.signal.color === 'yellow' ? '🟡' : '🔴'} | ${fs.signal.label} |\n`;
  });
  
  md += `\n### 分析コメント（NotebookLM用）\n`;
  md += `この組織においては、特に「${factorScores[0]?.factor_name}」が主な特徴として現れています。`;
  md += `改善が必要なポイントとしては、信号が赤または黄色の項目に注目してください。\n\n`;

  md += `## 3. 具体的な強み・弱み（要素別）\n`;
  md += `### 強み項目 (Top 3)\n`;
  summary.strengths.slice(0, 3).forEach((s: any, i: number) => {
    md += `${i + 1}. **${s.element_name}** (スコア: ${s.mean.toFixed(2)})\n`;
  });

  md += `\n### 改善、注目項目 (Bottom 3)\n`;
  summary.weaknesses.slice(0, 3).forEach((w: any, i: number) => {
    md += `${i + 1}. **${w.element_name}** (スコア: ${w.mean.toFixed(2)})\n`;
  });

  md += `\n---\n*このレポートはシステムによって自動生成されました。NotebookLMなどのAIツールに読み込ませることで、より詳細な背景分析や施策立案が可能です。*`;

  return md;
}

function generateRawDataCsv(responses: any[], respondents: any[], questions: any[]) {
  const respMap = new Map(respondents.map(r => [r.respondent_id, r]));
  const qMap = new Map(questions.map(q => [q.question_id, q.text]));

  // ヘッダー: RespondentID, StoreCode, Role, Q1, Q2, ...
  const headers = ['RespondentID', 'StoreCode', 'Role', ...questions.map(q => q.text.replace(/"/g, '""'))];
  
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
      ...questions.map(q => answers[q.question_id] || '')
    ];
    return row.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',');
  });

  return [headers.join(','), ...rows].join('\n');
}

function getCurrentSurveyId(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}
