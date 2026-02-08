import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { findFileByName } from '@/lib/drive';
import { loadRespondents, loadOrgUnits, loadResponses } from '@/lib/data-fetching';

export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session.isLoggedIn || !session.is_admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const rootId = process.env.APP_DATA_ROOT_FOLDER_ID;
    const now = new Date();
    const surveyId = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    const setupFolder = await findFileByName('setup', rootId!);
    const recordingFolder = await findFileByName('recording', rootId!);

    const respondents = await loadRespondents(setupFolder?.id || rootId!);
    const orgUnits = await loadOrgUnits(setupFolder?.id || rootId!);
    const responses = await loadResponses(recordingFolder?.id || rootId!, surveyId);

    return NextResponse.json({
      config: {
        rootId,
        surveyId,
        setupFolderId: setupFolder?.id,
        recordingFolderId: recordingFolder?.id,
      },
      counts: {
        respondents: respondents.length,
        orgUnits: orgUnits.length,
        responses: responses.length,
      }
    });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
