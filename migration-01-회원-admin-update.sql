-- ════════════════════════════════════════════════════════════════
-- 01_회원 admin UPDATE 정책 복구
-- 작성: 2026-05-20
-- 적용: Supabase Dashboard → SQL Editor → 전체 복사 후 Run
-- ════════════════════════════════════════════════════════════════
-- 배경:
--   현재 "authenticated_update" 정책이 USING (id = auth.uid()) 만 허용해서
--   admin이 다른 회원 row를 UPDATE 못함 (format_permissions, business_registration 등).
--   pg_policies 조회 결과:
--     authenticated_update | UPDATE | (id = auth.uid()) | (id = auth.uid())
--
-- 변경:
--   USING / WITH CHECK 양쪽에 OR is_admin() 추가.
--   admin은 모든 회원 row UPDATE 가능 + 본인은 본인 row UPDATE 가능.
--
-- 영향 범위 (admin UPDATE가 막혀있던 기능들):
--   - 상담일지 양식 권한 (format_permissions) ← 이번 직접 원인
--   - 사업자등록증 검수 (business_registration_status / reject_reason)
--   - 기타 admin 측 01_회원 직접 UPDATE 흐름
-- ════════════════════════════════════════════════════════════════

BEGIN;

DROP POLICY IF EXISTS "authenticated_update" ON "01_회원";

CREATE POLICY "authenticated_update" ON "01_회원"
  FOR UPDATE TO authenticated
  USING ((id = auth.uid()) OR is_admin())
  WITH CHECK ((id = auth.uid()) OR is_admin());

COMMIT;

-- ════════════════════════════════════════════════════════════════
-- 검증 (적용 후 실행)
-- ════════════════════════════════════════════════════════════════
-- SELECT policyname, cmd, qual::text, with_check::text
-- FROM pg_policies
-- WHERE tablename = '01_회원' AND policyname = 'authenticated_update';
--
-- 기대 결과:
--   using_clause: ((id = auth.uid()) OR is_admin())
--   check_clause: ((id = auth.uid()) OR is_admin())
