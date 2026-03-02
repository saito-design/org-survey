'use client'

/**
 * ポータル認証プロバイダー
 *
 * このファイルを各アプリにコピーして使用します。
 * 各アプリの src/components/AuthProvider.tsx に配置してください。
 *
 * 使い方:
 * layout.tsx で children を AuthProvider で囲む
 *
 * export default function RootLayout({ children }) {
 *   return (
 *     <html lang="ja">
 *       <body>
 *         <AuthProvider>{children}</AuthProvider>
 *       </body>
 *     </html>
 *   )
 * }
 */

import { useEffect, useState, ReactNode } from 'react'
import { getPortalAuth, PortalSession } from '@/lib/portal-auth'

interface AuthProviderProps {
  children: ReactNode
  // ポータル認証が必須かどうか（false の場合は独自ログインも許可）
  requirePortalAuth?: boolean
}

export function AuthProvider({ children, requirePortalAuth = false }: AuthProviderProps) {
  const [isChecking, setIsChecking] = useState(true)
  const [session, setSession] = useState<PortalSession | null>(null)

  useEffect(() => {
    const auth = getPortalAuth()
    setSession(auth)
    setIsChecking(false)

    // 認証情報をwindowに保存（他のコンポーネントから参照可能に）
    if (auth) {
      (window as unknown as { __portalAuth: PortalSession }).__portalAuth = auth
    }
  }, [])

  // チェック中
  if (isChecking) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-gray-500 text-sm">認証確認中...</div>
      </div>
    )
  }

  // ポータル認証必須で未認証の場合
  if (requirePortalAuth && !session) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <p className="text-gray-600 mb-4">ポータルからログインしてください</p>
          <a
            href="http://localhost:3000"
            className="px-4 py-2 bg-teal-500 text-white rounded-lg hover:bg-teal-600 transition-colors"
          >
            ポータルへ
          </a>
        </div>
      </div>
    )
  }

  // 認証OK（または認証不要）
  return <>{children}</>
}

/**
 * ポータル認証情報を取得するフック
 */
export function usePortalAuth(): PortalSession | null {
  const [session, setSession] = useState<PortalSession | null>(null)

  useEffect(() => {
    setSession(getPortalAuth())
  }, [])

  return session
}
