import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { findFileByName, listFilesInFolder } from '@/lib/drive';
import {
  Respondent,
  OrgUnit,
  SurveySummary,
  Response as SurveyResponse,
  SegmentScore,
} from '@/lib/types';
import {
  generateSurveySummary,
  computeSegmentScores,
} from '@/lib/aggregation';
import { listSurveyIds } from '@/lib/manifest';

import {
  loadQuestionsLocal,
  loadRespondents,
  loadResponses,
  loadOrgUnits,
  loadResponsesDirect,
  buildSyntheticRespondents,
} from '@/lib/data-fetching';

export const dynamic = 'force-dynamic';

export interface PeriodData {
  summary: SurveySummary;
  segmentScores?: SegmentScore[];
}

export interface SummaryResponse {
  current: PeriodData;
  prev1?: PeriodData;
  prev2?: PeriodData;
  overallAvg?: PeriodData;
  orgUnits?: OrgUnit[];
  is_owner?: boolean;
  availableSurveyIds?: string[];
  isCurrentSurvey?: boolean;
}

/**
 * GET /api/admin/summary?as_of=2025-11&segment=store_code
 *
 * サーベイ集計サマリーを取得
 * - RESPONSES_FOLDER_ID が設定されている場合: そのフォルダから直接読む
 * - respondents.json の ID が一致しない場合: 回答データから合成 respondents を使用
 */
export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session.isLoggedIn) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }
    if (!session.is_admin) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const { searchParams } = req.nextUrl;
    const requestedAsOf = searchParams.get('as_of') || '';
    const segmentBy = (searchParams.get('segment') || 'store_code') as keyof Respondent;

    // 組織フィルタ
    const filterHq = searchParams.get('hq') || 'all';
    const filterDept = searchParams.get('dept') || 'all';
    const filterSection = searchParams.get('section') || 'all';
    const filterArea = searchParams.get('area') || 'all';
    const filterBusinessType = searchParams.get('business_type') || 'all';
    const filterOffice = searchParams.get('office') || 'all';

    const rootId = process.env.APP_DATA_ROOT_FOLDER_ID;
    if (!rootId) {
      return NextResponse.json({ error: 'APP_DATA_ROOT_FOLDER_ID not configured' }, { status: 500 });
    }

    // RESPONSES_FOLDER_ID があれば直接フォルダから、なければ従来方式
    const responsesFolderId = process.env.RESPONSES_FOLDER_ID;

    // 利用可能なサーベイID一覧を取得（降順）
    let allSurveyIds: string[];
    if (responsesFolderId) {
      const surveyFolders = await listFilesInFolder(responsesFolderId, `mimeType='application/vnd.google-apps.folder'`);
      const pattern = /^\d{4}-\d{2}$/;
      allSurveyIds = surveyFolders
        .filter(f => f.name && pattern.test(f.name))
        .map(f => f.name!)
        .sort()
        .reverse();
      console.log(`[summary] RESPONSES_FOLDER_ID surveys: ${allSurveyIds.join(', ')}`);
    } else {
      allSurveyIds = await listSurveyIds(rootId);
    }

    // asOf を決定: 指定がなければ最新のサーベイにフォールバック
    const currentMonthId = getCurrentSurveyId();
    const asOf = requestedAsOf && allSurveyIds.includes(requestedAsOf)
      ? requestedAsOf
      : (allSurveyIds[0] || currentMonthId);

    const currentIdx = allSurveyIds.indexOf(asOf);
    const prev1Id = currentIdx !== -1 && allSurveyIds[currentIdx + 1] ? allSurveyIds[currentIdx + 1] : undefined;
    const prev2Id = currentIdx !== -1 && allSurveyIds[currentIdx + 2] ? allSurveyIds[currentIdx + 2] : undefined;

    // マスタデータ読込
    const setupFolder = await findFileByName('setup', rootId);
    const setupFolderId = setupFolder?.id || rootId;
    const recordingFolder = await findFileByName('recording', rootId);
    const recordingFolderId = recordingFolder?.id || rootId;

    const [questionsData, allRespondents, orgUnits] = await Promise.all([
      loadQuestionsLocal(),
      loadRespondents(setupFolderId),
      loadOrgUnits(setupFolderId),
    ]);

    const { questions, elements, factors } = questionsData;

    const orgUnitMap = new Map<string, OrgUnit>();
    orgUnits.forEach(ou => orgUnitMap.set(ou.store_code, ou));

    const filterRespondent = (r: Respondent) => {
      const ou = orgUnitMap.get(r.store_code);
      if (!ou) return false;
      if (filterHq !== 'all' && ou.hq !== filterHq) return false;
      if (filterDept !== 'all' && ou.dept !== filterDept) return false;
      if (filterSection !== 'all' && ou.section !== filterSection) return false;
      if (filterArea !== 'all' && ou.area !== filterArea) return false;
      if (filterBusinessType !== 'all' && ou.business_type !== filterBusinessType) return false;
      if (filterOffice !== 'all' && ou.store_code !== filterOffice) return false;
      return true;
    };

    // 回答データ読み込みヘルパー
    const fetchResponses = async (surveyId: string): Promise<SurveyResponse[]> => {
      if (responsesFolderId) {
        return loadResponsesDirect(responsesFolderId, surveyId);
      }
      return loadResponses(recordingFolderId, surveyId);
    };

    // 回答に対する respondents を決定する
    // respondents.json の ID が合わない場合は合成 respondents を使う
    const resolveRespondents = (allRespData: SurveyResponse[]) => {
      const realIds = new Set(allRespondents.map(r => r.respondent_id));
      const hasMatch = allRespData.some(r => realIds.has(r.respondent_id));
      if (hasMatch) {
        return { respondents: allRespondents.filter(filterRespondent), usedSynthetic: false };
      }
      // ID 不一致: 合成 respondents（question_id プレフィックスから role を推定）
      console.warn(`[summary] respondents.json IDs don't match responses. Using synthetic respondents.`);
      return { respondents: buildSyntheticRespondents(allRespData), usedSynthetic: true };
    };

    // 期間データ集計ヘルパー
    const getPeriodData = async (id: string | undefined): Promise<PeriodData | undefined> => {
      if (!id) return undefined;
      const allRespData = await fetchResponses(id);
      if (allRespData.length === 0) return undefined;

      const { respondents: workingRespondents, usedSynthetic } = resolveRespondents(allRespData);
      const workingIds = new Set(workingRespondents.map(r => r.respondent_id));
      const filteredResponses = usedSynthetic
        ? allRespData
        : allRespData.filter(res => workingIds.has(res.respondent_id));

      if (filteredResponses.length === 0) return undefined;

      const summary = generateSurveySummary(id, filteredResponses, workingRespondents, questions, elements, factors);

      const storeNameMap = new Map<string, string>();
      orgUnits.forEach(ou => storeNameMap.set(ou.store_code, ou.store_name));

      const segmentScores = computeSegmentScores(
        filteredResponses,
        workingRespondents,
        questions,
        elements,
        factors,
        segmentBy,
        (key) => (segmentBy === 'store_code' ? storeNameMap.get(key) || key : key)
      );

      return { summary, segmentScores };
    };

    // 並列集計
    const [current, prev1, prev2] = await Promise.all([
      getPeriodData(asOf),
      getPeriodData(prev1Id),
      getPeriodData(prev2Id),
    ]);

    const isCurrentSurvey = asOf === currentMonthId;

    if (!current) {
      const emptyResult: SummaryResponse = {
        current: {
          summary: {
            surveyId: asOf,
            generatedAt: new Date().toISOString(),
            overallScore: null,
            factorScores: [],
            elementScores: [],
            strengths: [],
            weaknesses: [],
            responseRate: {
              byRespondent: { answered: 0, total: 0, rate: 0 },
              byQuestion: { answered: 0, total: 0, rate: 0 },
            },
            n: 0,
          },
        },
        orgUnits,
        is_owner: session.is_owner ?? false,
        availableSurveyIds: allSurveyIds,
        isCurrentSurvey,
      };
      return NextResponse.json(emptyResult);
    }

    // 全体平均（全社・全サーベイ期間の回答を統合）
    const fetchAllAndAggregate = async (): Promise<PeriodData | undefined> => {
      try {
        const idsToLoad = allSurveyIds.length > 0 ? allSurveyIds : [asOf];
        const results = await Promise.all(
          idsToLoad.map(id => fetchResponses(id).catch(() => [] as SurveyResponse[]))
        );
        const combined = results.flat();
        if (combined.length === 0) return undefined;

        const { respondents: workingRespondents } = resolveRespondents(combined);
        const workingIds = new Set(workingRespondents.map(r => r.respondent_id));
        const filtered = workingRespondents === buildSyntheticRespondents(combined)
          ? combined
          : combined.filter(res => workingIds.has(res.respondent_id));

        const summary = generateSurveySummary('overall', filtered.length > 0 ? filtered : combined, workingRespondents, questions, elements, factors);
        const storeNameMap = new Map<string, string>();
        orgUnits.forEach(ou => storeNameMap.set(ou.store_code, ou.store_name));
        const segmentScores = computeSegmentScores(
          filtered.length > 0 ? filtered : combined,
          workingRespondents, questions, elements, factors, segmentBy,
          (key) => (segmentBy === 'store_code' ? storeNameMap.get(key) || key : key)
        );
        return { summary, segmentScores };
      } catch (err) {
        console.error('Failed to compute overallAvg:', err);
        return undefined;
      }
    };
    const overallAvg = await fetchAllAndAggregate();

    const result: SummaryResponse = {
      current,
      prev1,
      prev2,
      overallAvg,
      orgUnits,
      is_owner: session.is_owner ?? false,
      availableSurveyIds: allSurveyIds,
      isCurrentSurvey,
    };

    return NextResponse.json(result);
  } catch (error) {
    console.error('Summary error:', error);
    return NextResponse.json({
      error: 'Failed to generate summary',
      details: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}

function getCurrentSurveyId(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}
