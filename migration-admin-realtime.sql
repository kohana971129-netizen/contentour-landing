-- ═══════════════════════════════════════════════════════════════
-- admin 글로벌 realtime 활성화 (2026-05-18)
-- ═══════════════════════════════════════════════════════════════
-- 목적:
--   admin-dashboard.html의 subscribeAdminGlobalRealtime()이
--   42_통역계약 INSERT/UPDATE, 46_ITQ견적문의 INSERT, 24_알림 INSERT를
--   감지하려면 해당 테이블이 supabase_realtime publication에 포함돼야 함.
--
--   24_알림은 이미 다른 곳(chat-data.js, interpreter-app.js)에서 구독 중이라
--   publication 등록되어 있을 가능성 큼 → 멱등 IF NOT EXISTS로 안전.
--
-- 적용처: Supabase Dashboard → SQL Editor → Run
-- 프로젝트: jgeqbdrfpekzuumaklvx
-- 멱등: NOT EXISTS 체크로 재실행 안전
-- ═══════════════════════════════════════════════════════════════


DO $$
BEGIN
    -- 42_통역계약 (INSERT/UPDATE 감지)
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime'
          AND schemaname = 'public'
          AND tablename = '42_통역계약'
    ) THEN
        EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE "42_통역계약"';
        RAISE NOTICE '42_통역계약 추가됨';
    ELSE
        RAISE NOTICE '42_통역계약 이미 publication에 있음';
    END IF;

    -- 46_ITQ견적문의 (INSERT 감지)
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime'
          AND schemaname = 'public'
          AND tablename = '46_ITQ견적문의'
    ) THEN
        EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE "46_ITQ견적문의"';
        RAISE NOTICE '46_ITQ견적문의 추가됨';
    ELSE
        RAISE NOTICE '46_ITQ견적문의 이미 publication에 있음';
    END IF;

    -- 24_알림 (INSERT 감지) — 이미 등록되어 있을 가능성
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime'
          AND schemaname = 'public'
          AND tablename = '24_알림'
    ) THEN
        EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE "24_알림"';
        RAISE NOTICE '24_알림 추가됨';
    ELSE
        RAISE NOTICE '24_알림 이미 publication에 있음';
    END IF;
END$$;


-- 검증:
-- SELECT tablename FROM pg_publication_tables
-- WHERE pubname = 'supabase_realtime' AND schemaname = 'public'
-- ORDER BY tablename;
