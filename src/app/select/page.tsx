'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

export default function SelectPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [userName, setUserName] = useState<string | null>(null);
  const [isOwner, setIsOwner] = useState(false);
  const [setupLoading, setSetupLoading] = useState(false);
  const [setupResult, setSetupResult] = useState<string | null>(null);

  useEffect(() => {
    // セッション確認
    async function checkSession() {
      try {
        const res = await fetch('/api/auth/me');
        if (!res.ok) {
          router.push('/');
          return;
        }
        const data = await res.json();
        if (!data.isLoggedIn) {
          router.push('/');
          return;
        }
        if (!data.is_admin) {
          // 管理者でなければ回答ページへ
          router.push('/survey');
          return;
        }
        setUserName(data.name || data.emp_no);
        setIsOwner(data.is_owner ?? false);
        setLoading(false);
      } catch {
        router.push('/');
      }
    }
    checkSession();
  }, [router]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
        <div className="text-gray-600">読み込み中...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="bg-white p-8 rounded-xl shadow-lg w-full max-w-md">
        <h1 className="text-2xl font-bold text-center text-gray-800 mb-2">
          組織診断
        </h1>
        <p className="text-center text-gray-500 mb-8">
          {userName}さん、ようこそ
        </p>

        <div className="space-y-4">
          {/* オーナーはアンケート回答不要 */}
          {!isOwner && (
            <button
              onClick={() => router.push('/survey')}
              className="w-full bg-blue-600 text-white py-4 rounded-lg font-medium hover:bg-blue-700 transition-colors flex items-center justify-center gap-3"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              アンケートに回答する
            </button>
          )}

          <button
            onClick={() => router.push('/admin/summary')}
            className="w-full bg-purple-600 text-white py-4 rounded-lg font-medium hover:bg-purple-700 transition-colors flex items-center justify-center gap-3"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            集計サマリーを見る
          </button>
        </div>

        {/* デモデータセットアップ */}
        <div className="mt-8 pt-6 border-t border-gray-200">
          <p className="text-xs text-gray-400 mb-3 text-center">管理者メニュー</p>
          <button
            onClick={async () => {
              if (!confirm('デモデータをセットアップしますか？\n既存データは上書きされます。')) return;
              setSetupLoading(true);
              setSetupResult(null);
              try {
                const res = await fetch('/api/admin/setup-demo', { method: 'POST' });
                const data = await res.json();
                if (data.success) {
                  setSetupResult(`セットアップ完了: ${data.uploaded.respondents}名, ${data.uploaded.orgUnits}店舗, ${data.uploaded.responses}件の回答`);
                } else {
                  setSetupResult(`エラー: ${data.error || data.details}`);
                }
              } catch (e) {
                setSetupResult('エラー: 通信に失敗しました');
              } finally {
                setSetupLoading(false);
              }
            }}
            disabled={setupLoading}
            className="w-full bg-gray-100 text-gray-600 py-2 rounded-lg text-sm hover:bg-gray-200 transition-colors disabled:opacity-50"
          >
            {setupLoading ? 'セットアップ中...' : 'デモデータをセットアップ'}
          </button>
          {setupResult && (
            <p className={`mt-2 text-xs text-center ${setupResult.startsWith('エラー') ? 'text-red-500' : 'text-green-600'}`}>
              {setupResult}
            </p>
          )}
        </div>

        <button
          onClick={async () => {
            await fetch('/api/auth/logout', { method: 'POST' });
            router.push('/');
          }}
          className="w-full mt-4 text-gray-500 hover:text-gray-700 text-sm"
        >
          ログアウト
        </button>
      </div>
    </div>
  );
}
