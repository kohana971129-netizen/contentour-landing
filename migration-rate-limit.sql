-- ════════════════════════════════════════════════════════════════
-- migration: rate limit (Postgres 기반)
-- 목적: 공개 엔드포인트(견적/지원/업로드/PW게이트) 스팸·무차별 대입 완화.
--       서버리스(Vercel)는 인메모리 카운터 공유가 안 되므로 DB 카운터 사용.
-- 고정 윈도우(fixed-window) 방식. lib/rate-limit.js 의 checkRateLimit()가 호출.
-- ════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS "98_rate_limit" (
    key          text PRIMARY KEY,
    count        int  NOT NULL DEFAULT 0,
    window_start timestamptz NOT NULL DEFAULT now()
);

-- service_role(API 서버)만 접근. RLS 켜고 정책을 두지 않아 anon/authenticated 차단.
ALTER TABLE "98_rate_limit" ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.check_rate_limit(
    p_key text, p_max int, p_window_seconds int
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_count int;
    v_start timestamptz;
    v_now   timestamptz := now();
BEGIN
    SELECT count, window_start INTO v_count, v_start
      FROM "98_rate_limit" WHERE key = p_key FOR UPDATE;

    -- 최초 요청
    IF NOT FOUND THEN
        INSERT INTO "98_rate_limit"(key, count, window_start) VALUES (p_key, 1, v_now)
        ON CONFLICT (key) DO UPDATE SET count = "98_rate_limit".count + 1;
        RETURN true;
    END IF;

    -- 윈도우 만료 → 리셋
    IF v_start < v_now - (p_window_seconds * interval '1 second') THEN
        UPDATE "98_rate_limit" SET count = 1, window_start = v_now WHERE key = p_key;
        RETURN true;
    END IF;

    -- 윈도우 내 한도 초과 → 차단
    IF v_count >= p_max THEN
        RETURN false;
    END IF;

    UPDATE "98_rate_limit" SET count = count + 1 WHERE key = p_key;
    RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.check_rate_limit(text, int, int) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.check_rate_limit(text, int, int) FROM anon;
REVOKE ALL ON FUNCTION public.check_rate_limit(text, int, int) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.check_rate_limit(text, int, int) TO service_role;

COMMENT ON FUNCTION public.check_rate_limit IS
'고정 윈도우 rate limit. p_key별 p_window_seconds 동안 p_max 초과 시 false 반환. (lib/rate-limit.js)';

-- (선택) 오래된 카운터 정리 — 누적 방지. 주기적 cron으로 실행 권장.
-- DELETE FROM "98_rate_limit" WHERE window_start < now() - interval '1 day';
