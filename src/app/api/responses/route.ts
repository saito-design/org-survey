import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { readJsonFile, findFileByName, saveJsonFile, ensureFolder } from '@/lib/drive';
import { Response } from '@/lib/types';
import { v4 as uuidv4 } from 'uuid';

interface ResponsesData {
  responses: Response[];
  updated_at: string;
}

// 回答取得
export async function GET() {
  try {
    const session = await getSession();
    if (!session.isLoggedIn) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const rootId = process.env.APP_DATA_ROOT_FOLDER_ID;
    if (!rootId) throw new Error('APP_DATA_ROOT_FOLDER_ID undefined');

    // 現在のサーベイIDを取得（年月）
    const surveyId = getCurrentSurveyId();

    // responses/{survey_id}/responses.json を探す
    const responsesFolder = await findFileByName('responses', rootId);
    if (!responsesFolder) {
      return NextResponse.json({ responses: [] });
    }

    const surveyFolder = await findFileByName(surveyId, responsesFolder.id!);
    if (!surveyFolder) {
      return NextResponse.json({ responses: [] });
    }

    const responsesFile = await findFileByName('responses.json', surveyFolder.id!, 'application/json');
    if (!responsesFile) {
      return NextResponse.json({ responses: [] });
    }

    const data = await readJsonFile<ResponsesData>(responsesFile.id!);

    // 自分の回答のみ返す
    const myResponses = data.responses.filter(r => r.respondent_id === session.respondent_id);

    return NextResponse.json({ responses: myResponses, survey_id: surveyId });
  } catch (error) {
    console.error('Error fetching responses:', error);
    return NextResponse.json({ error: 'Failed to fetch responses' }, { status: 500 });
  }
}

// 回答保存
export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session.isLoggedIn) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { answers, submit } = await req.json();

    // バリデーション
    if (!answers || typeof answers !== 'object') {
      return NextResponse.json({ error: 'Invalid answers data' }, { status: 400 });
    }

    const rootId = process.env.APP_DATA_ROOT_FOLDER_ID;
    if (!rootId) throw new Error('APP_DATA_ROOT_FOLDER_ID undefined');

    const surveyId = getCurrentSurveyId();
    const now = new Date().toISOString();

    // フォルダ構造を確保
    const responsesFolder = await ensureFolder('responses', rootId);
    const surveyFolder = await ensureFolder(surveyId, responsesFolder);

    // 既存データを読み込み
    let existingData: ResponsesData = { responses: [], updated_at: now };
    const responsesFile = await findFileByName('responses.json', surveyFolder, 'application/json');
    if (responsesFile) {
      existingData = await readJsonFile<ResponsesData>(responsesFile.id!);
    }

    // 新しい回答を追加（append-only）
    const newResponses: Response[] = Object.entries(answers).map(([question_id, value]) => ({
      response_id: uuidv4(),
      survey_id: surveyId,
      respondent_id: session.respondent_id,
      question_id,
      value: value as number | null,
      created_at: now,
      submitted_at: submit ? now : undefined,
    }));

    // 既存の回答を保持しつつ、同一respondent+questionは最新を採用
    const responseMap = new Map<string, Response>();

    // 既存回答をマップに
    for (const r of existingData.responses) {
      const key = `${r.respondent_id}:${r.question_id}`;
      responseMap.set(key, r);
    }

    // 新しい回答で上書き
    for (const r of newResponses) {
      const key = `${r.respondent_id}:${r.question_id}`;
      responseMap.set(key, r);
    }

    const mergedResponses = Array.from(responseMap.values());

    // 保存
    await saveJsonFile(
      { responses: mergedResponses, updated_at: now },
      'responses.json',
      surveyFolder,
      responsesFile?.id ?? undefined
    );

    return NextResponse.json({
      success: true,
      saved_count: newResponses.length,
      submitted: submit,
    });
  } catch (error) {
    console.error('Error saving responses:', error);
    return NextResponse.json({ error: 'Failed to save responses' }, { status: 500 });
  }
}

function getCurrentSurveyId(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}
