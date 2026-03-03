'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams, useSearchParams } from 'next/navigation';

// 認証トークンをデコード
function decodeToken(token: string): { role: string; company: string; exp: number } | null {
  try {
    return JSON.parse(atob(token))
  } catch {
    return null
  }
}

export default function LoginPage() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const companyId = params.companyId as string;

  const [empNo, setEmpNo] = useState('');
  const [password, setPassword] = useState('');
  const [anonymous, setAnonymous] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // ポータルからのトークンをチェック
    const urlToken = searchParams.get('auth_token');
    if (urlToken) {
      const decoded = decodeToken(urlToken);
      if (decoded && decoded.exp > Date.now() && decoded.company === companyId) {
        sessionStorage.setItem('portal_auth', urlToken);
        window.history.replaceState({}, '', window.location.pathname);
        // ポータル認証OK - 管理画面へ
        router.replace(`/${companyId}/admin`);
        return;
      }
    }

    // 既存のポータル認証をチェック
    const sessionToken = sessionStorage.getItem('portal_auth');
    if (sessionToken) {
      const decoded = decodeToken(sessionToken);
      if (decoded && decoded.exp > Date.now() && decoded.company === companyId) {
        router.replace(`/${companyId}/admin`);
        return;
      } else {
        sessionStorage.removeItem('portal_auth');
      }
    }

    setLoading(false);
  }, [router, companyId, searchParams]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emp_no: empNo, password, anonymous }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'ログインに失敗しました');
        setLoading(false);
        return;
      }

      // ログイン成功 → 管理者は選択画面、それ以外は回答ページへ
      if (data.is_admin) {
        router.push(`/${companyId}/select`);
      } else {
        router.push(`/${companyId}/survey`);
      }
    } catch {
      setError('通信エラーが発生しました');
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
        <div className="text-gray-500">読み込み中...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="bg-white p-8 rounded-xl shadow-lg w-full max-w-md">
        <h1 className="text-2xl font-bold text-center text-gray-800 mb-6">
          組織診断アンケート
        </h1>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label htmlFor="empNo" className="block text-sm font-medium text-gray-700 mb-1">
              社員番号
            </label>
            <input
              id="empNo"
              type="text"
              value={empNo}
              onChange={(e) => setEmpNo(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="例: 12345"
              required
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
              パスワード
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              required
            />
          </div>

          <div className="flex items-center">
            <input
              id="anonymous"
              type="checkbox"
              checked={anonymous}
              onChange={(e) => setAnonymous(e.target.checked)}
              className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
            />
            <label htmlFor="anonymous" className="ml-2 text-sm text-gray-600">
              匿名で回答する（集計結果に名前を表示しない）
            </label>
          </div>

          {error && (
            <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 text-white py-3 rounded-lg font-medium hover:bg-blue-700 transition-colors disabled:bg-blue-300"
          >
            {loading ? 'ログイン中...' : 'ログイン'}
          </button>
        </form>

        <div className="mt-6 pt-4 border-t text-center">
          <a href={process.env.NEXT_PUBLIC_PORTAL_URL || 'http://localhost:3000'} className="text-sm text-teal-600 hover:text-teal-800">
            ポータルへ戻る
          </a>
        </div>

        <p className="mt-4 text-center text-xs text-gray-500">
          パスワードを忘れた場合は管理者にお問い合わせください
        </p>
      </div>
    </div>
  );
}
