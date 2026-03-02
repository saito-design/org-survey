import { getSession } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';

import ClientSummary from './client-summary';

export default async function AdminSummaryPage() {
  const session = await getSession();

  // 認証チェック
  if (!session.isLoggedIn) {
    redirect('/login');
  }

  // 管理者権限チェック
  if (!session.is_admin) {
    // 権限がない場合はトップページへ（あるいは専用のエラーページへ）
    redirect('/');
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Suspense fallback={<div className="p-4">Loading...</div>}>
        <ClientSummary />
      </Suspense>
    </div>
  );
}
