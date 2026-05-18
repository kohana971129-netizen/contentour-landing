-- ============================================================
-- RLS 정책 강화 v4 — 90_시스템설정 UPDATE 잠금 (2026-05-18)
-- 이슈: authenticated_update USING(true) WITH CHECK(true)
--       → 모든 인증 사용자(통역사/고객사)가 결제 모드·수수료율·
--          기본 단가·점검 모드 등 사업 정책 임의 변경 가능
-- 영향: read는 그대로 유지 (interpreter-dashboard.html 6468행이
--       rate_limits, recommended_rates 키를 단가 입력 가이드로 조회)
--       UPDATE만 is_admin()으로 막음. admin 설정 페이지는
--       admin 계정으로 접근하므로 정상 동작.
-- 재실행 안전 (DROP IF EXISTS + CREATE)
-- ============================================================

DROP POLICY IF EXISTS authenticated_update ON "90_시스템설정";

CREATE POLICY admin_update_settings
ON "90_시스템설정"
FOR UPDATE
TO authenticated
USING (is_admin())
WITH CHECK (is_admin());

-- 참고:
-- - authenticated_read (USING true) 정책은 유지 — 통역사 단가 가이드 조회용
-- - INSERT/DELETE 정책은 현재 부재 → service_role만 가능 (admin이
--   새 키 추가 시 admin-dashboard.html 7575행의 RPC fallback 경유) ✅
-- - service_all (service_role ALL) 정책은 유지 — 서버측 API 정상 동작
