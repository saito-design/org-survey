'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { SummaryResponse } from '@/app/api/admin/summary/route';
import { FactorScore, ElementScore, SurveySummary } from '@/lib/types';
import { normalizeLabel } from '@/lib/utils';
import { getSignal, getSignalBgClass, getSignalLabel } from '@/lib/signal';

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
 * 信号バッジ
 */
function SignalBadge({ score }: { score: number | null | undefined }) {
  const signal = getSignal(score);
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
    area: searchParams.get('area') || 'all',
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

  // フィルタ選択肢
  const hqs = Array.from(new Set(orgUnits?.map(ou => ou.hq).filter(Boolean)));
  const depts = Array.from(new Set(orgUnits?.filter(ou => params.hq === 'all' || ou.hq === params.hq).map(ou => ou.dept).filter(Boolean)));
  const areas = Array.from(new Set(orgUnits?.filter(ou => (params.hq === 'all' || ou.hq === params.hq) && (params.dept === 'all' || ou.dept === params.dept)).map(ou => ou.area).filter(Boolean)));
  const offices = orgUnits?.filter(ou => (params.hq === 'all' || ou.hq === params.hq) && (params.dept === 'all' || ou.dept === params.dept) && (params.area === 'all' || ou.area === params.area)) || [];

  const handleExport = async (type: 'markdown' | 'csv') => {
    setExporting(true);
    try {
      const query = new URLSearchParams(searchParams.toString());
      query.set('type', type);
      window.location.href = `/api/admin/export?${query.toString()}`;
    } finally {
      setTimeout(() => setExporting(false), 2000);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      <header className="sticky top-0 z-20 bg-white shadow-sm border-b border-gray-200 px-4 md:px-6 py-2 md:py-3">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-2 mb-2">
          <div>
            <h1 className="text-xl md:text-2xl font-black text-gray-900 tracking-tight">{normalizeLabel(current.summary.surveyId)} 組織診断サマリー</h1>
            <p className="hidden md:block text-sm text-gray-500 mt-0.5 font-medium italic">組織のコンディションを定量的に把握し、対話を促進します</p>
          </div>
          {data.is_owner && (
            <div className="flex gap-2 w-full md:w-auto">
              <button onClick={() => handleExport('markdown')} disabled={exporting} className="flex-1 md:flex-none px-2 py-1 bg-white border border-gray-300 rounded text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">NotebookLM用</button>
              <button onClick={() => handleExport('csv')} disabled={exporting} className="flex-1 md:flex-none px-2 py-1 bg-blue-600 text-white rounded text-xs font-medium hover:bg-blue-700 disabled:opacity-50">{exporting ? '処理中...' : 'CSV保存'}</button>
            </div>
          )}
        </div>

        {/* フィルタスライサー */}
        <div className="grid grid-cols-2 md:flex md:flex-nowrap bg-gray-100 p-1.5 rounded-lg gap-1.5 md:gap-2 text-sm">
          <select value={params.hq} onChange={e => updateParams({ hq: e.target.value, dept: 'all', area: 'all', office: 'all' })} className="bg-white border-gray-300 rounded px-2 py-1 text-xs font-bold shadow-sm truncate"><option value="all">本部: 全て</option>{hqs.map(v => <option key={v as string} value={v as string}>{v as string}</option>)}</select>
          <select value={params.dept} onChange={e => updateParams({ dept: e.target.value, area: 'all', office: 'all' })} className="bg-white border-gray-300 rounded px-2 py-1 text-xs font-bold shadow-sm truncate"><option value="all">部: 全て</option>{depts.map(v => <option key={v as string} value={v as string}>{v as string}</option>)}</select>
          <select value={params.area} onChange={e => updateParams({ area: e.target.value, office: 'all' })} className="bg-white border-gray-300 rounded px-2 py-1 text-xs font-bold shadow-sm truncate"><option value="all">エリア: 全て</option>{areas.map(v => <option key={v as string} value={v as string}>{v as string}</option>)}</select>
          <select value={params.office} onChange={e => updateParams({ office: e.target.value })} className="bg-white border-gray-300 rounded px-2 py-1 text-xs font-bold shadow-sm truncate"><option value="all">事業所: 全て</option>{offices.map(ou => <option key={ou.store_code} value={ou.store_code}>{ou.store_name}</option>)}</select>
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
              <div className="mt-3 flex justify-center"><SignalBadge score={current.summary.overallScore} /></div>
              {/* Δ比較 - 常時表示、全体平均を先頭に */}
              <div className="mt-4 px-4 py-3 bg-gray-50/80 rounded-xl border border-gray-100">
                <DeltaDisplay current={current.summary.overallScore} target={overallAvg?.summary.overallScore} label="Δ全体平均" />
                <DeltaDisplay current={current.summary.overallScore} target={prev1?.summary.overallScore} label="Δ前回" />
              </div>
            </div>

            <div className="flex-1">
              <h3 className="text-gray-500 text-xs font-bold mb-3 uppercase tracking-wider">因子別分析</h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {current.summary.factorScores.map((fs) => {
                  const signal = getSignal(fs.mean);
                  const p1 = prev1?.summary.factorScores.find((f) => f.factor_id === fs.factor_id)?.mean;
                  const oa = overallAvg?.summary.factorScores.find((f) => f.factor_id === fs.factor_id)?.mean;

                  return (
                    <div key={fs.factor_id} className={`p-5 rounded-xl border transition-all ${getSignalBgClass(signal)} flex flex-col justify-between shadow-sm hover:shadow-md`}>
                      <div>
                        <div className="text-[10px] font-black mb-1 opacity-60 uppercase tracking-widest truncate">{normalizeLabel(fs.factor_name)}</div>
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
                        <div className="mt-2"><SignalBadge score={fs.mean} /></div>
                      </div>
                      <div className="mt-3 pt-3 border-t border-black/5 space-y-0.5">
                        <DeltaDisplay current={fs.mean} target={oa} label="Δ全体平均" />
                        <DeltaDisplay current={fs.mean} target={p1} label="Δ前回" />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* 強み・課題 */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-100">
            <h3 className="text-sm font-black text-blue-600 mb-3 tracking-wider uppercase flex items-center gap-2">
              <span className="w-1.5 h-5 bg-blue-600 rounded-full"></span>
              ▲ Strengths (Top 3)
            </h3>
            <div className="space-y-3">
              {current.summary.strengths.map((el, i: number) => (
                <div key={el.element_id} className="flex justify-between items-center group">
                  <div className="flex items-center gap-3 overflow-hidden">
                    <span className="text-blue-200 text-lg font-black italic w-6">0{i + 1}</span>
                    <Tooltip content={
                        <>
                            <div className="font-bold border-b border-gray-400/30 pb-1 mb-2">{normalizeLabel(el.element_name)}</div>
                            <div className="font-mono text-[11px] bg-gray-600/50 px-2 py-1 rounded mb-2">
                              = Σ回答値 / 有効回答数
                            </div>
                            <div className="text-gray-300">有効回答: {current.summary.n}名</div>
                        </>
                    }>
                        <span className="text-sm text-gray-800 font-bold truncate leading-tight hover:text-blue-600 transition-colors">{normalizeLabel(el.element_name)}</span>
                    </Tooltip>
                  </div>
                  <span className="text-sm font-black text-blue-800 bg-blue-50 px-3 py-1 rounded-lg leading-none shadow-sm min-w-[50px] text-center">{el.mean.toFixed(2)}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-100">
            <h3 className="text-sm font-black text-red-600 mb-3 tracking-wider uppercase flex items-center gap-2">
              <span className="w-1.5 h-5 bg-red-600 rounded-full"></span>
              ▼ Weaknesses (Bottom 3)
            </h3>
            <div className="space-y-3">
              {current.summary.weaknesses.map((el, i: number) => (
                <div key={el.element_id} className="flex justify-between items-center group">
                  <div className="flex items-center gap-3 overflow-hidden">
                    <span className="text-red-200 text-lg font-black italic w-6">0{i + 1}</span>
                    <Tooltip content={
                        <>
                            <div className="font-bold border-b border-gray-400/30 pb-1 mb-2">{normalizeLabel(el.element_name)}</div>
                            <div className="font-mono text-[11px] bg-gray-600/50 px-2 py-1 rounded mb-2">
                              = Σ回答値 / 有効回答数
                            </div>
                            <div className="text-gray-300">有効回答: {current.summary.n}名</div>
                        </>
                    }>
                        <span className="text-sm text-gray-800 font-bold truncate leading-tight hover:text-red-600 transition-colors">{normalizeLabel(el.element_name)}</span>
                    </Tooltip>
                  </div>
                  <span className="text-sm font-black text-red-800 bg-red-50 px-3 py-1 rounded-lg leading-none shadow-sm min-w-[50px] text-center">{el.mean.toFixed(2)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ヒートマップ */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-visible">
          <div className="p-3 border-b border-gray-100 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 bg-gray-50/50">
            <h3 className="font-black text-gray-800 flex items-center gap-2 text-sm uppercase tracking-widest">
              Segment Heatmap
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
            <table className="w-full text-base text-left border-collapse">
              <thead>
                <tr className="bg-gray-50/80">
                  <th className="px-4 py-3 sticky left-0 z-10 bg-gray-50 border-r border-gray-200 min-w-[150px] font-bold text-gray-400 uppercase tracking-tighter">Segment</th>
                  <th className="px-2 py-3 text-center border-r border-gray-200 min-w-[40px] font-bold text-gray-400 lowercase">n</th>
                  {current.summary.factorScores.map((f) => (
                    <th key={f.factor_id} className="px-2 py-3 text-center border-b border-gray-200 min-w-[80px] font-black text-gray-600 leading-[1.1] whitespace-normal break-words">
                      {normalizeLabel(f.factor_name)}
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
                      <td className="px-4 py-3 font-bold sticky left-0 bg-white group-hover:bg-gray-50/50 border-r border-gray-200 text-gray-700 truncate max-w-[150px]" title={row.segmentName}>{normalizeLabel(row.segmentName)}</td>
                      <td className={`px-2 py-3 text-center border-r border-gray-200 font-mono ${isSmallN ? 'text-red-400 bg-red-50/30' : 'text-gray-400'}`}>{n}</td>
                      {current.summary.factorScores.map((f) => {
                        const fs = (row.factorScores as any)[f.factor_id];
                        const val = fs?.mean ?? null;
                        
                        if (isSmallN) return <td key={f.factor_id} className="px-2 py-3 text-center text-gray-300 bg-gray-50/30">—</td>;
                        
                        let displayValue = val?.toFixed(2) ?? '-';
                        let cellClass = "";
                        
                        if (params.mode === 'diff' && heatmapTarget) {
                            const targetFs = heatmapTarget.segmentScores?.find((s: any) => s.segmentKey === row.segmentKey)?.factorScores?.[f.factor_id];
                            const targetVal = targetFs?.mean ?? null;
                            if (val != null && targetVal != null) {
                                const diff = val - targetVal;
                                displayValue = (diff > 0 ? '+' : '') + diff.toFixed(2);
                                cellClass = diff > 0.1 ? 'bg-green-100 text-green-900' : diff < -0.1 ? 'bg-red-100 text-red-900' : 'bg-gray-100 text-gray-600';
                            } else {
                                displayValue = 'no data';
                                cellClass = 'bg-gray-50 text-gray-300';
                            }
                        } else {
                            const signal = getSignal(val);
                            cellClass = getSignalBgClass(signal);
                        }

                        return (
                          <td key={f.factor_id} className={`px-2 py-4 text-center font-black border-r border-gray-50 ${cellClass}`}>
                            <Tooltip content={
                                <>
                                    <div className="font-bold border-b border-gray-400/30 pb-1 mb-2">{row.segmentName}</div>
                                    <div className="font-mono text-[11px] bg-gray-600/50 px-2 py-1 rounded mb-2">
                                      {params.mode === 'diff'
                                        ? `Δ = 現在値 - ${params.compare === 'overall' ? '全社平均' : params.compare === 'prev1' ? '前回' : '前々回'}`
                                        : '= Σ回答値 / 有効回答数'
                                      }
                                    </div>
                                    <div className="text-gray-300">有効回答: {n}名</div>
                                </>
                            }>
                                <div className="cursor-default">{displayValue}</div>
                            </Tooltip>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="p-3 bg-gray-50 text-[10px] text-center text-gray-400 border-t border-gray-200 italic font-medium">
             ※ 回答者数 5名未満のセグメントは匿名性保護のためマスキング（—）表示されます。
          </div>
        </div>
      </main>
    </div>
  );
}
