import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { findFileByName, readJsonFile, listFilesInFolder } from '@/lib/drive';
import {
  Respondent,
  Question,
  Element,
  Factor,
  RespondentsMaster,
  OrgUnit,
  OrgUnitsMaster,
  ManifestEntry,
  ManifestData,
  SurveySummary,
  Response as SurveyResponse,
  SegmentScore,
} from '@/lib/types';
import {
  generateSurveySummary,
  computeSegmentScores,
} from '@/lib/aggregation';
import { loadManifest, listSurveyIds } from '@/lib/manifest';
import { PATHS } from '@/lib/paths';

import {
  loadQuestionsLocal,
  loadRespondents,
  loadResponses,
  loadOrgUnits,
} from '@/lib/data-fetching';

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
}

/**
 * GET /api/admin/summary?survey_id=2026-02&segment=store_code
 *
 * サーベイ集計サマリーを取得
 */
export async function GET(req: NextRequest) {
  try {
    // 認証チェック
    const session = await getSession();
    if (!session.isLoggedIn) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    // 管理者チェック
    if (!session.is_admin) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const { searchParams } = req.nextUrl;
    const asOf = searchParams.get('as_of') || getCurrentSurveyId();
    const segmentBy = (searchParams.get('segment') || 'store_code') as keyof Respondent;
    
    // 組織フィルタ
    const filterHq = searchParams.get('hq') || 'all';
    const filterDept = searchParams.get('dept') || 'all';
    const filterArea = searchParams.get('area') || 'all';
    const filterOffice = searchParams.get('office') || 'all';

    const rootId = process.env.APP_DATA_ROOT_FOLDER_ID;
    if (!rootId) {
      return NextResponse.json({ error: 'APP_DATA_ROOT_FOLDER_ID not configured' }, { status: 500 });
    }

    // 利用可能なサーベイIDを取得し、比較対象を特定
    const allSurveyIds = await listSurveyIds(rootId);
    const currentIdx = allSurveyIds.indexOf(asOf);
    const prev1Id = currentIdx !== -1 && allSurveyIds[currentIdx + 1] ? allSurveyIds[currentIdx + 1] : undefined;
    const prev2Id = currentIdx !== -1 && allSurveyIds[currentIdx + 2] ? allSurveyIds[currentIdx + 2] : undefined;

    // 共通マスタデータ読込
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

    // 事業所コード -> 事業所情報のマップ（フィルタ用）
    const orgUnitMap = new Map<string, OrgUnit>();
    orgUnits.forEach(ou => orgUnitMap.set(ou.store_code, ou));

    // 対象者フィルタリング関数
    const filterRespondent = (r: Respondent) => {
      if (!filterHq && !filterDept && !filterArea && !filterOffice) return true;
      const ou = orgUnitMap.get(r.store_code);
      if (!ou) return false;

      if (filterHq !== 'all' && ou.hq !== filterHq) return false;
      if (filterDept !== 'all' && ou.dept !== filterDept) return false;
      if (filterArea !== 'all' && ou.area !== filterArea) return false;
      if (filterOffice !== 'all' && ou.store_code !== filterOffice) return false;
      return true;
    };

    // フィルタ適用後の対象者リスト
    const filteredRespondents = allRespondents.filter(filterRespondent);
    const filteredRespondentIds = new Set(filteredRespondents.map(r => r.respondent_id));

    // 指定期間のデータを集計するヘルパー
    const getPeriodData = async (id: string | undefined): Promise<PeriodData | undefined> => {
      if (!id) return undefined;
      const allResponses = await loadResponses(recordingFolderId, id);
      // フィルタ適用
      const filteredResponses = allResponses.filter(res => filteredRespondentIds.has(res.respondent_id));
      if (filteredResponses.length === 0) return undefined;

      const summary = generateSurveySummary(id, filteredResponses, filteredRespondents, questions, elements, factors);
      
      const storeNameMap = new Map<string, string>();
      orgUnits.forEach(ou => storeNameMap.set(ou.store_code, ou.store_name));

      const segmentScoresMap = computeSegmentScores(
        filteredResponses,
        filteredRespondents,
        questions,
        elements,
        factors,
        segmentBy,
        (key) => {
            if (segmentBy === 'store_code') return storeNameMap.get(key) || key;
            return key;
        }
      );

      const segmentScores = segmentScoresMap;

      return { summary, segmentScores };
    };

    // 並列で集計実行
    const [current, prev1, prev2] = await Promise.all([
      getPeriodData(asOf),
      getPeriodData(prev1Id),
      getPeriodData(prev2Id),
    ]);

    if (!current) {
      return NextResponse.json({ error: 'No data for specified period', asOf }, { status: 404 });
    }

    // 全体平均の計算（全社全体 - フィルタ適用なし）
    // ※ 事業部等でフィルタしても、全体平均は常に全社の値
    const allRespondentIds = new Set(allRespondents.map(r => r.respondent_id));

    const fetchAllAndAggregate = async (): Promise<PeriodData | undefined> => {
        try {
            const idsToLoad = allSurveyIds.length > 0 ? allSurveyIds : [asOf];

            const allResponsesPromises = idsToLoad.map(id =>
                loadResponses(recordingFolderId, id).catch(err => {
                    console.warn(`Failed to load responses for ${id}:`, err);
                    return [];
                })
            );
            const results = await Promise.all(allResponsesPromises);
            // 全社全体なのでフィルタ適用なし（全対象者）
            const combined = results.flat().filter(res => allRespondentIds.has(res.respondent_id));

            if (combined.length === 0) {
                console.warn('overallAvg: No responses');
                return undefined;
            }

            // 全社全体で集計（フィルタなし）
            const summary = generateSurveySummary('overall', combined, allRespondents, questions, elements, factors);

            // 全体平均のセグメント別も全社で計算
            const storeNameMap = new Map<string, string>();
            orgUnits.forEach(ou => storeNameMap.set(ou.store_code, ou.store_name));
            const segmentScoresMap = computeSegmentScores(combined, allRespondents, questions, elements, factors, segmentBy, (key) => segmentBy === 'store_code' ? storeNameMap.get(key) || key : key);
            const segmentScores = segmentScoresMap;

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
