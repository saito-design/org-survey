'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';

// ============================================================
// 型定義
// ============================================================

interface Distribution {
  bottom2: number;
  mid: number;
  top2: number;
  n: number;
}

interface ElementScore {
  element_id: string;
  element_name: string;
  mean: number | null;
  distribution: Distribution;
}

interface FactorScore {
  factor_id: string;
  factor_name: string;
  mean: number | null;
  elements: ElementScore[];
}

interface StrengthWeakness {
  element_id: string;
  element_name: string;
  mean: number;
  rank: number;
}

interface ResponseRate {
  byRespondent: { answered: number; total: number; rate: number };
  byQuestion: { answered: number; total: number; rate: number };
}

interface SurveySummary {
  surveyId: string;
  generatedAt: string;
  overallScore: number | null;
  factorScores: FactorScore[];
  elementScores: ElementScore[];
  strengths: StrengthWeakness[];
  weaknesses: StrengthWeakness[];
  responseRate: ResponseRate;
  n: number;
}

interface SegmentScore {
  segmentKey: string;
  segmentName: string;
  elementScores: Record<string, number | null>;
  n: number;
}

interface SummaryResponse {
  summary: SurveySummary;
  segmentScores?: SegmentScore[];
}

type SignalLevel = 0 | 1 | 2;
type DisplayMode = 'absolute' | 'diff';
type SegmentTab = 'store' | 'role' | 'age';

// ============================================================
// 信号判定ロジック（クライアント側）
// ============================================================

function evaluateSignal(mean: number | null, bottom2Rate: number): SignalLevel {
  if (mean === null) return 0;
  const meanOk = mean >= 3.8;
  const bottom2Ok = bottom2Rate < 0.10;
  if (meanOk && bottom2Ok) return 2;
  if (meanOk || bottom2Ok) return 1;
  return 0;
}

function getSignalColor(level: SignalLevel): string {
  switch (level) {
    case 2: return 'bg-blue-500';
    case 1: return 'bg-yellow-400';
    case 0: return 'bg-red-500';
  }
}

function getSignalTextColor(level: SignalLevel): string {
  switch (level) {
    case 2: return 'text-blue-600';
    case 1: return 'text-yellow-600';
    case 0: return 'text-red-600';
  }
}

// ============================================================
// メインコンポーネント
// ============================================================

export default function AdminDashboard() {
  const router = useRouter();
  const [summary, setSummary] = useState<SurveySummary | null>(null);
  const [segmentScores, setSegmentScores] = useState<SegmentScore[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // UI状態
  const [displayMode, setDisplayMode] = useState<DisplayMode>('absolute');
  const [segmentTab, setSegmentTab] = useState<SegmentTab>('store');
  const [minN, setMinN] = useState(5);
  const [selectedCell, setSelectedCell] = useState<{
    segmentName: string;
    elementName: string;
    mean: number | null;
    distribution: Distribution | null;
    n: number;
  } | null>(null);

  const fetchSummary = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/admin/summary?segment=store_code');

      if (res.status === 401) {
        router.push('/');
        return;
      }
      if (res.status === 403) {
        router.push('/survey');
        return;
      }

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to fetch');
      }
      const data: SummaryResponse = await res.json();
      setSummary(data.summary);
      setSegmentScores(data.segmentScores || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    fetchSummary();
  }, [fetchSummary]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-600">読み込み中...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-2xl font-bold mb-4">管理ダッシュボード</h1>
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
            エラー: {error}
          </div>
        </div>
      </div>
    );
  }

  if (!summary) {
    return (
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-2xl font-bold mb-4">管理ダッシュボード</h1>
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-yellow-700">
            データがありません
          </div>
        </div>
      </div>
    );
  }

  // 全体平均のマップ（差分計算用）
  const overallScores = new Map<string, number | null>();
  summary.elementScores.forEach(e => {
    overallScores.set(e.element_id, e.mean);
  });

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Sticky Header */}
      <StickyHeader
        summary={summary}
        displayMode={displayMode}
        setDisplayMode={setDisplayMode}
        minN={minN}
        setMinN={setMinN}
      />

      <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        {/* 信号凡例 */}
        <SignalLegend />

        {/* KPIカード3枚 */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <OverallScoreCard
            score={summary.overallScore}
            elementScores={summary.elementScores}
          />
          <StrengthsCard strengths={summary.strengths} />
          <WeaknessesCard weaknesses={summary.weaknesses} />
        </div>

        {/* ヒートマップ */}
        <div className="bg-white rounded-lg shadow">
          {/* タブ */}
          <div className="border-b px-4">
            <div className="flex gap-4">
              {(['store', 'role', 'age'] as SegmentTab[]).map(tab => (
                <button
                  key={tab}
                  onClick={() => setSegmentTab(tab)}
                  className={`py-3 px-4 font-medium border-b-2 transition ${
                    segmentTab === tab
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
                >
                  {tab === 'store' ? '事業所別' : tab === 'role' ? '役職別' : '年代別'}
                </button>
              ))}
            </div>
          </div>

          {/* ヒートマップ本体 */}
          <div className="p-4 overflow-x-auto">
            {segmentTab === 'store' && segmentScores.length > 0 ? (
              <HeatmapTable
                segmentScores={segmentScores}
                elements={summary.elementScores}
                overallScores={overallScores}
                displayMode={displayMode}
                minN={minN}
                onCellClick={(segmentName, element, segmentN) => {
                  // セグメント内の分布は簡易計算（実際はAPIから取得が望ましい）
                  const elementScore = summary.elementScores.find(e => e.element_id === element.element_id);
                  setSelectedCell({
                    segmentName,
                    elementName: element.element_name,
                    mean: element.mean,
                    distribution: elementScore?.distribution || null,
                    n: segmentN,
                  });
                }}
              />
            ) : (
              <div className="text-gray-500 text-center py-8">
                {segmentTab === 'store' ? 'データがありません' : '（未実装：役職別・年代別は今後対応）'}
              </div>
            )}
          </div>
        </div>

        {/* 因子別スコア */}
        <FactorScoresSection factorScores={summary.factorScores} />
      </div>

      {/* 詳細モーダル */}
      {selectedCell && (
        <DistributionModal
          data={selectedCell}
          onClose={() => setSelectedCell(null)}
        />
      )}
    </div>
  );
}

// ============================================================
// Sticky Header
// ============================================================

function StickyHeader({
  summary,
  displayMode,
  setDisplayMode,
  minN,
  setMinN,
}: {
  summary: SurveySummary;
  displayMode: DisplayMode;
  setDisplayMode: (mode: DisplayMode) => void;
  minN: number;
  setMinN: (n: number) => void;
}) {
  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
  };

  return (
    <div className="sticky top-0 z-10 bg-white shadow-md">
      <div className="max-w-7xl mx-auto px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-4">
          {/* 左側：タイトルと基本情報 */}
          <div className="flex items-center gap-6">
            <h1 className="text-xl font-bold text-gray-800">組織診断サマリー</h1>
            <div className="flex items-center gap-4 text-sm">
              <span className="bg-gray-100 px-3 py-1 rounded">
                期間: {summary.surveyId}
              </span>
              <span className="bg-blue-100 text-blue-700 px-3 py-1 rounded">
                N: {summary.responseRate.byRespondent.answered}/{summary.responseRate.byRespondent.total}
              </span>
              <span className="bg-green-100 text-green-700 px-3 py-1 rounded">
                充足率: {(summary.responseRate.byQuestion.rate * 100).toFixed(1)}%
              </span>
            </div>
          </div>

          {/* 右側：表示切替とエクスポート */}
          <div className="flex items-center gap-4">
            {/* 表示モード */}
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-600">表示:</span>
              <select
                value={displayMode}
                onChange={(e) => setDisplayMode(e.target.value as DisplayMode)}
                className="border rounded px-2 py-1 text-sm"
              >
                <option value="absolute">絶対値</option>
                <option value="diff">差分</option>
              </select>
            </div>

            {/* N閾値 */}
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-600">N閾値:</span>
              <input
                type="number"
                value={minN}
                onChange={(e) => setMinN(parseInt(e.target.value) || 1)}
                min={1}
                max={20}
                className="border rounded px-2 py-1 text-sm w-16"
              />
            </div>

            {/* エクスポートボタン */}
            <div className="flex gap-2">
              <button
                onClick={() => alert('NotebookLM出力（未実装）')}
                className="bg-purple-500 text-white px-3 py-1 rounded text-sm hover:bg-purple-600"
              >
                MD出力
              </button>
              <button
                onClick={() => alert('CSV出力（未実装）')}
                className="bg-green-500 text-white px-3 py-1 rounded text-sm hover:bg-green-600"
              >
                CSV
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// 信号凡例
// ============================================================

function SignalLegend() {
  return (
    <div className="bg-white rounded-lg shadow px-4 py-2 flex items-center gap-6">
      <span className="text-sm text-gray-600 font-medium">信号判定:</span>
      <div className="flex items-center gap-4 text-sm">
        <div className="flex items-center gap-1">
          <span className="w-4 h-4 rounded-full bg-blue-500"></span>
          <span>青: 平均≥3.8 かつ 低評価&lt;10%</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="w-4 h-4 rounded-full bg-yellow-400"></span>
          <span>黄: どちらか一方を満たす</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="w-4 h-4 rounded-full bg-red-500"></span>
          <span>赤: 両方満たさない</span>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// KPIカード
// ============================================================

function OverallScoreCard({
  score,
  elementScores,
}: {
  score: number | null;
  elementScores: ElementScore[];
}) {
  // 全体のBottom2率を計算
  const totalN = elementScores.reduce((sum, e) => sum + e.distribution.n, 0);
  const weightedBottom2 = totalN > 0
    ? elementScores.reduce((sum, e) => sum + e.distribution.bottom2 * e.distribution.n, 0) / totalN
    : 0;

  const signal = evaluateSignal(score, weightedBottom2);

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-700">総合スコア</h3>
        <span className={`w-4 h-4 rounded-full ${getSignalColor(signal)}`}></span>
      </div>
      <div className="text-center">
        <div className={`text-5xl font-bold ${getSignalTextColor(signal)}`}>
          {score ? score.toFixed(2) : '-'}
        </div>
        <div className="text-gray-500 mt-2">/ 5.00</div>
        <div className="text-sm text-gray-400 mt-1">
          低評価率: {(weightedBottom2 * 100).toFixed(1)}%
        </div>
      </div>
    </div>
  );
}

function StrengthsCard({ strengths }: { strengths: StrengthWeakness[] }) {
  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h3 className="text-lg font-semibold text-gray-700 mb-4">
        <span className="text-blue-600">強み</span> TOP3
      </h3>
      <ul className="space-y-3">
        {strengths.map((s, i) => (
          <li key={s.element_id} className="flex items-center gap-3">
            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-sm font-bold">
              {i + 1}
            </span>
            <span className="flex-1 text-gray-700 truncate" title={s.element_name}>
              {s.element_name}
            </span>
            <span className="font-bold text-blue-600">{s.mean.toFixed(2)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function WeaknessesCard({ weaknesses }: { weaknesses: StrengthWeakness[] }) {
  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h3 className="text-lg font-semibold text-gray-700 mb-4">
        <span className="text-red-600">課題</span> TOP3
      </h3>
      <ul className="space-y-3">
        {weaknesses.map((w, i) => (
          <li key={w.element_id} className="flex items-center gap-3">
            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-red-100 text-red-700 flex items-center justify-center text-sm font-bold">
              {i + 1}
            </span>
            <span className="flex-1 text-gray-700 truncate" title={w.element_name}>
              {w.element_name}
            </span>
            <span className="font-bold text-red-600">{w.mean.toFixed(2)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ============================================================
// ヒートマップ
// ============================================================

function HeatmapTable({
  segmentScores,
  elements,
  overallScores,
  displayMode,
  minN,
  onCellClick,
}: {
  segmentScores: SegmentScore[];
  elements: ElementScore[];
  overallScores: Map<string, number | null>;
  displayMode: DisplayMode;
  minN: number;
  onCellClick: (segmentName: string, element: ElementScore, segmentN: number) => void;
}) {
  // セルの背景色（絶対値モード）
  const getAbsoluteColor = (score: number | null): string => {
    if (score === null) return 'bg-gray-100';
    if (score >= 4.5) return 'bg-blue-500 text-white';
    if (score >= 4.0) return 'bg-blue-300';
    if (score >= 3.8) return 'bg-blue-100';
    if (score >= 3.5) return 'bg-yellow-100';
    if (score >= 3.0) return 'bg-orange-100';
    if (score >= 2.5) return 'bg-orange-300';
    return 'bg-red-400 text-white';
  };

  // セルの背景色（差分モード）
  const getDiffColor = (diff: number | null): string => {
    if (diff === null) return 'bg-gray-100';
    if (diff >= 0.5) return 'bg-blue-500 text-white';
    if (diff >= 0.3) return 'bg-blue-300';
    if (diff >= 0.1) return 'bg-blue-100';
    if (diff >= -0.1) return 'bg-gray-50';
    if (diff >= -0.3) return 'bg-orange-100';
    if (diff >= -0.5) return 'bg-orange-300';
    return 'bg-red-400 text-white';
  };

  return (
    <table className="min-w-full text-sm">
      <thead>
        <tr className="border-b bg-gray-50">
          <th className="text-left py-2 px-2 sticky left-0 bg-gray-50 z-10 min-w-[120px]">
            事業所
          </th>
          <th className="text-center py-2 px-1 w-12">N</th>
          {elements.map(e => (
            <th
              key={e.element_id}
              className="text-center py-2 px-1 whitespace-nowrap min-w-[60px]"
              title={e.element_name}
            >
              <span className="text-xs">{e.element_name.slice(0, 5)}</span>
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {/* 全体平均行 */}
        <tr className="border-b bg-blue-50 font-bold">
          <td className="py-2 px-2 sticky left-0 bg-blue-50 z-10">全体平均</td>
          <td className="text-center py-2 px-1 text-gray-500">-</td>
          {elements.map(e => (
            <td key={e.element_id} className="text-center py-2 px-1">
              {e.mean?.toFixed(1) ?? '-'}
            </td>
          ))}
        </tr>

        {/* 各セグメント */}
        {segmentScores.map(seg => (
          <tr key={seg.segmentKey} className="border-b hover:bg-gray-50">
            <td className="py-2 px-2 sticky left-0 bg-white z-10 whitespace-nowrap">
              {seg.segmentName}
            </td>
            <td className="text-center py-2 px-1 text-gray-500">{seg.n}</td>
            {elements.map(e => {
              const score = seg.elementScores[e.element_id] ?? null;
              const overall = overallScores.get(e.element_id) ?? null;
              const diff = score !== null && overall !== null ? score - overall : null;
              const isMasked = seg.n < minN;

              // 信号判定（簡易：全体の分布を使用）
              const signal = evaluateSignal(score, e.distribution.bottom2);

              const bgColor = displayMode === 'absolute'
                ? getAbsoluteColor(score)
                : getDiffColor(diff);

              return (
                <td
                  key={e.element_id}
                  className={`text-center py-1 px-1 cursor-pointer transition hover:ring-2 hover:ring-blue-400 ${bgColor}`}
                  onClick={() => onCellClick(seg.segmentName, e, seg.n)}
                >
                  {isMasked ? (
                    <span className="text-gray-400">***</span>
                  ) : (
                    <div className="flex flex-col items-center">
                      <span className="text-xs">
                        {displayMode === 'absolute'
                          ? score?.toFixed(1) ?? '-'
                          : diff !== null
                            ? (diff >= 0 ? '+' : '') + diff.toFixed(1)
                            : '-'}
                      </span>
                      <span className={`w-2 h-2 rounded-full mt-0.5 ${getSignalColor(signal)}`}></span>
                    </div>
                  )}
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ============================================================
// 分布モーダル
// ============================================================

function DistributionModal({
  data,
  onClose,
}: {
  data: {
    segmentName: string;
    elementName: string;
    mean: number | null;
    distribution: Distribution | null;
    n: number;
  };
  onClose: () => void;
}) {
  const dist = data.distribution;
  const signal = evaluateSignal(data.mean, dist?.bottom2 ?? 0);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl p-6 max-w-md w-full mx-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-gray-800">
            {data.segmentName} × {data.elementName}
          </h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-2xl leading-none"
          >
            &times;
          </button>
        </div>

        <div className="space-y-4">
          {/* 平均と信号 */}
          <div className="flex items-center justify-between">
            <span className="text-gray-600">平均スコア</span>
            <div className="flex items-center gap-2">
              <span className="text-2xl font-bold">{data.mean?.toFixed(2) ?? '-'}</span>
              <span className={`w-4 h-4 rounded-full ${getSignalColor(signal)}`}></span>
            </div>
          </div>

          {/* N */}
          <div className="flex items-center justify-between">
            <span className="text-gray-600">回答者数 (N)</span>
            <span className="font-bold">{data.n}</span>
          </div>

          {/* 分布バー */}
          {dist && (
            <div>
              <div className="text-gray-600 mb-2">回答分布</div>
              <div className="flex h-8 rounded overflow-hidden">
                <div
                  className="bg-red-400 flex items-center justify-center text-white text-xs"
                  style={{ width: `${dist.bottom2 * 100}%` }}
                >
                  {dist.bottom2 > 0.05 && `${(dist.bottom2 * 100).toFixed(0)}%`}
                </div>
                <div
                  className="bg-yellow-300 flex items-center justify-center text-gray-700 text-xs"
                  style={{ width: `${dist.mid * 100}%` }}
                >
                  {dist.mid > 0.05 && `${(dist.mid * 100).toFixed(0)}%`}
                </div>
                <div
                  className="bg-blue-400 flex items-center justify-center text-white text-xs"
                  style={{ width: `${dist.top2 * 100}%` }}
                >
                  {dist.top2 > 0.05 && `${(dist.top2 * 100).toFixed(0)}%`}
                </div>
              </div>
              <div className="flex justify-between text-xs text-gray-500 mt-1">
                <span>1-2 (低)</span>
                <span>3 (中)</span>
                <span>4-5 (高)</span>
              </div>
            </div>
          )}

          {/* 低評価率 */}
          {dist && (
            <div className="flex items-center justify-between">
              <span className="text-gray-600">低評価率 (1-2)</span>
              <span className={`font-bold ${dist.bottom2 >= 0.1 ? 'text-red-600' : 'text-gray-700'}`}>
                {(dist.bottom2 * 100).toFixed(1)}%
              </span>
            </div>
          )}
        </div>

        <button
          onClick={onClose}
          className="mt-6 w-full bg-gray-100 hover:bg-gray-200 text-gray-700 py-2 rounded"
        >
          閉じる
        </button>
      </div>
    </div>
  );
}

// ============================================================
// 因子別スコア
// ============================================================

function FactorScoresSection({ factorScores }: { factorScores: FactorScore[] }) {
  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h3 className="text-lg font-semibold text-gray-700 mb-4">因子別スコア</h3>
      <div className="space-y-6">
        {factorScores.map(f => {
          // 因子の信号判定
          const totalN = f.elements.reduce((sum, e) => sum + e.distribution.n, 0);
          const weightedBottom2 = totalN > 0
            ? f.elements.reduce((sum, e) => sum + e.distribution.bottom2 * e.distribution.n, 0) / totalN
            : 0;
          const signal = evaluateSignal(f.mean, weightedBottom2);

          return (
            <div key={f.factor_id} className="border-l-4 border-blue-500 pl-4">
              <div className="flex items-center gap-4 mb-2">
                <span className="font-bold text-gray-800">{f.factor_name}</span>
                <span className={`text-xl font-bold ${getSignalTextColor(signal)}`}>
                  {f.mean?.toFixed(2) ?? '-'}
                </span>
                <span className={`w-3 h-3 rounded-full ${getSignalColor(signal)}`}></span>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-2">
                {f.elements.map(e => {
                  const elemSignal = evaluateSignal(e.mean, e.distribution.bottom2);
                  return (
                    <div
                      key={e.element_id}
                      className="bg-gray-50 rounded px-3 py-2 text-sm flex items-center justify-between"
                    >
                      <span className="text-gray-600 truncate mr-2" title={e.element_name}>
                        {e.element_name}
                      </span>
                      <div className="flex items-center gap-1">
                        <span className="font-bold text-gray-800">
                          {e.mean?.toFixed(2) ?? '-'}
                        </span>
                        <span className={`w-2 h-2 rounded-full ${getSignalColor(elemSignal)}`}></span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
