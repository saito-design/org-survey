/**
 * 集計ロジック
 * - 要素平均 → 因子平均 → 総合スコア
 * - 強み/課題（上位・下位3）
 * - 回答率（人ベース / 設問ベース）
 */

import { normalizeLabel } from './utils';
import type {
  Question,
  Element,
  Factor,
  Response,
  Respondent,
  Distribution,
  ElementScore,
  FactorScore,
  CategoryScore,
  SurveySummary,
  StrengthWeakness,
  ResponseRate,
  SegmentScore,
} from './types';

// ============================================================
// 「No.〇〇に同じ」マッピング
// STAFF/PAの場合: Q33→Q37, Q34→Q38, Q35→Q39 にコピー（追加）
// ============================================================

const SAME_AS_MAPPING: Array<[number, number]> = [
  [34, 37],  // 店長の承認行動 → 上司の承認行動
  [35, 38],  // 店長の育成マインド → 上司の育成マインド
  [36, 39],  // 意見具申 → 上司への意見具申
];

/**
 * 「No.〇〇に同じ」マッピングを適用
 * STAFF/PAの回答で Q33,34,35 の値を Q37,38,39 にもコピー（追加）
 */
export function applyQuestionMapping(
  responses: Response[],
  respondents: Respondent[]
): Response[] {
  const roleMap = new Map(respondents.map(r => [r.respondent_id, r.role]));
  const result: Response[] = [...responses];

  for (const r of responses) {
    const role = roleMap.get(r.respondent_id);
    if (role !== 'STAFF' && role !== 'PA') {
      continue;
    }

    // question_id から original_no を抽出 (例: "STAFF-Q33" → 33)
    const match = r.question_id.match(/-Q(\d+)$/);
    if (!match) continue;

    const originalNo = parseInt(match[1], 10);

    // コピー元の設問かチェック
    for (const [srcNo, dstNo] of SAME_AS_MAPPING) {
      if (originalNo === srcNo) {
        // コピー先の question_id を生成 (例: "STAFF-Q33" → "STAFF-Q37")
        const newQuestionId = r.question_id.replace(/-Q\d+$/, `-Q${String(dstNo).padStart(2, '0')}`);
        // 同じ回答を追加
        result.push({ ...r, question_id: newQuestionId });
        break;
      }
    }
  }

  return result;
}

// ============================================================
// 基本集計関数
// ============================================================

/**
 * 有効な回答値のみを抽出
 */
function getValidValues(values: (number | null)[]): number[] {
  return values.filter((v): v is number => v != null && !isNaN(v));
}

/**
 * 平均値を計算（有効値がなければnull）
 */
export function computeMean(values: (number | null)[]): number | null {
  const valid = getValidValues(values);
  if (valid.length === 0) return null;
  return valid.reduce((a, b) => a + b, 0) / valid.length;
}

/**
 * 分布を計算（5点尺度: Bottom2=1-2, Mid=3, Top2=4-5）
 */
export function computeDistribution(values: (number | null)[]): Distribution {
  const valid = getValidValues(values);
  const n = valid.length;
  if (n === 0) {
    return { bottom2: 0, mid: 0, top2: 0, n: 0 };
  }
  const bottom2 = valid.filter(v => v <= 2).length / n;
  const mid = valid.filter(v => v === 3).length / n;
  const top2 = valid.filter(v => v >= 4).length / n;
  return { bottom2, mid, top2, n };
}

// ============================================================
// 要素・因子・総合スコア計算
// ============================================================

/**
 * 要素別スコアを計算
 * @param responses - 回答データ
 * @param questions - 設問マスタ
 * @param elements - 要素マスタ
 * @returns 要素スコアの配列
 */
export function computeElementScores(
  responses: Response[],
  questions: Question[],
  elements: Element[]
): ElementScore[] {
  // question_id -> element_id のマップ
  const questionToElement = new Map<string, string>();
  questions.forEach(q => {
    questionToElement.set(q.question_id, q.element_id);
  });

  // element_id -> 回答値の配列
  const elementValues = new Map<string, (number | null)[]>();
  elements.forEach(e => {
    elementValues.set(e.element_id, []);
  });

  // 回答を要素ごとに振り分け
  responses.forEach(r => {
    const elementId = questionToElement.get(r.question_id);
    if (elementId && elementValues.has(elementId)) {
      elementValues.get(elementId)!.push(r.value);
    }
  });

  // 要素スコアを計算
  return elements.map(e => {
    const values = elementValues.get(e.element_id) || [];
    return {
      element_id: e.element_id,
      element_name: normalizeLabel(e.element_name),
      mean: computeMean(values),
      distribution: computeDistribution(values),
    };
  }).sort((a, b) => {
    // order順でソート（元の要素マスタの順序を使う）
    const orderA = elements.find(e => e.element_id === a.element_id)?.order ?? 999;
    const orderB = elements.find(e => e.element_id === b.element_id)?.order ?? 999;
    return orderA - orderB;
  });
}

/**
 * 因子別スコアを計算
 * @param elementScores - 要素スコアの配列
 * @param elements - 要素マスタ
 * @param factors - 因子マスタ
 * @returns 因子スコアの配列
 */
/**
 * 因子別スコアを計算（新ロジック: 因子が持つelement_idsの平均）
 * @param elementScores - 要素スコアの配列
 * @param elements - 要素マスタ（今回は参照のみ）
 * @param factors - 因子マスタ（element_idsを持つ）
 * @returns 因子スコアの配列
 */
export function computeFactorScores(
  elementScores: ElementScore[],
  elements: Element[],
  factors: Factor[]
): FactorScore[] {
  // element_id -> ElementScore のマップ
  const elementScoreMap = new Map<string, ElementScore>();
  elementScores.forEach(es => {
    elementScoreMap.set(es.element_id, es);
  });

  // 因子ごとに要素スコアを集約
  return factors.map(f => {
    // 因子に紐づく要素IDリストを取得（なければ空）
    const targetElementIds = f.element_ids || [];
    
    // 要素スコアを取得
    const factorElements = targetElementIds
      .map(eid => elementScoreMap.get(eid))
      .filter((es): es is ElementScore => es !== undefined);

    // 要素平均の平均 = 因子スコア (Mean of Means)
    // ※ Fが単一設問の場合はその設問meanがそのままF得点となる
    const means = factorElements.map(es => es.mean).filter((m): m is number => m != null);
    
    // 単純平均（重みなし）
    const factorMean = means.length > 0
      ? means.reduce((a, b) => a + b, 0) / means.length
      : null;

    return {
      factor_id: f.factor_id,
      factor_name: normalizeLabel(f.factor_name),
      mean: factorMean,
      elements: factorElements,
    };
  }).sort((a, b) => {
    const orderA = factors.find(f => f.factor_id === a.factor_id)?.order ?? 999;
    const orderB = factors.find(f => f.factor_id === b.factor_id)?.order ?? 999;
    return orderA - orderB;
  });
}

/**
 * 総合スコアを計算（因子平均の平均）
 */
export function computeOverallScore(factorScores: FactorScore[]): number | null {
  const means = factorScores.map(f => f.mean).filter((m): m is number => m != null);
  if (means.length === 0) return null;
  return means.reduce((a, b) => a + b, 0) / means.length;
}

// ============================================================
// 強み・課題の抽出
// ============================================================

/**
 * 強み（上位N要素）を抽出
 */
export function getStrengths(
  elementScores: ElementScore[],
  topN: number = 3
): StrengthWeakness[] {
  const withMean = elementScores.filter(es => es.mean != null) as (ElementScore & { mean: number })[];
  const sorted = [...withMean].sort((a, b) => b.mean - a.mean);
  return sorted.slice(0, topN).map((es, i) => ({
    element_id: es.element_id,
    element_name: es.element_name,
    mean: es.mean,
    rank: i + 1,
  }));
}

/**
 * 課題（下位N要素）を抽出
 */
export function getWeaknesses(
  elementScores: ElementScore[],
  bottomN: number = 3
): StrengthWeakness[] {
  const withMean = elementScores.filter(es => es.mean != null) as (ElementScore & { mean: number })[];
  const sorted = [...withMean].sort((a, b) => a.mean - b.mean);
  return sorted.slice(0, bottomN).map((es, i) => ({
    element_id: es.element_id,
    element_name: es.element_name,
    mean: es.mean,
    rank: i + 1,
  }));
}

// ============================================================
// 回答率計算（固定仕様準拠）
// ============================================================

/**
 * 役職ごとの設問数を計算
 */
function buildRoleQuestionCounts(questions: Question[]) {
  const roles: Array<'MANAGER' | 'STAFF' | 'PA'> = ['MANAGER', 'STAFF', 'PA'];
  const countByRole: Record<'MANAGER' | 'STAFF' | 'PA', number> = {
    MANAGER: 0,
    STAFF: 0,
    PA: 0,
  };

  for (const q of questions) {
    for (const r of roles) {
      if (q.roles?.includes(r)) countByRole[r]++;
    }
  }

  return countByRole;
}

/**
 * 役職ごとの期待設問IDセットを作成
 */
function buildExpectedQuestionIdSetByRole(questions: Question[]) {
  const roles: Array<'MANAGER' | 'STAFF' | 'PA'> = ['MANAGER', 'STAFF', 'PA'];
  const setByRole: Record<'MANAGER' | 'STAFF' | 'PA', Set<string>> = {
    MANAGER: new Set<string>(),
    STAFF: new Set<string>(),
    PA: new Set<string>(),
  };

  for (const q of questions) {
    for (const r of roles) {
      if (q.roles?.includes(r)) setByRole[r].add(q.question_id);
    }
  }
  return setByRole;
}

/**
 * 回答率を計算（人ベース / 設問ベース）
 * - 人ベース：active対象者のうち「期待設問に1つでも回答した人」/ active対象者
 * - 設問ベース：実回答件数 / 期待回答件数
 *   期待回答件数 = Σ(対象者数(role) × 設問数(role))
 */
export function computeResponseRate(
  responses: Response[],
  respondents: Respondent[],
  questions: Question[],
  filterRole?: 'MANAGER' | 'STAFF' | 'PA'
): ResponseRate {
  // 対象者（activeのみ + 役職フィルタ）
  const targetRespondents = filterRole
    ? respondents.filter(r => r.active && r.role === filterRole)
    : respondents.filter(r => r.active);

  const totalRespondents = targetRespondents.length;

  // 役職ごとの「期待設問IDセット」と「設問数」
  const expectedQSetByRole = buildExpectedQuestionIdSetByRole(questions);
  const qCountByRole = buildRoleQuestionCounts(questions);

  // 期待回答件数
  let totalExpected = 0;
  for (const r of targetRespondents) {
    totalExpected += qCountByRole[r.role] ?? 0;
  }

  // active対象者の role マップ
  const targetRoleMap = new Map<string, 'MANAGER' | 'STAFF' | 'PA'>();
  for (const r of targetRespondents) targetRoleMap.set(r.respondent_id, r.role);

  // 実回答件数（重複排除：respondent_id + question_id）
  const answeredPair = new Set<string>();
  const answeredPeople = new Set<string>();

  for (const res of responses) {
    if (res.value == null) continue;

    const role = targetRoleMap.get(res.respondent_id);
    if (!role) continue; // active対象者以外は除外

    // その役職で「期待される設問」か？
    if (!expectedQSetByRole[role].has(res.question_id)) continue;

    const key = `${res.respondent_id}::${res.question_id}`;
    if (!answeredPair.has(key)) {
      answeredPair.add(key);
      answeredPeople.add(res.respondent_id);
    }
  }

  const answeredCount = answeredPeople.size;
  const answeredQuestions = answeredPair.size;

  const rateByRespondent = totalRespondents > 0 ? answeredCount / totalRespondents : 0;
  const rateByQuestion = totalExpected > 0 ? answeredQuestions / totalExpected : 0;

  return {
    byRespondent: { answered: answeredCount, total: totalRespondents, rate: rateByRespondent },
    byQuestion: { answered: answeredQuestions, total: totalExpected, rate: rateByQuestion },
  };
}

/**
 * カテゴリ（C階層）スコアを計算（F階層の集約）
 */
export function computeCategoryScores(factorScores: FactorScore[]): CategoryScore[] {
  const CATEGORY_DEFS = [
    { id: 'C1', name: 'STAGE1 組織活性化の源泉', fIds: ['F01', 'F02', 'F03', 'F04', 'F05', 'F06', 'F07', 'F08', 'F09'] },
    { id: 'C2', name: 'STAGE2 エンゲージメント', fIds: ['F10', 'F11'] },
    { id: 'C3', name: 'STAGE3 チーム力と持続性', fIds: ['F12', 'F13', 'F14', 'F15', 'F16', 'F17', 'F18'] },
  ];

  return CATEGORY_DEFS.map(def => {
    const targetFactors = factorScores.filter(fs => def.fIds.includes(fs.factor_id));
    const validMeans = targetFactors.map(f => f.mean).filter((m): m is number => m != null);
    
    const categoryMean = validMeans.length > 0 
      ? validMeans.reduce((a, b) => a + b, 0) / validMeans.length 
      : null;

    // 分布の集約（加重平均）
    let totalN = 0;
    let sumTop2 = 0;
    let sumMid = 0;
    let sumBottom2 = 0;

    targetFactors.forEach(fs => {
      fs.elements.forEach(es => {
        const n = es.distribution.n;
        totalN += n;
        sumTop2 += es.distribution.top2 * n;
        sumMid += es.distribution.mid * n;
        sumBottom2 += es.distribution.bottom2 * n;
      });
    });

    const distribution: Distribution = totalN > 0 ? {
      top2: sumTop2 / totalN,
      mid: sumMid / totalN,
      bottom2: sumBottom2 / totalN,
      n: totalN
    } : { top2: 0, mid: 0, bottom2: 0, n: 0 };

    return {
      category_id: def.id,
      category_name: def.name,
      mean: categoryMean,
      factors: targetFactors,
      distribution
    };
  });
}

/**
 * サーベイ全体のサマリーを生成
 */
export function generateSurveySummary(
  surveyId: string,
  responses: Response[],
  respondents: Respondent[],
  questions: Question[],
  elements: Element[],
  factors: Factor[]
): SurveySummary {
  // 「No.〇〇に同じ」マッピングを適用
  const mappedResponses = applyQuestionMapping(responses, respondents);

  // 要素スコア
  const elementScores = computeElementScores(mappedResponses, questions, elements);

  // 因子スコア
  const factorScores = computeFactorScores(elementScores, elements, factors);

  // カテゴリ（C階層）スコア
  const categoryScores = computeCategoryScores(factorScores);

  // 総合スコア
  const overallScore = computeOverallScore(factorScores);

  // 強み・課題
  const strengths = getStrengths(elementScores, 3);
  const weaknesses = getWeaknesses(elementScores, 3);

  // 回答率
  const responseRate = computeResponseRate(responses, respondents, questions);

  // 有効回答者数（active対象者のうち、期待設問に1つでも回答した人）
  const activeRespondents = respondents.filter(r => r.active);
  const activeMap = new Map(activeRespondents.map(r => [r.respondent_id, r.role] as const));

  // 期待設問IDセット（役職別）
  const expectedQSetByRole = buildExpectedQuestionIdSetByRole(questions);

  const nSet = new Set<string>();
  for (const res of responses) {
    if (res.value == null) continue;
    const role = activeMap.get(res.respondent_id);
    if (!role) continue;
    if (!expectedQSetByRole[role].has(res.question_id)) continue;
    nSet.add(res.respondent_id);
  }
  const n = nSet.size;

  return {
    surveyId,
    generatedAt: new Date().toISOString(),
    overallScore,
    categoryScores, // C階層
    factorScores,
    elementScores,
    strengths,
    weaknesses,
    responseRate,
    n,
  };
}

// セグメント別集計（事業所×要素のヒートマップ用）
// ============================================================

/**
 * セグメント別（事業所別など）のスコアを計算
 */
export function computeSegmentScores(
  responses: Response[],
  respondents: Respondent[],
  questions: Question[],
  elements: Element[],
  factors: Factor[],
  segmentKey: keyof Respondent = 'store_code',
  segmentNameGetter?: (key: string) => string
): SegmentScore[] {
  // 「No.〇〇に同じ」マッピングを適用
  const mappedResponses = applyQuestionMapping(responses, respondents);

  // respondent_id -> セグメントキーのマップ
  const respondentToSegment = new Map<string, string>();
  respondents.forEach(r => {
    const key = String(r[segmentKey] ?? 'unknown');
    respondentToSegment.set(r.respondent_id, key);
  });

  // セグメントごとに回答を振り分け
  const segmentResponses = new Map<string, Response[]>();
  mappedResponses.forEach(r => {
    const segment = respondentToSegment.get(r.respondent_id) || 'unknown';
    if (!segmentResponses.has(segment)) {
      segmentResponses.set(segment, []);
    }
    segmentResponses.get(segment)!.push(r);
  });

  // セグメントごとにスコアを計算
  const results: SegmentScore[] = [];
  segmentResponses.forEach((segmentResp, segKey) => {
    // 要素スコア
    const elementScoresArr = computeElementScores(segmentResp, questions, elements);
    const elementMap = new Map<string, ElementScore>();
    elementScoresArr.forEach(es => elementMap.set(es.element_id, es));

    // 因子スコア
    const factorScoresArr = computeFactorScores(elementScoresArr, elements, factors);
    const factorMap = new Map<string, FactorScore>();
    factorScoresArr.forEach(fs => factorMap.set(fs.factor_id, fs));

    const uniqueRespondents = new Set(segmentResp.map(r => r.respondent_id));

    results.push({
      segmentKey: segKey,
      segmentName: segmentNameGetter ? segmentNameGetter(segKey) : segKey,
      elementScores: Object.fromEntries(elementMap),
      factorScores: Object.fromEntries(factorMap),
      n: uniqueRespondents.size,
    });
  });

  return results.sort((a, b) => b.n - a.n); // N数順などでソート推奨だが一旦このまま
}

// ============================================================
// 小サンプルマスク
// ============================================================

/**
 * Nが閾値未満の場合は値をマスク
 */
export function maskIfSmallN<T>(
  value: T,
  n: number,
  minN: number = 5
): T | '***' {
  return n < minN ? '***' : value;
}

// ============================================================
// 信号判定（STAGE判定）
// ============================================================

/**
 * 信号レベル
 * - 2: 青信号（良好）
 * - 1: 黄信号（注意）
 * - 0: 赤信号（要改善）
 */
export type SignalLevel = 0 | 1 | 2;

export interface SignalResult {
  level: SignalLevel;
  color: 'green' | 'yellow' | 'red';
  label: string;
}

/**
 * 信号判定の閾値設定
 */
export interface SignalThresholds {
  meanThreshold: number;      // 平均点の閾値（デフォルト: 3.8）
  bottom2RateThreshold: number; // Bottom2比率の閾値（デフォルト: 0.10 = 10%）
}

const DEFAULT_THRESHOLDS: SignalThresholds = {
  meanThreshold: 3.8,
  bottom2RateThreshold: 0.10,
};

/**
 * 信号判定を行う
 *
 * 判定基準:
 * - 青信号 (2): 平均得点 >= 3.8 かつ Bottom2比率 < 10%
 * - 黄信号 (1): 平均得点 >= 3.8 または Bottom2比率 < 10%（どちらか一方を満たす）
 * - 赤信号 (0): 平均得点 < 3.8 かつ Bottom2比率 >= 10%
 *
 * @param mean - 平均点
 * @param bottom2Rate - Bottom2（1または2の回答）の比率（0-1）
 * @param thresholds - 閾値設定（オプション）
 */
export function evaluateSignal(
  mean: number | null,
  bottom2Rate: number,
  thresholds: SignalThresholds = DEFAULT_THRESHOLDS
): SignalResult {
  const { meanThreshold, bottom2RateThreshold } = thresholds;

  // 平均がnullの場合は赤信号
  if (mean === null) {
    return { level: 0, color: 'red', label: '要改善' };
  }

  const meanOk = mean >= meanThreshold;
  const bottom2Ok = bottom2Rate < bottom2RateThreshold;

  if (meanOk && bottom2Ok) {
    // 両方OK → 青信号
    return { level: 2, color: 'green', label: '良好' };
  } else if (meanOk || bottom2Ok) {
    // どちらか一方OK → 黄信号
    return { level: 1, color: 'yellow', label: '注意' };
  } else {
    // 両方NG → 赤信号
    return { level: 0, color: 'red', label: '要改善' };
  }
}

/**
 * ElementScoreに対して信号判定を行う
 */
export function evaluateElementSignal(
  elementScore: ElementScore,
  thresholds?: SignalThresholds
): SignalResult {
  return evaluateSignal(
    elementScore.mean,
    elementScore.distribution.bottom2,
    thresholds
  );
}

/**
 * FactorScoreに対して信号判定を行う
 * （因子全体の平均とBottom2を集約して判定）
 */
export function evaluateFactorSignal(
  factorScore: FactorScore,
  thresholds?: SignalThresholds
): SignalResult {
  // 因子配下の全要素のBottom2を平均
  const elements = factorScore.elements;
  if (elements.length === 0) {
    return { level: 0, color: 'red', label: '要改善' };
  }

  const totalN = elements.reduce((sum, e) => sum + e.distribution.n, 0);
  if (totalN === 0) {
    return { level: 0, color: 'red', label: '要改善' };
  }

  // 加重平均でBottom2比率を計算
  const weightedBottom2 = elements.reduce(
    (sum, e) => sum + e.distribution.bottom2 * e.distribution.n,
    0
  ) / totalN;

  return evaluateSignal(factorScore.mean, weightedBottom2, thresholds);
}

/**
 * 全体スコアに対して信号判定を行う
 */
export function evaluateOverallSignal(
  overallScore: number | null,
  elementScores: ElementScore[],
  thresholds?: SignalThresholds
): SignalResult {
  if (elementScores.length === 0) {
    return { level: 0, color: 'red', label: '要改善' };
  }

  const totalN = elementScores.reduce((sum, e) => sum + e.distribution.n, 0);
  if (totalN === 0) {
    return { level: 0, color: 'red', label: '要改善' };
  }

  // 加重平均でBottom2比率を計算
  const weightedBottom2 = elementScores.reduce(
    (sum, e) => sum + e.distribution.bottom2 * e.distribution.n,
    0
  ) / totalN;

  return evaluateSignal(overallScore, weightedBottom2, thresholds);
}
