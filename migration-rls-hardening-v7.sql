-- ============================================================
-- RLS 정책 강화 v7 — 40_통역사프로필 민감 컬럼 노출 차단 (2026-05-18)
--
-- 이슈: authenticated_read USING (true)
--       → 모든 인증 사용자가 phone, verification_docs,
--          verification_note, penalty_count, is_suspended,
--          suspended_until, rate_rejected_reason 등 조회 가능
--       → 개인정보보호법상 전화번호 노출은 출시 후 사고 시 임팩트 큼
--
-- 해결: (1) VIEW interpreters_public — 공개 컬럼만, anon/authenticated GRANT
--       (2) RLS authenticated_read를 본인 + admin + 계약상대방으로 좁힘
--
-- 영향 분석:
-- - 클라이언트 직접 SELECT 위치 (10여 곳) 모두 OK:
--   · admin-dashboard.html, admin-data.js (admin) → is_admin() 통과
--   · interpreter-app.js, interpreter-data.js, interpreter-dashboard.html (본인) → user_id=auth.uid() 통과
--   · customer-dashboard.html:1371 (계약 통역사 이름) → 계약상대방 EXISTS 통과
--   · interpreters.html:1137 (공개 매칭 폴백) → view로 교체 (별도 commit)
-- - 서버 API (service_role) → RLS 우회, 영향 없음
--
-- 재실행 안전 (DROP IF EXISTS + CREATE OR REPLACE)
-- ============================================================

-- ────────────────────────────────────────────────
-- 1) 공개 검색용 VIEW — 민감 컬럼 제외
-- ────────────────────────────────────────────────
-- 노출 컬럼: 검색·매칭에 필요한 정보만
-- 제외 컬럼: phone, verification_docs, verification_note, verified_by,
--           penalty_count, is_suspended, suspended_until,
--           rate_status, rate_rejected_reason, rate_submitted_at,
--           pending_rate_by_type, pending_rate_by_language

CREATE OR REPLACE VIEW interpreters_public AS
SELECT
  id, user_id, display_name, intro, profile_image_url,
  languages, specialties, certifications,
  experience_years, base_rate, rate_by_type, rate_by_language,
  is_active, is_verified, verified_at,
  country_code, field_tag, cases_count, rating, satisfaction,
  created_at, updated_at
FROM "40_통역사프로필"
WHERE is_active = true;

-- security_invoker=false (default, PG 15+): view 작성자(postgres) 권한으로 실행
-- → underlying RLS 우회. 의도된 동작이므로 Supabase advisor 경고 무시 가능.
ALTER VIEW interpreters_public SET (security_invoker = false);

GRANT SELECT ON interpreters_public TO anon, authenticated;


-- ────────────────────────────────────────────────
-- 2) 40_통역사프로필 authenticated_read 정책 좁히기
-- ────────────────────────────────────────────────
DROP POLICY IF EXISTS authenticated_read ON "40_통역사프로필";

CREATE POLICY authenticated_read
ON "40_통역사프로필"
FOR SELECT
TO authenticated
USING (
  (user_id = auth.uid())
  OR is_admin()
  OR EXISTS (
    SELECT 1 FROM "42_통역계약" c
    WHERE c.interpreter_id = "40_통역사프로필".user_id
      AND (c.customer_id = auth.uid() OR c.interpreter_id = auth.uid())
  )
);

-- 참고:
-- - 본인 통역사: user_id = auth.uid() → 풀 SELECT
-- - admin: is_admin() → 풀 SELECT
-- - 고객사: 자기 계약의 통역사만 풀 SELECT (계약 없는 통역사의 민감 컬럼 차단)
-- - 통역사 A가 통역사 B를 조회: 차단됨 (경쟁자 정찰 방지)
-- - 공개 검색·매칭은 interpreters_public view로 (민감 컬럼 자동 제외)
