-- ═══════════════════════════════════════════════════════════════
-- 40_통역사프로필 · 43_정산내역 Realtime 발행 + REPLICA IDENTITY (2026-06-02)
-- ═══════════════════════════════════════════════════════════════
-- 목적:
--   통역사 대시보드가 (1) admin 검수(is_verified) 승인/반려, (2) 정산 승인/입금/반려를
--   로그인 중에도 실시간 반영하도록 두 테이블을 supabase_realtime publication에 추가.
--
-- REPLICA IDENTITY FULL 이유:
--   - 40_통역사프로필: UPDATE 시 payload.old에 is_verified/verification_note가 있어야
--     "검수 변경 vs 본인 프로필 수정"을 클라이언트가 구분 가능 (interpreter-app.js ch3).
--   - 43_정산내역: interpreter_id(비-PK) 필터를 UPDATE 이벤트에서 안정적으로 적용.
--
-- 멱등: IF NOT EXISTS 체크 + ALTER TABLE 재실행 안전.
-- ═══════════════════════════════════════════════════════════════

-- 1) publication 추가 (이미 있으면 스킵)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime'
          AND schemaname = 'public' AND tablename = '40_통역사프로필'
    ) THEN
        EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE "40_통역사프로필"';
        RAISE NOTICE '40_통역사프로필 publication 추가됨';
    ELSE
        RAISE NOTICE '40_통역사프로필 이미 publication에 있음';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime'
          AND schemaname = 'public' AND tablename = '43_정산내역'
    ) THEN
        EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE "43_정산내역"';
        RAISE NOTICE '43_정산내역 publication 추가됨';
    ELSE
        RAISE NOTICE '43_정산내역 이미 publication에 있음';
    END IF;
END $$;

-- 2) REPLICA IDENTITY FULL (payload.old 전체 컬럼 포함 — UPDATE 필터·변경 비교용)
ALTER TABLE "40_통역사프로필" REPLICA IDENTITY FULL;
ALTER TABLE "43_정산내역" REPLICA IDENTITY FULL;

-- 확인용:
-- SELECT tablename FROM pg_publication_tables
-- WHERE pubname = 'supabase_realtime' AND schemaname = 'public'
--   AND tablename IN ('40_통역사프로필','43_정산내역');
