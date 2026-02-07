'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

export default function SelectPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [userName, setUserName] = useState<string | null>(null);

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
          <button
            onClick={() => router.push('/survey')}
            className="w-full bg-blue-600 text-white py-4 rounded-lg font-medium hover:bg-blue-700 transition-colors flex items-center justify-center gap-3"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            アンケートに回答する
          </button>

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

        <button
          onClick={async () => {
            await fetch('/api/auth/logout', { method: 'POST' });
            router.push('/');
          }}
          className="w-full mt-8 text-gray-500 hover:text-gray-700 text-sm"
        >
          ログアウト
        </button>
      </div>
    </div>
  );
}
