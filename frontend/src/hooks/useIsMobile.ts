import { useEffect, useState } from 'react'

const QUERY = '(max-width: 768px)'

// 좁은 화면(폰 가로폭 기준)인지 여부. 화면 회전/브라우저 창 크기 변경에도
// matchMedia의 change 이벤트로 실시간 반영됨
export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(() => window.matchMedia(QUERY).matches)

  useEffect(() => {
    const mql = window.matchMedia(QUERY)
    const handleChange = () => setIsMobile(mql.matches)

    mql.addEventListener('change', handleChange)
    return () => mql.removeEventListener('change', handleChange)
  }, [])

  return isMobile
}
