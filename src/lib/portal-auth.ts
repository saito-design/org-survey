/**
 * ポータル認証ユーティリティ
 *
 * このファイルを各アプリにコピーして使用します。
 * 各アプリの src/lib/portal-auth.ts に配置してください。
 */

export interface PortalSession {
  role: 'owner' | 'manager' | 'staff'
  company: string
  exp: number
}

/**
 * URLパラメータから認証トークンを取得・検証
 */
export function getPortalAuth(): PortalSession | null {
  if (typeof window === 'undefined') return null

  // URLパラメータからトークン取得
  const params = new URLSearchParams(window.location.search)
  const token = params.get('auth_token')

  if (token) {
    try {
      const payload = JSON.parse(atob(token)) as PortalSession
      if (payload.exp > Date.now()) {
        // トークンが有効なら sessionStorage に保存
        sessionStorage.setItem('portal_auth', token)
        // URLからトークンを削除（履歴に残さない）
        const url = new URL(window.location.href)
        url.searchParams.delete('auth_token')
        window.history.replaceState({}, '', url.toString())
        return payload
      }
    } catch {
      // 無効なトークン
    }
  }

  // sessionStorage から取得
  const stored = sessionStorage.getItem('portal_auth')
  if (stored) {
    try {
      const payload = JSON.parse(atob(stored)) as PortalSession
      if (payload.exp > Date.now()) {
        return payload
      }
      sessionStorage.removeItem('portal_auth')
    } catch {
      sessionStorage.removeItem('portal_auth')
    }
  }

  return null
}

/**
 * ポータル認証済みかどうか
 */
export function isPortalAuthenticated(): boolean {
  return getPortalAuth() !== null
}

/**
 * ポータルセッションをクリア
 */
export function clearPortalAuth(): void {
  sessionStorage.removeItem('portal_auth')
}

/**
 * owner権限かどうか
 */
export function isOwner(): boolean {
  const auth = getPortalAuth()
  return auth?.role === 'owner'
}
