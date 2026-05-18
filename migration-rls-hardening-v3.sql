-- ============================================================
-- RLS 정책 강화 v3 — 30_적립금 / 31_적립금이력 잠금 (2026-05-18)
-- 모든 적립금 RPC가 SECURITY DEFINER 확인됨 → 정책 좁혀도 동작 정상
-- 재실행 안전 (DROP IF EXISTS + CREATE)
-- ============================================================

-- ────────────────────────────────────────────────
-- 30_적립금 — 본인은 SELECT만, 변경은 관리자/RPC만
-- ────────────────────────────────────────────────
-- 이슈: "본인 적립금 수정" cmd=ALL → 본인이 balance/total_earned 등
--        직접 UPDATE/INSERT/DELETE 가능 → 적립금 잔액 조작 가능
-- 영향: 모든 잔액 변경은 SECURITY DEFINER RPC (earn/use/expire/
--        admin_adjust)를 경유하므로 정책 좁혀도 동작 정상
-- 부수: customer-dashboard.html의 loyMigrateFromLocalStorage()의
--        카운터 컬럼 .update()는 silent fail (이미 마이그레이션
--        완료된 사용자가 대부분이라 영향 최소)
DROP POLICY IF EXISTS "본인 적립금 수정" ON "30_적립금";

-- "본인 적립금 조회" + "관리자 적립금 전체" 정책은 유지
-- (조회는 본인 + admin만, 변경은 service_role + admin만)


-- ────────────────────────────────────────────────
-- 31_적립금이력 — 본인 INSERT 차단 (적립 위조 방지)
-- ────────────────────────────────────────────────
-- 이슈: "본인 이력 추가" cmd=INSERT, with_check=(auth.uid() = user_id)
--        → 본인 user_id로 임의 적립 이력 INSERT 가능 (사기 가능)
-- 영향: 모든 이력 추가는 earn_loyalty_points/use_loyalty_points 등
--        SECURITY DEFINER RPC 경유 → 정책 제거 안전
DROP POLICY IF EXISTS "본인 이력 추가" ON "31_적립금이력";

-- "본인 이력 조회" + "관리자 이력 전체" 유지
-- (조회는 본인 + admin, 추가는 service_role + admin만)


-- ============================================================
-- 검증 쿼리
-- ============================================================
-- SELECT tablename, policyname, cmd, qual, with_check
-- FROM pg_policies
-- WHERE schemaname = 'public'
--   AND tablename IN ('30_적립금', '31_적립금이력')
-- ORDER BY tablename, cmd;
--
-- 기대 결과:
-- 30_적립금: "본인 적립금 조회"(SELECT) + "관리자 적립금 전체"(ALL)
-- 31_적립금이력: "본인 이력 조회"(SELECT) + "관리자 이력 전체"(ALL)
-- (변경/추가 정책은 모두 사라짐)
