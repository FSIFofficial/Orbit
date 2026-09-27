'use client'

import { useEffect, useState } from 'react'

// F14: 他サイトのiframe内に埋め込まれて開かれた場合(クリックジャッキング
// 対策)、画面を表示しないようにする。window.topとwindow.selfの比較による
// 簡易な対策のみ行い、CSP(frame-ancestors)の設定は今回は行わない。
export function FrameGuard({ children }: { children: React.ReactNode }) {
  const [blocked, setBlocked] = useState(false)

  useEffect(() => {
    try {
      if (window.top !== window.self) setBlocked(true)
    } catch {
      // クロスオリジンのiframeからはwindow.topへのアクセス自体が例外に
      // なることがある — その場合も埋め込まれているとみなす
      setBlocked(true)
    }
  }, [])

  if (blocked) return null
  return <>{children}</>
}
