import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import {
  readJsonFile,
  findFileByName,
  saveJsonFile,
  ensureFolder,
} from '@/lib/drive';
import { Response } from '@/lib/types';
import { PATHS } from '@/lib/paths';
import { upsertManifest, loadManifest } from '@/lib/manifest';
import { v4 as uuidv4 } from 'uuid';

interface ResponsesData {
  responses: Response[];
  updated_at: string;
}

function getCurrentSurveyId(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

// 回答取得（自分のファイルだけ）
export async function GET() {
  try {
    const session = await getSession();
    if (!session.isLoggedIn) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const rootId = process.env.APP_DATA_ROOT_FOLDER_ID;
    if (!rootId) throw new Error('APP_DATA_ROOT_FOLDER_ID undefined');

    const surveyId = getCurrentSurveyId();

    // 自分の回答ファイルを探す
    // responses/{survey}/by_respondent/{id}.json
    const responsesFolder = await findFileByName(PATHS.RESPONSES, rootId);
    if (!responsesFolder) return NextResponse.json({ responses: [], survey_id: surveyId });

    const surveyFolder = await findFileByName(surveyId, responsesFolder.id!);
    if (!surveyFolder) return NextResponse.json({ responses: [], survey_id: surveyId });

    const byRespondentFolder = await findFileByName(PATHS.BY_RESPONDENT, surveyFolder.id!);
    if (!byRespondentFolder) return NextResponse.json({ responses: [], survey_id: surveyId });

    const myFileName = `${session.respondent_id}.json`;
    const myFile = await findFileByName(myFileName, byRespondentFolder.id!, 'application/json');
    if (!myFile) return NextResponse.json({ responses: [], survey_id: surveyId });

    const data = await readJsonFile<ResponsesData>(myFile.id!);
    return NextResponse.json({ responses: data.responses, survey_id: surveyId });
  } catch (error) {
    console.error('Error fetching responses:', error);
    return NextResponse.json({ error: 'Failed to fetch responses' }, { status: 500 });
  }
}

// 回答保存（1人1JSON + manifest upsert）
export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session.isLoggedIn) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const body = await req.json();
    const answers = body?.answers;
    const submit = Boolean(body?.submit);

    if (!answers || typeof answers !== 'object') {
      return NextResponse.json({ error: 'Invalid answers data' }, { status: 400 });
    }

    const rootId = process.env.APP_DATA_ROOT_FOLDER_ID;
    if (!rootId) throw new Error('APP_DATA_ROOT_FOLDER_ID undefined');

    const surveyId = getCurrentSurveyId();
    const now = new Date().toISOString();

    // null/undefined は保存対象から除外（空白上書き事故防止）
    const entries = Object.entries(answers).filter(([, v]) => v !== null && v !== undefined);
    
    // バリデーション: 非nullが0件なら保存拒否
    if (entries.length === 0) {
      return NextResponse.json({ error: 'No non-null answers to save' }, { status: 400 });
    }

    // バリデーション: 数値範囲チェック (1-5)
    for (const [, value] of entries) {
      const numVal = Number(value);
      if (isNaN(numVal) || numVal < 1 || numVal > 5) {
         return NextResponse.json({ error: 'Invalid answer value (must be 1-5)' }, { status: 400 });
      }
    }
    // フォルダ構成対応: recording フォルダを取得してルートとする
    const recordingFolder = await ensureFolder('recording', rootId);
    const targetRootId = recordingFolder; // API内ではこれをルートとして扱う

    // 1. Manifestのロード（recordingフォルダ内）
    const manifestEntries = await loadManifest(targetRootId, surveyId);
    
    // 2. 回答データの保存準備
    // responsesフォルダの作成（recordingフォルダ内）
    const responsesFolderId = await ensureFolder(PATHS.RESPONSES, targetRootId);
    const surveyFolderId = await ensureFolder(surveyId, responsesFolderId);
    const byRespondentFolderId = await ensureFolder(PATHS.BY_RESPONDENT, surveyFolderId);

    const myFileName = `${session.respondent_id}.json`;
    const existingFile = await findFileByName(myFileName, byRespondentFolderId, 'application/json');

    let existingData: ResponsesData = { responses: [], updated_at: now };
    if (existingFile) {
      existingData = await readJsonFile<ResponsesData>(existingFile.id!);
    }

    const newResponses: Response[] = entries.map(([question_id, value]) => ({
      response_id: uuidv4(),
      survey_id: surveyId,
      respondent_id: session.respondent_id,
      question_id,
      value: Number(value),
      created_at: now,
      submitted_at: submit ? now : undefined,
    }));

    // 既存 + 新規 マージ（同一question_idは最新を採用）
    const map = new Map<string, Response>();
    for (const r of existingData.responses) map.set(r.question_id, r);
    for (const r of newResponses) map.set(r.question_id, r);

    const merged: ResponsesData = {
      responses: Array.from(map.values()),
      updated_at: now,
    };

    // 保存（create or update）
    const savedFile = await saveJsonFile(
      merged,
      myFileName,
      byRespondentFolderId,
      existingFile?.id ?? undefined
    );

    // manifest 更新（回答保存成功後にupsert）
    // session情報にはすべての属性が含まれているわけではないため、本来はrespondents.jsonから引くべきだが、
    // セッションに必要な情報は入っている(role, store_code)。
    // ただし、ManifestEntryに必要な情報が不足している場合はロードする安全策をとる。
    // ここではセッション情報を信頼して構築するが、念のため型キャスト等で対応。
    
    // sessionからRespondentオブジェクトを再構築（必要なフィールドのみ）
    // ※完全なRespondentオブジェクトを取得するためにloadRespondent相当が必要だが、
    // ここではパフォーマンス優先でセッション情報を使う。
    // ただし、sessionに is_admin 等が含まれているので注意。
    
    await upsertManifest({
      rootId: targetRootId,
      surveyId,
      respondent: {
        respondent_id: session.respondent_id,
        emp_no: session.emp_no,
        role: session.role,
        store_code: session.store_code,
        active: true, // dummy
        password_hash: '', // dummy
        // Manifest作成に必要なのは id, role, store_code なのでこれで十分
      } as any, 
      responseFileId: savedFile.id!,
      updatedAt: now,
    });

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
