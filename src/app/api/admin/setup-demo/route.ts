import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { saveJsonFile, ensureFolder, findFileByName } from '@/lib/drive';
import { promises as fs } from 'fs';
import path from 'path';

/**
 * POST /api/admin/setup-demo
 *
 * デモデータをDriveにアップロードする（管理者のみ）
 */
export async function POST(req: NextRequest) {
  try {
    // 認証チェック
    const session = await getSession();
    if (!session.isLoggedIn || !session.is_admin) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const rootId = process.env.APP_DATA_ROOT_FOLDER_ID;
    if (!rootId) {
      return NextResponse.json({ error: 'APP_DATA_ROOT_FOLDER_ID not configured' }, { status: 500 });
    }

    const demoDataDir = path.join(process.cwd(), 'scripts', 'demo-data');

    // 1. setupフォルダにマスタデータをアップロード
    const setupFolderId = await ensureFolder('setup', rootId);

    // respondents.json
    const respondentsPath = path.join(demoDataDir, 'respondents.json');
    const respondentsData = JSON.parse(await fs.readFile(respondentsPath, 'utf-8'));
    const existingRespondents = await findFileByName('respondents.json', setupFolderId, 'application/json');
    await saveJsonFile(respondentsData, 'respondents.json', setupFolderId, existingRespondents?.id || undefined);
    console.log('Uploaded: respondents.json');

    // org_units.json
    const orgUnitsPath = path.join(demoDataDir, 'org_units.json');
    const orgUnitsData = JSON.parse(await fs.readFile(orgUnitsPath, 'utf-8'));
    const existingOrgUnits = await findFileByName('org_units.json', setupFolderId, 'application/json');
    await saveJsonFile(orgUnitsData, 'org_units.json', setupFolderId, existingOrgUnits?.id || undefined);
    console.log('Uploaded: org_units.json');

    // 2. recordingフォルダに回答データをアップロード
    const recordingFolderId = await ensureFolder('recording', rootId);
    const responsesFolderId = await ensureFolder('responses', recordingFolderId);
    const surveyId = '2026-02';
    const surveyFolderId = await ensureFolder(surveyId, responsesFolderId);
    const byRespondentFolderId = await ensureFolder('by_respondent', surveyFolderId);

    // 回答ファイルをアップロード
    const responsesDir = path.join(demoDataDir, 'responses', surveyId, 'by_respondent');
    const responseFiles = await fs.readdir(responsesDir);

    const manifestEntries: Array<{
      respondent_id: string;
      file_id: string;
      survey_id: string;
      role: string;
      store_code: string;
      updated_at: string;
    }> = [];

    for (const fileName of responseFiles) {
      if (!fileName.endsWith('.json')) continue;
      const filePath = path.join(responsesDir, fileName);
      const data = JSON.parse(await fs.readFile(filePath, 'utf-8'));

      const existingFile = await findFileByName(fileName, byRespondentFolderId, 'application/json');
      const savedFile = await saveJsonFile(data, fileName, byRespondentFolderId, existingFile?.id || undefined);

      // manifestエントリ作成
      const respondentId = fileName.replace('.json', '');
      const firstResponse = data.responses?.[0];
      if (firstResponse && savedFile.id) {
        // respondentsから情報を取得
        const respondent = respondentsData.respondents.find((r: { respondent_id: string }) => r.respondent_id === respondentId);
        if (respondent) {
          manifestEntries.push({
            respondent_id: respondentId,
            file_id: savedFile.id,
            survey_id: surveyId,
            role: respondent.role,
            store_code: respondent.store_code,
            updated_at: data.updated_at,
          });
        }
      }
    }
    console.log(`Uploaded: ${responseFiles.length} response files`);

    // 3. indexesフォルダにmanifestをアップロード
    const indexesFolderId = await ensureFolder('indexes', recordingFolderId);
    const surveyIndexFolderId = await ensureFolder(surveyId, indexesFolderId);

    const manifestData = {
      entries: manifestEntries,
      updated_at: new Date().toISOString(),
    };
    const existingManifest = await findFileByName('manifest.json', surveyIndexFolderId, 'application/json');
    await saveJsonFile(manifestData, 'manifest.json', surveyIndexFolderId, existingManifest?.id || undefined);
    console.log('Uploaded: manifest.json');

    return NextResponse.json({
      success: true,
      uploaded: {
        respondents: respondentsData.respondents.length,
        orgUnits: orgUnitsData.org_units.length,
        responses: responseFiles.length,
        manifestEntries: manifestEntries.length,
      },
    });
  } catch (error) {
    console.error('Setup demo error:', error);
    return NextResponse.json({
      error: 'Failed to setup demo data',
      details: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}
