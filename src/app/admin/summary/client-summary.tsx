'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { SummaryResponse } from '@/app/api/admin/summary/route';
import { FactorScore, ElementScore, SurveySummary } from '@/lib/types';
import { normalizeLabel } from '@/lib/utils';
import { getSignal, getSignalBgClass, getSignalLabel } from '@/lib/signal';

// 7つのキー設問（管理No 1〜7）- question_id_mapping.jsonと完全一致
const KEY_QUESTIONS = [
  { mgmt_no: 1, category: '会社の満足度', concept: 'F1', questions: { MANAGER: 'MANAGER-Q29', STAFF: 'STAFF-Q29', PA: 'PA-Q22' } },
  { mgmt_no: 2, category: '職務満足度', concept: 'F1', questions: { MANAGER: 'MANAGER-Q28', STAFF: 'STAFF-Q28', PA: 'PA-Q21' } },
  { mgmt_no: 3, category: '会社の将来像への期待', concept: 'F2', questions: { MANAGER: 'MANAGER-Q18', STAFF: null, PA: null } },
  { mgmt_no: 4, category: '顧客視点意識', concept: 'F2', questions: { MANAGER: 'MANAGER-Q49', STAFF: 'STAFF-Q46', PA: 'PA-Q33' } },
  { mgmt_no: 5, category: '貢献意欲', concept: 'F3', questions: { MANAGER: 'MANAGER-Q27', STAFF: null, PA: null } },
  { mgmt_no: 6, category: '勤続意思', concept: 'F3', questions: { MANAGER: 'MANAGER-Q26', STAFF: 'STAFF-Q26', PA: null } },
  { mgmt_no: 7, category: '効果的チーム', concept: 'F3', questions: { MANAGER: 'MANAGER-Q65', STAFF: null, PA: null } },
];

/**
 * ローディングスピナー
 */
function LoadingSpinner() {
  return (
    <div className="flex justify-center items-center h-64">
      <div className="animate-spin h-10 w-10 border-4 border-blue-500 rounded-full border-t-transparent"></div>
    </div>
  );
}

/**
 * ローディングオーバーレイ（データ更新中）
 */
function LoadingOverlay() {
  return (
    <div className="fixed inset-0 bg-white/60 backdrop-blur-sm z-50 flex items-center justify-center">
      <div className="bg-white rounded-xl shadow-lg px-8 py-6 flex items-center gap-4 border border-gray-200">
        <div className="animate-spin h-6 w-6 border-3 border-blue-500 rounded-full border-t-transparent"></div>
        <span className="text-gray-700 font-bold">Loading...</span>
      </div>
    </div>
  );
}

/**
 * ツールチップ（薄め・透過）
 */
function Tooltip({ children, content }: { children: React.ReactNode; content: React.ReactNode }) {
  return (
    <span className="relative group cursor-help inline-block">
      {children}
      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-4 py-3 bg-gray-700/80 text-gray-100 text-xs rounded-xl opacity-0 group-hover:opacity-100 transition-all duration-200 pointer-events-none whitespace-normal z-[100] shadow-lg backdrop-blur-md min-w-[220px] border border-gray-500/30">
        <div className="space-y-1">
          {content}
        </div>
        <span className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-700/80"></span>
      </div>
    </span>
  );
}

/**
 * 因子のBottom2比率を計算（配下要素のBottom2を平均）
 */
function calcFactorBottom2(elements: ElementScore[]): number | null {
  const validElements = elements.filter(e => e.distribution && e.distribution.n > 0);
  if (validElements.length === 0) return null;
  const totalBottom2 = validElements.reduce((sum, e) => sum + e.distribution.bottom2, 0);
  return totalBottom2 / validElements.length;
}

/**
 * 因子の分布を計算（配下要素の分布を平均）
 */
function calcFactorDistribution(elements: ElementScore[]): { top2: number; mid: number; bottom2: number } | null {
  const validElements = elements.filter(e => e.distribution && e.distribution.n > 0);
  if (validElements.length === 0) return null;
  const top2 = validElements.reduce((sum, e) => sum + e.distribution.top2, 0) / validElements.length;
  const mid = validElements.reduce((sum, e) => sum + e.distribution.mid, 0) / validElements.length;
  const bottom2 = validElements.reduce((sum, e) => sum + e.distribution.bottom2, 0) / validElements.length;
  return { top2, mid, bottom2 };
}

/**
 * 分布バー（Top2/Mid/Bottom2を色分け表示）
 */
function DistributionBar({ top2, mid, bottom2 }: { top2: number; mid: number; bottom2: number }) {
  const top2Pct = Math.round(top2 * 100);
  const midPct = Math.round(mid * 100);
  const bottom2Pct = Math.round(bottom2 * 100);

  return (
    <Tooltip content={
      <div className="text-xs">
        <div className="flex items-center gap-2 mb-1">
          <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
          <span>ポジティブ（4-5）: {top2Pct}%</span>
        </div>
        <div className="flex items-center gap-2 mb-1">
          <span className="w-2 h-2 rounded-full bg-gray-400"></span>
          <span>中立（3）: {midPct}%</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-rose-500"></span>
          <span>ネガティブ（1-2）: {bottom2Pct}%</span>
        </div>
      </div>
    }>
      <div className="flex items-center gap-1.5 cursor-help">
        <div className="flex h-2 w-20 rounded-full overflow-hidden bg-gray-200">
          <div className="bg-emerald-500" style={{ width: `${top2Pct}%` }}></div>
          <div className="bg-gray-400" style={{ width: `${midPct}%` }}></div>
          <div className="bg-rose-500" style={{ width: `${bottom2Pct}%` }}></div>
        </div>
        <span className="text-[10px] text-gray-400 font-mono w-8">{bottom2Pct}%</span>
      </div>
    </Tooltip>
  );
}

/**
 * 信号バッジ（スコア＋Bottom2比率で判定）
 */
function SignalBadge({ score, bottom2Rate }: { score: number | null | undefined; bottom2Rate?: number | null }) {
  const signal = getSignal(score, bottom2Rate);
  const label = getSignalLabel(signal);
  const classes = {
    bad: 'bg-red-100 text-red-800 border-red-200',
    warn: 'bg-yellow-100 text-yellow-800 border-yellow-200',
    good: 'bg-green-100 text-green-800 border-green-200',
  };

  return (
    <span className={`px-2 py-0.5 rounded text-xs border font-medium ${classes[signal]}`}>
      {label}
    </span>
  );
}

/**
 * 差分（Δ）表示 - 欠損時は「—」表示
 */
function DeltaDisplay({ current, target, label }: { current?: number | null, target?: number | null, label: string }) {
  // currentがなければ何も表示しない
  if (current == null) return null;

  // targetがない場合は「—」表示（クラッシュ防止）
  if (target == null) {
    return (
      <div className="text-[11px] leading-tight flex items-center gap-1 font-medium">
        <span className="text-gray-400 min-w-[60px]">{label}:</span>
        <span className="text-gray-300 font-bold">—</span>
      </div>
    );
  }

  const diff = current - target;
  const colorClass = diff > 0 ? 'text-green-600' : diff < 0 ? 'text-red-600' : 'text-gray-500';
  const sign = diff > 0 ? '+' : diff < 0 ? '' : '±';

  return (
    <div className="text-[11px] leading-tight flex items-center gap-1 font-medium">
      <span className="text-gray-400 min-w-[60px]">{label}:</span>
      <span className={`font-black ${colorClass}`}>{sign}{diff.toFixed(2)}</span>
    </div>
  );
}

export default function ClientSummary() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();

  // 現在のフィルタ状態（URLから取得）
  const params = useMemo(() => ({
    as_of: searchParams.get('as_of') || '',
    segment: searchParams.get('segment') || 'store_code',
    hq: searchParams.get('hq') || 'all',
    dept: searchParams.get('dept') || 'all',
    section: searchParams.get('section') || 'all',
    area: searchParams.get('area') || 'all',
    business_type: searchParams.get('business_type') || 'all',
    office: searchParams.get('office') || 'all',
    mode: (searchParams.get('mode') || 'abs') as 'abs' | 'diff',
    compare: (searchParams.get('compare') || 'overall') as 'prev1' | 'prev2' | 'overall',
  }), [searchParams]);

  const [data, setData] = useState<SummaryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  // パラメータ変更時にURLを更新
  const updateParams = (updates: Partial<typeof params>) => {
    const next = new URLSearchParams(searchParams.toString());
    Object.entries(updates).forEach(([k, v]) => {
      if (v) next.set(k, v);
      else next.delete(k);
    });
    router.push(`${pathname}?${next.toString()}`);
  };

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      setError(null);
      try {
        const query = new URLSearchParams(searchParams.toString()).toString();
        const res = await fetch(`/api/admin/summary?${query}`);
        const json = await res.json();

        if (!res.ok) {
          if (res.status === 401) { window.location.href = '/'; return; }
          throw new Error(json.details || json.error || 'データの取得に失敗しました');
        }
        setData(json);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [searchParams]);

  if (loading && !data) return <LoadingSpinner />;
  if (error) return <div className="p-6 text-red-600 bg-red-50 rounded m-6 border border-red-200">エラーが発生しました: {error}</div>;
  if (!data?.current) return <div className="p-6 text-gray-500 text-center">表示可能なデータがありません</div>;

  const { current, prev1, prev2, overallAvg, orgUnits } = data;
  const heatmapTarget = params.compare === 'prev1' ? prev1 : params.compare === 'prev2' ? prev2 : overallAvg;

  // フィルタ選択肢（階層: 本部 → 事業部 → 課 → エリア → 業態 → 事業所）
  const filterByParent = (ou: any) => {
    if (params.hq !== 'all' && ou.hq !== params.hq) return false;
    if (params.dept !== 'all' && ou.dept !== params.dept) return false;
    if (params.section !== 'all' && ou.section !== params.section) return false;
    if (params.area !== 'all' && ou.area !== params.area) return false;
    if (params.business_type !== 'all' && ou.business_type !== params.business_type) return false;
    return true;
  };

  const hqs = Array.from(new Set(orgUnits?.map(ou => ou.hq).filter(Boolean)));
  const depts = Array.from(new Set(orgUnits?.filter(ou => params.hq === 'all' || ou.hq === params.hq).map(ou => ou.dept).filter(Boolean)));
  const sections = Array.from(new Set(orgUnits?.filter(ou => (params.hq === 'all' || ou.hq === params.hq) && (params.dept === 'all' || ou.dept === params.dept)).map(ou => ou.section).filter(Boolean)));
  const areas = Array.from(new Set(orgUnits?.filter(ou => (params.hq === 'all' || ou.hq === params.hq) && (params.dept === 'all' || ou.dept === params.dept) && (params.section === 'all' || ou.section === params.section)).map(ou => ou.area).filter(Boolean)));
  const businessTypes = Array.from(new Set(orgUnits?.filter(ou => (params.hq === 'all' || ou.hq === params.hq) && (params.dept === 'all' || ou.dept === params.dept) && (params.section === 'all' || ou.section === params.section) && (params.area === 'all' || ou.area === params.area)).map(ou => ou.business_type).filter(Boolean)));
  const offices = orgUnits?.filter(filterByParent) || [];

  const handleExport = async () => {
    setExporting(true);
    try {
      const query = new URLSearchParams();
      query.set('survey_id', current.summary.surveyId);
      window.location.href = `/api/admin/export?${query.toString()}`;
    } finally {
      setTimeout(() => setExporting(false), 2000);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* ローディングオーバーレイ */}
      {loading && data && <LoadingOverlay />}

      <header className="sticky top-0 z-20 bg-white shadow-sm border-b border-gray-200 px-4 md:px-6 py-2 md:py-3">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-2 mb-2">
          <div>
            <h1 className="text-xl md:text-2xl font-black text-gray-900 tracking-tight">{normalizeLabel(current.summary.surveyId)} 組織診断サマリー</h1>
            <p className="hidden md:block text-sm text-gray-500 mt-0.5 font-medium italic">組織のコンディションを定量的に把握し、対話を促進します</p>
          </div>
          {data.is_owner && (
            <button onClick={handleExport} disabled={exporting} className="px-3 py-1.5 bg-blue-600 text-white rounded text-xs font-bold hover:bg-blue-700 disabled:opacity-50 shadow-sm">
              {exporting ? '処理中...' : 'CSVダウンロード'}
            </button>
          )}
        </div>

        {/* フィルタスライサー */}
        <div className="grid grid-cols-3 md:flex md:flex-nowrap bg-gray-100 p-1.5 rounded-lg gap-1.5 md:gap-2 text-sm overflow-x-auto">
          <select value={params.hq} onChange={e => updateParams({ hq: e.target.value, dept: 'all', section: 'all', area: 'all', business_type: 'all', office: 'all' })} className="bg-white border-gray-300 rounded px-2 py-1 text-xs font-bold shadow-sm truncate min-w-0"><option value="all">本部: 全て</option>{hqs.map(v => <option key={v as string} value={v as string}>{v as string}</option>)}</select>
          <select value={params.dept} onChange={e => updateParams({ dept: e.target.value, section: 'all', area: 'all', business_type: 'all', office: 'all' })} className="bg-white border-gray-300 rounded px-2 py-1 text-xs font-bold shadow-sm truncate min-w-0"><option value="all">事業部: 全て</option>{depts.map(v => <option key={v as string} value={v as string}>{v as string}</option>)}</select>
          <select value={params.section} onChange={e => updateParams({ section: e.target.value, area: 'all', business_type: 'all', office: 'all' })} className="bg-white border-gray-300 rounded px-2 py-1 text-xs font-bold shadow-sm truncate min-w-0"><option value="all">課: 全て</option>{sections.map(v => <option key={v as string} value={v as string}>{v as string}</option>)}</select>
          <select value={params.area} onChange={e => updateParams({ area: e.target.value, business_type: 'all', office: 'all' })} className="bg-white border-gray-300 rounded px-2 py-1 text-xs font-bold shadow-sm truncate min-w-0"><option value="all">エリア: 全て</option>{areas.map(v => <option key={v as string} value={v as string}>{v as string}</option>)}</select>
          <select value={params.business_type} onChange={e => updateParams({ business_type: e.target.value, office: 'all' })} className="bg-white border-gray-300 rounded px-2 py-1 text-xs font-bold shadow-sm truncate min-w-0"><option value="all">業態: 全て</option>{businessTypes.map(v => <option key={v as string} value={v as string}>{v as string}</option>)}</select>
          <select value={params.office} onChange={e => updateParams({ office: e.target.value })} className="bg-white border-gray-300 rounded px-2 py-1 text-xs font-bold shadow-sm truncate min-w-0"><option value="all">事業所: 全て</option>{offices.map(ou => <option key={ou.store_code} value={ou.store_code}>{ou.store_name}</option>)}</select>
        </div>
      </header>

      <main className="px-4 md:px-6 py-4 space-y-4 max-w-7xl mx-auto">
        {/* KPI・信号表示 */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-5 md:p-6">
          <div className="flex flex-col md:flex-row gap-6 md:gap-8 items-center md:items-stretch">
            <div className="text-center md:border-r md:pr-8 border-gray-200 min-w-[260px] flex flex-col justify-center">
              {/* 回答状況 */}
              <div className="mb-4 px-4 py-3 bg-blue-50/50 rounded-xl border border-blue-100 inline-flex gap-6 mx-auto items-center">
                <div className="text-center"><div className="text-xs text-gray-500 font-bold">有効回答</div><div className="text-2xl font-black text-gray-900 leading-none">{current.summary.n}<small className="text-sm ml-0.5 font-bold text-gray-400">名</small></div></div>
                <div className="w-px h-8 bg-blue-200"></div>
                <div className="text-center"><div className="text-xs text-gray-500 font-bold">回答率</div><div className="text-2xl font-black text-gray-900 leading-none">{(current.summary.responseRate.byRespondent.rate * 100).toFixed(1)}<small className="text-sm ml-0.5 font-bold text-gray-400">%</small></div></div>
              </div>

              <h3 className="text-gray-400 text-[10px] font-black tracking-[0.15em] mb-2 uppercase">Total Engagement</h3>
              <div className="flex items-baseline gap-1 justify-center">
                <Tooltip content={
                    <>
                        <div className="font-bold border-b border-gray-400/30 pb-1 mb-2">総合スコア</div>
                        <div className="font-mono text-[11px] bg-gray-600/50 px-2 py-1 rounded mb-2">
                          = Σ因子スコア / 因子数<br/>
                          = {current.summary.factorScores.filter(f => f.mean != null).map(f => f.mean!.toFixed(2)).join(' + ')} / {current.summary.factorScores.filter(f => f.mean != null).length}
                        </div>
                        <div className="text-gray-300">有効回答: {current.summary.n}名</div>
                    </>
                }>
                    <span className="text-6xl md:text-7xl font-black text-gray-900 leading-none hover:text-blue-600 transition-colors">{current.summary.overallScore?.toFixed(2) ?? '-'}</span>
                </Tooltip>
                <span className="text-gray-300 text-xl font-black">/5.0</span>
              </div>
              {(() => {
                // 全因子の分布を平均
                const allDists = current.summary.factorScores.map(fs => calcFactorDistribution(fs.elements)).filter((d): d is { top2: number; mid: number; bottom2: number } => d != null);
                const avgDist = allDists.length > 0 ? {
                  top2: allDists.reduce((s, d) => s + d.top2, 0) / allDists.length,
                  mid: allDists.reduce((s, d) => s + d.mid, 0) / allDists.length,
                  bottom2: allDists.reduce((s, d) => s + d.bottom2, 0) / allDists.length,
                } : null;
                return (
                  <div className="mt-3 flex flex-col items-center gap-2">
                    <SignalBadge score={current.summary.overallScore} bottom2Rate={avgDist?.bottom2} />
                    {avgDist && <DistributionBar top2={avgDist.top2} mid={avgDist.mid} bottom2={avgDist.bottom2} />}
                  </div>
                );
              })()}
              {/* Δ比較 - 常時表示、全体平均を先頭に */}
              <div className="mt-4 px-4 py-3 bg-gray-50/80 rounded-xl border border-gray-100">
                <DeltaDisplay current={current.summary.overallScore} target={overallAvg?.summary.overallScore} label="Δ全体平均" />
                <DeltaDisplay current={current.summary.overallScore} target={prev1?.summary.overallScore} label="Δ前回" />
              </div>
            </div>

            <div className="flex-1">
              <h3 className="text-gray-500 text-xs font-bold mb-3 uppercase tracking-wider">因子別分析</h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {(() => {
                  // ランキング計算（選択された階層内での順位）
                  const allSegmentScores = current.segmentScores || [];
                  const factorRanks: Record<string, { rank: number; total: number }> = {};

                  if (params.office !== 'all') {
                    // 事業所が選択されている場合、同階層内でランキング
                    current.summary.factorScores.forEach(fs => {
                      const scores = allSegmentScores
                        .filter(s => s.n >= 5)
                        .map(s => ({ key: s.segmentKey, mean: (s.factorScores as any)[fs.factor_id]?.mean }))
                        .filter(s => s.mean != null)
                        .sort((a, b) => (b.mean ?? 0) - (a.mean ?? 0));
                      const idx = scores.findIndex(s => s.key === params.office);
                      if (idx >= 0) {
                        factorRanks[fs.factor_id] = { rank: idx + 1, total: scores.length };
                      }
                    });
                  }

                  return current.summary.factorScores.map((fs) => {
                    const signal = getSignal(fs.mean);
                    const p1 = prev1?.summary.factorScores.find((f) => f.factor_id === fs.factor_id)?.mean;
                    const oa = overallAvg?.summary.factorScores.find((f) => f.factor_id === fs.factor_id)?.mean;
                    const dist = calcFactorDistribution(fs.elements);
                    const rank = factorRanks[fs.factor_id];

                    return (
                      <div key={fs.factor_id} className={`p-5 rounded-xl border transition-all ${getSignalBgClass(signal)} flex flex-col justify-between shadow-sm hover:shadow-md`}>
                        <div>
                          <div className="flex items-center justify-between gap-2 mb-1">
                            <div className="text-xs md:text-sm font-black opacity-70 tracking-wide truncate">{normalizeLabel(fs.factor_name)}</div>
                            {rank && (
                              <span className="text-[10px] font-bold text-gray-500 bg-white/50 px-1.5 py-0.5 rounded shrink-0">
                                {rank.rank}/{rank.total}位
                              </span>
                            )}
                          </div>
                          <Tooltip content={
                              <>
                                  <div className="font-bold border-b border-gray-400/30 pb-1 mb-2">{normalizeLabel(fs.factor_name)}</div>
                                  <div className="font-mono text-[11px] bg-gray-600/50 px-2 py-1 rounded mb-2">
                                    = Σ要素スコア / 要素数<br/>
                                    = {fs.elements.filter(e => e.mean != null).map(e => e.mean!.toFixed(2)).join(' + ')} / {fs.elements.filter(e => e.mean != null).length}
                                  </div>
                                  <div className="text-gray-300">有効回答: {current.summary.n}名</div>
                              </>
                          }>
                              <div className="text-4xl font-black leading-tight hover:text-blue-700 transition-colors pointer-events-auto">{fs.mean?.toFixed(2) ?? '-'}</div>
                          </Tooltip>
                          <div className="mt-2 flex items-center gap-2 flex-wrap">
                            <SignalBadge score={fs.mean} bottom2Rate={calcFactorBottom2(fs.elements)} />
                            {dist && <DistributionBar top2={dist.top2} mid={dist.mid} bottom2={dist.bottom2} />}
                          </div>
                        </div>
                        <div className="mt-3 pt-3 border-t border-black/5 space-y-0.5">
                          <DeltaDisplay current={fs.mean} target={oa} label="Δ全体平均" />
                          <DeltaDisplay current={fs.mean} target={p1} label="Δ前回" />
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>
              {/* 信号判定の凡例 */}
              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-gray-400">
                <span className="font-bold text-gray-500">信号判定:</span>
                <span><span className="inline-block w-2 h-2 rounded-full bg-green-500 mr-1"></span>良好: スコア≧3.8 & ネガティブ&lt;10%</span>
                <span><span className="inline-block w-2 h-2 rounded-full bg-yellow-500 mr-1"></span>注意: どちらか一方のみ</span>
                <span><span className="inline-block w-2 h-2 rounded-full bg-red-500 mr-1"></span>要改善: スコア&lt;3.8 & ネガティブ≧10%</span>
                <span className="text-[9px] text-gray-300">※ネガティブ = 回答「1」または「2」の比率</span>
              </div>
            </div>
          </div>
        </div>

        {/* 7つのキー設問ヒートマップ */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-visible">
          <div className="p-3 border-b border-gray-100 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 bg-gray-50/50">
            <h3 className="font-black text-gray-800 flex items-center gap-2 text-sm uppercase tracking-widest">
              7 Key Indicators
            </h3>
            <div className="flex flex-wrap gap-2">
              <div className="flex bg-white rounded-lg p-1 shadow-inner border border-gray-200 mr-2">
                <button onClick={() => updateParams({ mode: 'abs' })} className={`px-3 py-1 text-[10px] font-bold rounded-md transition-all ${params.mode === 'abs' ? 'bg-gray-800 text-white shadow-md' : 'text-gray-400 hover:text-gray-600'}`}>絶対値</button>
                <button onClick={() => updateParams({ mode: 'diff' })} className={`px-3 py-1 text-[10px] font-bold rounded-md transition-all ${params.mode === 'diff' ? 'bg-gray-800 text-white shadow-md' : 'text-gray-400 hover:text-gray-600'}`}>差分表示</button>
              </div>
              {params.mode === 'diff' && (
                <select value={params.compare} onChange={e => updateParams({ compare: e.target.value as any })} className="text-[10px] font-bold border-gray-200 rounded-lg px-2 py-1 shadow-sm">
                  <option value="prev1">前回比較</option>
                  <option value="prev2">前々回比較</option>
                  <option value="overall">全体平均比較</option>
                </select>
              )}
              <div className="flex bg-white rounded-lg p-1 shadow-inner border border-gray-200">
                {['office', 'role', 'age'].map(tab => (
                  <button key={tab} onClick={() => updateParams({ segment: tab === 'office' ? 'store_code' : tab as any })} className={`px-3 py-1 text-[10px] font-bold rounded-md transition-all ${params.segment === (tab === 'office' ? 'store_code' : tab) ? 'bg-blue-600 text-white shadow-md' : 'text-gray-400 hover:text-gray-600'}`}>
                    {tab === 'office' ? '事業所' : tab === 'role' ? '役職' : '年代'}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="overflow-x-auto overflow-y-visible">
            <table className="w-full text-sm text-left border-collapse">
              <thead>
                <tr className="bg-gray-50/80">
                  <th className="px-3 py-2 sticky left-0 z-10 bg-gray-50 border-r border-gray-200 min-w-[120px] font-bold text-gray-400 uppercase text-[10px]">Segment</th>
                  <th className="px-2 py-2 text-center border-r border-gray-200 min-w-[30px] font-bold text-gray-400 lowercase text-[10px]">n</th>
                  {KEY_QUESTIONS.map((kq) => (
                    <th key={kq.mgmt_no} className={`px-2 py-2 text-center border-b border-gray-200 min-w-[70px] font-bold text-[10px] leading-tight ${
                      kq.concept === 'F1' ? 'text-blue-700 bg-blue-50/50' :
                      kq.concept === 'F2' ? 'text-emerald-700 bg-emerald-50/50' :
                      'text-purple-700 bg-purple-50/50'
                    }`}>
                      {kq.category}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {current.segmentScores?.map(row => {
                  const n = row.n;
                  const isSmallN = n < 5;

                  return (
                    <tr key={row.segmentKey} className="hover:bg-gray-50/50 transition-colors group">
                      <td className="px-3 py-2 font-bold sticky left-0 bg-white group-hover:bg-gray-50/50 border-r border-gray-200 text-gray-700 truncate max-w-[120px] text-xs" title={row.segmentName}>{normalizeLabel(row.segmentName)}</td>
                      <td className={`px-2 py-2 text-center border-r border-gray-200 font-mono text-xs ${isSmallN ? 'text-red-400 bg-red-50/30' : 'text-gray-400'}`}>{n}</td>
                      {KEY_QUESTIONS.map((kq) => {
                        if (isSmallN) return <td key={kq.mgmt_no} className="px-2 py-2 text-center text-gray-300 bg-gray-50/30 text-xs">—</td>;

                        // element_id = mgmt_no で取得
                        const es = (row.elementScores as any)?.[String(kq.mgmt_no)];
                        const val = es?.mean ?? null;
                        const dist = es?.distribution;
                        const bottom2 = dist?.bottom2 ?? null;

                        // 比較データ
                        const oaEs = overallAvg?.segmentScores?.find((s: any) => s.segmentKey === row.segmentKey)?.elementScores?.[String(kq.mgmt_no)];
                        const p1Es = prev1?.segmentScores?.find((s: any) => s.segmentKey === row.segmentKey)?.elementScores?.[String(kq.mgmt_no)];

                        let displayValue = val?.toFixed(2) ?? '-';
                        let cellClass = "";

                        if (params.mode === 'diff' && heatmapTarget) {
                          const targetEs = heatmapTarget.segmentScores?.find((s: any) => s.segmentKey === row.segmentKey)?.elementScores?.[String(kq.mgmt_no)];
                          const targetVal = targetEs?.mean ?? null;
                          if (val != null && targetVal != null) {
                            const diff = val - targetVal;
                            displayValue = (diff > 0 ? '+' : '') + diff.toFixed(2);
                            cellClass = diff > 0.1 ? 'bg-green-100 text-green-900' : diff < -0.1 ? 'bg-red-100 text-red-900' : 'bg-gray-100 text-gray-600';
                          } else {
                            displayValue = '-';
                            cellClass = 'bg-gray-50 text-gray-300';
                          }
                        } else {
                          const signal = getSignal(val, bottom2);
                          cellClass = getSignalBgClass(signal);
                        }

                        const oaDiff = val != null && oaEs?.mean != null ? val - oaEs.mean : null;
                        const p1Diff = val != null && p1Es?.mean != null ? val - p1Es.mean : null;

                        return (
                          <td key={kq.mgmt_no} className={`px-1 py-1.5 text-center border-r border-gray-50 ${cellClass}`}>
                            <div className="flex flex-col items-center gap-0.5">
                              <span className="font-black text-sm leading-none">{displayValue}</span>
                              {params.mode === 'abs' && (
                                <div className="flex gap-1 text-[8px] leading-none opacity-80">
                                  {oaDiff != null && (
                                    <span className={oaDiff > 0 ? 'text-green-700' : oaDiff < 0 ? 'text-red-700' : 'text-gray-400'}>
                                      {oaDiff > 0 ? '+' : ''}{oaDiff.toFixed(1)}
                                    </span>
                                  )}
                                </div>
                              )}
                              {bottom2 != null && (
                                <span className={`text-[8px] leading-none ${bottom2 >= 0.1 ? 'text-rose-600 font-bold' : 'text-gray-400'}`}>
                                  {Math.round(bottom2 * 100)}%
                                </span>
                              )}
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="p-2 bg-gray-50 text-[10px] text-center text-gray-400 border-t border-gray-200 italic font-medium flex flex-wrap justify-center gap-4">
            <span><span className="inline-block w-2 h-2 rounded bg-blue-100 mr-1"></span>F1: 組織活性化の源泉</span>
            <span><span className="inline-block w-2 h-2 rounded bg-emerald-100 mr-1"></span>F2: 収益性向上エンゲージメント</span>
            <span><span className="inline-block w-2 h-2 rounded bg-purple-100 mr-1"></span>F3: チーム力と持続性</span>
            <span className="text-gray-300">| n&lt;5はマスキング表示</span>
          </div>
        </div>

        {/* 因子別 強み・弱み */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-100">
            <h3 className="text-sm font-black text-blue-600 mb-3 tracking-wider uppercase flex items-center gap-2">
              <span className="w-1.5 h-5 bg-blue-600 rounded-full"></span>
              ▲ Strong Factor
            </h3>
            {(() => {
              const sorted = [...current.summary.factorScores].filter(f => f.mean != null).sort((a, b) => (b.mean ?? 0) - (a.mean ?? 0));
              const top = sorted[0];
              if (!top) return <div className="text-gray-400 text-sm">データなし</div>;
              const oaF = overallAvg?.summary.factorScores.find(f => f.factor_id === top.factor_id);
              const p1F = prev1?.summary.factorScores.find(f => f.factor_id === top.factor_id);
              const dist = calcFactorDistribution(top.elements);
              return (
                <div className="p-4 bg-blue-50/50 rounded-xl border border-blue-100">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-lg font-black text-gray-800">{normalizeLabel(top.factor_name)}</span>
                    <span className="text-3xl font-black text-blue-700">{top.mean?.toFixed(2)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex gap-4">
                      <DeltaDisplay current={top.mean} target={oaF?.mean} label="Δ全体" />
                      <DeltaDisplay current={top.mean} target={p1F?.mean} label="Δ前回" />
                    </div>
                    {dist && <DistributionBar top2={dist.top2} mid={dist.mid} bottom2={dist.bottom2} />}
                  </div>
                </div>
              );
            })()}
          </div>
          <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-100">
            <h3 className="text-sm font-black text-red-600 mb-3 tracking-wider uppercase flex items-center gap-2">
              <span className="w-1.5 h-5 bg-red-600 rounded-full"></span>
              ▼ Weak Factor
            </h3>
            {(() => {
              const sorted = [...current.summary.factorScores].filter(f => f.mean != null).sort((a, b) => (a.mean ?? 0) - (b.mean ?? 0));
              const bottom = sorted[0];
              if (!bottom) return <div className="text-gray-400 text-sm">データなし</div>;
              const oaF = overallAvg?.summary.factorScores.find(f => f.factor_id === bottom.factor_id);
              const p1F = prev1?.summary.factorScores.find(f => f.factor_id === bottom.factor_id);
              const dist = calcFactorDistribution(bottom.elements);
              return (
                <div className="p-4 bg-red-50/50 rounded-xl border border-red-100">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-lg font-black text-gray-800">{normalizeLabel(bottom.factor_name)}</span>
                    <span className="text-3xl font-black text-red-700">{bottom.mean?.toFixed(2)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex gap-4">
                      <DeltaDisplay current={bottom.mean} target={oaF?.mean} label="Δ全体" />
                      <DeltaDisplay current={bottom.mean} target={p1F?.mean} label="Δ前回" />
                    </div>
                    {dist && <DistributionBar top2={dist.top2} mid={dist.mid} bottom2={dist.bottom2} />}
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      </main>
    </div>
  );
}
