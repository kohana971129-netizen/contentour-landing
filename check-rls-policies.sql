-- ════════════════════════════════════════════════════════════════
-- RLS 정책 검증 — 출시 전 필수 점검
-- 적용: Supabase Dashboard → SQL Editor → 전체 복사 후 Run
-- 결과를 모두 복사해서 보내주시면 분석합니다.
-- ════════════════════════════════════════════════════════════════

-- ════════════════════════════════════════════════════════════════
-- Query 1: 핵심 테이블의 RLS 활성화 여부
-- (FALSE면 정책이 있어도 무시되어 모든 데이터 노출됨)
-- ════════════════════════════════════════════════════════════════
SELECT
  schemaname,
  tablename,
  rowsecurity AS rls_enabled
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN (
    '01_회원',
    '42_통역계약',
    '44_상담일지',
    '30_적립금',
    '31_적립금이력',
    '46_ITQ견적문의',
    '48_통역사지원서',
    '49_통역사리뷰',
    '24_알림',
    '40_통역사프로필',
    '41_고객사프로필',
    '50_결제내역',
    '51_취소내역',
    '60_해외전시회'
  )
ORDER BY tablename;

-- ════════════════════════════════════════════════════════════════
-- Query 2: 핵심 테이블의 모든 RLS 정책 SQL
-- ════════════════════════════════════════════════════════════════
SELECT
  schemaname,
  tablename,
  policyname,
  cmd AS command,
  permissive,
  roles,
  qual AS using_clause,
  with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN (
    '01_회원',
    '42_통역계약',
    '44_상담일지',
    '30_적립금',
    '31_적립금이력',
    '46_ITQ견적문의',
    '48_통역사지원서',
    '49_통역사리뷰',
    '24_알림',
    '40_통역사프로필',
    '41_고객사프로필',
    '50_결제내역',
    '51_취소내역'
  )
ORDER BY tablename, cmd, policyname;

-- ════════════════════════════════════════════════════════════════
-- Query 3: ⚠️ 위험한 정책 자동 탐지
-- (qual='true' 또는 with_check='true' = 무조건 통과 = 위험)
-- ════════════════════════════════════════════════════════════════
SELECT
  tablename,
  policyname,
  cmd,
  roles,
  qual AS using_clause,
  with_check,
  CASE
    WHEN qual = 'true' AND cmd IN ('UPDATE', 'DELETE') THEN '🔴 위험: UPDATE/DELETE qual=true'
    WHEN with_check = 'true' AND cmd IN ('INSERT', 'UPDATE') THEN '🔴 위험: INSERT/UPDATE with_check=true'
    WHEN qual = 'true' AND cmd = 'SELECT' THEN '🟡 SELECT qual=true (의도적이라면 OK)'
    ELSE '정상'
  END AS risk_level
FROM pg_policies
WHERE schemaname = 'public'
  AND (qual = 'true' OR with_check = 'true')
ORDER BY
  CASE
    WHEN qual = 'true' AND cmd IN ('UPDATE','DELETE') THEN 1
    WHEN with_check = 'true' AND cmd IN ('INSERT','UPDATE') THEN 2
    ELSE 3
  END,
  tablename;

-- ════════════════════════════════════════════════════════════════
-- Query 4: RLS 없는(disabled) public 테이블 목록
-- (있으면 안 되는 테이블이 있는지 점검)
-- ════════════════════════════════════════════════════════════════
SELECT tablename, '🔴 RLS DISABLED' AS status
FROM pg_tables
WHERE schemaname = 'public'
  AND rowsecurity = FALSE
  AND tablename NOT LIKE 'pg_%'
ORDER BY tablename;
