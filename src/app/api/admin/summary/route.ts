import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { findFileByName, readJsonFile, listFilesInFolder } from '@/lib/drive';
import {
  Response,
  Respondent,
  Question,
  Element,
  Factor,
  RespondentsMaster,
  OrgUnit,
  OrgUnitsMaster,
  ManifestEntry,
  ManifestData,
} from '@/lib/types';
import {
  generateSurveySummary,
  computeSegmentScores,
  SurveySummary,
  SegmentScore,
} from '@/lib/aggregation';
import { loadManifest } from '@/lib/manifest';
import { PATHS } from '@/lib/paths';
import { promises as fs } from 'fs';
import path from 'path';

import {
  loadQuestionsLocal,
  loadRespondents,
  loadResponses,
  loadOrgUnits,
} from '@/lib/data-fetching';

export interface SummaryResponse {
  summary: SurveySummary;
  segmentScores?: SegmentScore[];
  orgUnits?: OrgUnit[];
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

    const { searchParams } = new URL(req.url);
    const surveyId = searchParams.get('survey_id') || getCurrentSurveyId();
    const segmentBy = searchParams.get('segment') || undefined;

    const rootId = process.env.APP_DATA_ROOT_FOLDER_ID;
    if (!rootId) {
      return NextResponse.json({ error: 'APP_DATA_ROOT_FOLDER_ID not configured' }, { status: 500 });
    }

    // フォルダ構成対応
    // 1. マスタデータ (setup)
    const setupFolder = await findFileByName('setup', rootId);
    const setupFolderId = setupFolder?.id || rootId; // fallback to root if setup not found (compatibility)

    // 2. 記録データ (recording)
    const recordingFolder = await findFileByName('recording', rootId);
    const recordingFolderId = recordingFolder?.id || rootId; // fallback to root

    // データ読み込み（並列実行）
    const [questionsData, respondents, responses, orgUnits] = await Promise.all([
      loadQuestionsLocal(),
      loadRespondents(setupFolderId),
      loadResponses(recordingFolderId, surveyId),
      loadOrgUnits(setupFolderId),
    ]);

    const { questions, elements, factors } = questionsData;

    // 回答がない場合
    if (responses.length === 0) {
      return NextResponse.json({
        error: 'No responses found',
        surveyId,
      }, { status: 404 });
    }

    // サマリー生成
    const summary = generateSurveySummary(
      surveyId,
      responses,
      respondents,
      questions,
      elements,
      factors
    );

    const result: SummaryResponse = { summary };

    // セグメント別集計（オプション）
    if (segmentBy === 'store_code') {
      // store_code -> store_name のマップを作成
      const storeNameMap = new Map<string, string>();
      orgUnits.forEach(ou => {
        storeNameMap.set(ou.store_code, ou.store_name);
      });

      const segmentScores = computeSegmentScores(
        responses,
        respondents,
        questions,
        elements,
        factors,
        'store_code',
        (key) => storeNameMap.get(key) || key
      );

      // Map を plain object に変換（JSON化のため）
      // ※ クライアント側では Map ではなく Object として受け取る
      result.segmentScores = segmentScores.map(s => ({
        ...s,
        elementScores: Object.fromEntries(s.elementScores) as any,
        factorScores: Object.fromEntries(s.factorScores) as any,
      }));
      result.orgUnits = orgUnits;
    }

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
