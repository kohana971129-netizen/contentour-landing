-- ════════════════════════════════════════════════════════════════
-- Supabase Security Advisor 2차 보정 — PUBLIC role 권한 회수
-- 작성: 2026-05-19 (v1 적용 후 anon/authenticated 경고 40건 잔존)
-- 원인: PostgreSQL 함수는 기본적으로 PUBLIC role에 EXECUTE 부여됨
--       anon·authenticated는 PUBLIC을 상속받으므로 직접 REVOKE는 효과 없음
-- 해결: PUBLIC에서 REVOKE 후, 필요한 role에 명시적 GRANT
-- 적용: Supabase Dashboard → SQL Editor → 전체 복사 후 Run
-- ════════════════════════════════════════════════════════════════

BEGIN;

-- ════════════════════════════════════════════════════════════════
-- Phase 1: 모든 SECURITY DEFINER 함수의 PUBLIC EXECUTE 권한 회수
-- ════════════════════════════════════════════════════════════════

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.auto_create_settlement_on_journal() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.auto_link_member_on_insert() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.link_member_to_orphan_data(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.create_settlement(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.process_payment(uuid, text, integer, text, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.process_refund(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_admin() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.earn_loyalty_points(uuid, integer, text, text, text, timestamp with time zone) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.use_loyalty_points(uuid, integer, text, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.update_loyalty_tier_on_contract(uuid, bigint) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_adjust_loyalty(uuid, integer, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.expire_loyalty_points() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_approve_business_registration(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_reject_business_registration(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.approve_settlement(uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.reject_settlement(uuid, uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.complete_settlement_payment(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.cancel_contract(uuid, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.calculate_penalty(uuid, text) FROM PUBLIC;

-- ════════════════════════════════════════════════════════════════
-- Phase 2: 클라이언트에서 호출해야 하는 함수에만 authenticated 권한 부여
-- (트리거·서버 전용·비활성 적립금 함수는 GRANT 없이 유지 → 완전 차단)
-- ════════════════════════════════════════════════════════════════

-- Admin 함수 (admin-dashboard.html에서 authenticated 토큰 + admin role로 호출)
GRANT EXECUTE ON FUNCTION public.admin_adjust_loyalty(uuid, integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_approve_business_registration(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_reject_business_registration(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.approve_settlement(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reject_settlement(uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.complete_settlement_payment(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.process_refund(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.expire_loyalty_points() TO authenticated;

-- User 함수 (customer/interpreter 대시보드에서 호출)
GRANT EXECUTE ON FUNCTION public.cancel_contract(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.calculate_penalty(uuid, text) TO authenticated;

-- RLS 헬퍼 (RLS 정책 안에서 is_admin() 사용)
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;

-- 주의: 아래 함수들은 GRANT 없음 = 완전 차단
--   handle_new_user, auto_create_settlement_on_journal, auto_link_member_on_insert
--     → 트리거가 SECURITY DEFINER로 실행되므로 권한 불필요
--   link_member_to_orphan_data, create_settlement, process_payment
--     → service_role(api/*)만 호출, authenticated 회수 안전
--   earn_loyalty_points, use_loyalty_points, update_loyalty_tier_on_contract
--     → 적립금 UI OFF + cron OFF 상태라 호출 안 됨

-- service_role은 슈퍼유저라 REVOKE 영향 없음 (별도 GRANT 불필요)

COMMIT;

-- ════════════════════════════════════════════════════════════════
-- 적용 후 예상 결과
--   42 → 12 건
--   anon_security_definer 20 → 0 ✅
--   authenticated_security_definer 20 → 11 (의도적 유지)
--   pg_trgm 1 (보류)
--   leaked_password 1 (캐시·확인 필요)
-- ════════════════════════════════════════════════════════════════
