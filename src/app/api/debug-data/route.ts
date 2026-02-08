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
    
    let pathTrace = {
        recording: recordingFolder?.id,
        responses: null as string | null,
        survey: null as string | null,
        responsesFile: null as string | null,
    };

    if (recordingFolder) {
        const resFolder = await findFileByName('responses', recordingFolder.id!);
        pathTrace.responses = resFolder?.id || null;
        if (resFolder && resFolder.id) {
            const sFolder = await findFileByName(surveyId, resFolder.id);
            pathTrace.survey = sFolder?.id || null;
            if (sFolder && sFolder.id) {
                const rFile = await findFileByName('responses.json', sFolder.id);
                pathTrace.responsesFile = rFile?.id || null;
            }
        }
    }

    const respondents = await loadRespondents(setupFolder?.id || rootId!);
    const orgUnits = await loadOrgUnits(setupFolder?.id || rootId!);
    const responses = await loadResponses(recordingFolder?.id || rootId!, surveyId);

    return NextResponse.json({
      config: {
        rootId,
        surveyId,
        setupFolderId: setupFolder?.id,
        recordingFolderId: recordingFolder?.id,
        pathTrace,
      },
      counts: {
        respondents: respondents.length,
        orgUnits: orgUnits.length,
        responses: responses.length,
      }
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
