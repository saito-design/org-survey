'use client';

import { useState, useEffect } from 'react';
import { SummaryResponse } from '@/app/api/admin/summary/route';
import { FactorScore, ElementScore } from '@/lib/types';
import { evaluateFactorSignal, evaluateOverallSignal, SignalResult } from '@/lib/aggregation';

function LoadingSpinner() {
  return (
    <div className="flex justify-center items-center h-64">
      <div className="animate-spin h-10 w-10 border-4 border-blue-500 rounded-full border-t-transparent"></div>
    </div>
  );
}

// 信号バッジコンポーネント
function SignalBadge({ result }: { result: SignalResult }) {
  const colors = {
    red: 'bg-red-100 text-red-800 border-red-200',
    yellow: 'bg-yellow-100 text-yellow-800 border-yellow-200',
    green: 'bg-green-100 text-green-800 border-green-200',
  };
  
  return (
    <span className={`px-2 py-0.5 rounded text-xs border ${colors[result.color]}`}>
      {result.label}
    </span>
  );
}

export default function ClientSummary() {
  const [data, setData] = useState<SummaryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ヒートマップ設定
  const [heatmapTab, setHeatmapTab] = useState<'store_code' | 'role' | 'age'>('store_code');
  const [minN, setMinN] = useState(3);

  useEffect(() => {
    async function fetchData() {
      try {
        const res = await fetch('/api/admin/summary?segment=store_code');
        const json = await res.json();

        if (!res.ok) {
          if (res.status === 401) {
            window.location.href = '/';
            return;
          }
          if (res.status === 403) throw new Error('管理者権限がありません');
          if (res.status === 404) throw new Error('回答データがまだありません');
          throw new Error(json.details || json.error || 'データの取得に失敗しました');
        }
        if (json.error) throw new Error(json.error);
        setData(json);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  if (loading) return <LoadingSpinner />;
  if (error) return <div className="p-4 text-red-600 bg-red-50 rounded">Error: {error}</div>;
  if (!data?.summary) return <div className="p-4">データがありません</div>;

  const { summary, segmentScores } = data;
  
  // KPI計算
  const overallScore = summary.overallScore?.toFixed(2) ?? '-';
  const responseCount = summary.overallScore !== null ? summary.n : 0; // summary.n は有効回答者数
  const responseRateVal = (summary.responseRate.byRespondent.rate * 100).toFixed(1);

  // 総合スコアの信号判定
  // elementScoresを使って計算
  const overallSignal = evaluateOverallSignal(summary.overallScore, summary.elementScores);

  // 強み・弱み
  const strengths = summary.strengths;
  const weaknesses = summary.weaknesses;

  // ヒートマップ用データ
  // segmentScores は Plain Object に変換されているため、型キャストが必要
  // APIレスポンスでは Map ではなく Object (Record<string, FactorScore>) になっている
  const heatmapRows = (segmentScores || []).map(row => ({
    ...row,
    factorScores: row.factorScores as unknown as Record<string, FactorScore>,
  }));

  // Factor定義順序（列）
  const factors = summary.factorScores.map(f => ({ id: f.factor_id, name: f.factor_name }));

  const handleExport = (type: 'markdown' | 'csv') => {
    const surveyId = data?.summary?.surveyId || '';
    const url = `/api/admin/export?type=${type}&survey_id=${surveyId}`;
    window.location.href = url;
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* Sticky Header */}
      <header className="sticky top-0 z-10 bg-white shadow-sm border-b border-gray-200 px-6 py-4">
        <div className="flex justify-between items-center mb-4">
          <div>
            <h1 className="text-xl font-bold text-gray-800">全社組織診断サマリー</h1>
            <div className="text-sm text-gray-500 mt-1 flex gap-4">
              <span>期間: {summary.surveyId}</span>
              <span>有効回答: <strong className="text-gray-900">{responseCount}</strong>名</span>
              <span>回答率: <strong className="text-gray-900">{responseRateVal}</strong>%</span>
            </div>
          </div>
          <div className="flex gap-2">
            <button 
              onClick={() => handleExport('markdown')}
              className="px-4 py-2 bg-white border border-gray-300 rounded hover:bg-gray-50 text-sm font-medium text-gray-700"
            >
              NotebookLM用出力
            </button>
            <button 
              onClick={() => handleExport('csv')}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm font-medium shadow-sm"
            >
              CSVダウンロード
            </button>
          </div>
        </div>

        {/* フィルタ (UIのみ) */}
        <div className="flex bg-gray-100 p-2 rounded gap-4 text-sm overflow-x-auto whitespace-nowrap">
          <select className="bg-white border border-gray-300 rounded px-2 py-1 text-gray-700"><option>本部: 全て</option></select>
          <select className="bg-white border border-gray-300 rounded px-2 py-1 text-gray-700"><option>部: 全て</option></select>
          <select className="bg-white border border-gray-300 rounded px-2 py-1 text-gray-700"><option>エリア: 全て</option></select>
          <select className="bg-white border border-gray-300 rounded px-2 py-1 text-gray-700"><option>事業所: 全て</option></select>
        </div>
      </header>

      <main className="px-6 py-6 space-y-6 max-w-7xl mx-auto">
        {/* KPI Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* 総合スコア */}
          <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200 flex flex-col justify-center items-center">
             <h3 className="text-gray-500 font-medium mb-2">総合エンゲージメントスコア</h3>
             <div className="flex items-baseline gap-2">
               <span className="text-5xl font-bold text-gray-900">{overallScore}</span>
               <span className="text-gray-400 text-lg">/ 5.0</span>
             </div>
             <div className="mt-3">
               <SignalBadge result={overallSignal} />
             </div>
          </div>

          {/* 強み TOP3 */}
          <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
            <h3 className="text-gray-500 font-medium mb-4 flex items-center gap-2">
              <span className="text-blue-500">●</span> 組織の強み (Top 3)
            </h3>
            <div className="space-y-3">
              {strengths.map((el, i) => (
                <div key={el.element_id} className="flex justify-between items-center text-sm">
                  <div className="flex items-center gap-2 overflow-hidden">
                    <span className="text-gray-400 w-4 font-mono">{i+1}</span>
                    <span className="truncate text-gray-800 font-medium">{el.element_name}</span>
                  </div>
                  <span className="font-bold bg-blue-50 text-blue-700 px-2 py-0.5 rounded ml-2">
                    {el.mean.toFixed(2)}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* 課題 TOP3 */}
          <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
            <h3 className="text-gray-500 font-medium mb-4 flex items-center gap-2">
              <span className="text-red-500">●</span> 組織の課題 (Bottom 3)
            </h3>
            <div className="space-y-3">
              {weaknesses.map((el, i) => (
                <div key={el.element_id} className="flex justify-between items-center text-sm">
                  <div className="flex items-center gap-2 overflow-hidden">
                     <span className="text-gray-400 w-4 font-mono">{i+1}</span>
                     <span className="truncate text-gray-800 font-medium">{el.element_name}</span>
                  </div>
                  <span className="font-bold bg-red-50 text-red-700 px-2 py-0.5 rounded ml-2">
                    {el.mean.toFixed(2)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ヒートマップ */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <div className="p-4 border-b border-gray-200 flex justify-between items-center bg-gray-50">
            <h3 className="font-bold text-gray-800 flex items-center gap-2">
              <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
              セグメント別スコア ヒートマップ
            </h3>
            <div className="flex gap-2 text-xs">
                {['store_code', 'role', 'age'].map(tab => (
                  <button 
                    key={tab}
                    className={`px-3 py-1.5 rounded border transition-colors ${
                      heatmapTab === tab 
                      ? 'bg-blue-600 text-white border-blue-600' 
                      : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
                    }`}
                    onClick={() => setHeatmapTab(tab as any)}
                  >
                    {tab === 'store_code' ? '事業所別' : tab === 'role' ? '役職別' : '年代別'}
                  </button>
                ))}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left border-collapse">
              <thead className="bg-gray-50 text-gray-700 font-medium">
                <tr>
                  <th className="px-4 py-3 sticky left-0 z-10 bg-gray-50 border-b border-r border-gray-200 min-w-[180px]">
                    セグメント
                  </th>
                  <th className="px-2 py-3 text-center border-b border-r border-gray-200 min-w-[60px] bg-gray-50">N</th>
                  {factors.map(f => (
                    <th key={f.id} className="px-2 py-3 text-center border-b border-gray-200 min-w-[90px] font-medium text-xs leading-tight">
                      {f.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {heatmapRows.map(row => {
                  if (row.n < minN) return null;
                  return (
                    <tr key={row.segmentKey} className="hover:bg-gray-50 group">
                       <td className="px-4 py-2.5 font-medium sticky left-0 bg-white group-hover:bg-gray-50 border-r border-gray-200 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)] text-gray-800 truncate max-w-[200px]" title={row.segmentName || row.segmentKey}>
                         {row.segmentName || row.segmentKey}
                       </td>
                       <td className="px-2 py-2.5 text-center text-gray-500 border-r border-gray-200 text-xs">{row.n}</td>
                       {factors.map(f => {
                         const fScore = row.factorScores[f.id];
                         // 信号判定
                         // fScoreがundefinedの場合もありうる（回答ゼロなど）
                         const result = fScore ? evaluateFactorSignal(fScore) : { color: 'red' as const, level: 0, label: '-' };
                         const mean = fScore?.mean ?? null;

                         // 背景色は信号判定に基づくが、セルの背景全体に使用
                         const bgColors = {
                           red: 'bg-red-50 text-red-900',
                           yellow: 'bg-yellow-50 text-yellow-900',
                           green: 'bg-blue-50 text-blue-900', // デザイン上はBlue系が見やすい
                         };
                         
                         // 色の濃さをスコアに応じて変えたい場合は別途ロジックが必要だが、
                         // ここではSafety判定結果で色分けする
                         const cellClass = bgColors[result.color];

                         return (
                           <td key={f.id} className={`px-2 py-2.5 text-center border-r border-gray-100 ${cellClass}`}>
                             <div className="flex flex-col items-center">
                               <span className="font-bold">{mean?.toFixed(2) ?? '-'}</span>
                             </div>
                           </td>
                         );
                       })}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div className="p-3 bg-gray-50 text-xs text-center text-gray-500 border-t border-gray-200">
             ※ 回答者数 {minN}名未満のセグメントは表示されません
          </div>
        </div>
      </main>
    </div>
  );
}
