-- ═══════════════════════════════════════════════════════════════
-- 적립금 시스템 Phase 6 — pg_cron 자동 만료 처리 (2026-05-15)
-- ═══════════════════════════════════════════════════════════════
-- 전제: migration-loyalty-phase1.sql + phase4.sql + phase5.sql 적용 완료
-- 적용처: Supabase Dashboard → SQL Editor → Run
-- 프로젝트: jgeqbdrfpekzuumaklvx
--
-- 목적:
--   관리자 페이지의 ⏰ 수동 만료 버튼을 매일 자동 호출하도록 pg_cron 등록.
--   고객사가 늘어나면 매일 수동 클릭은 누락 위험 → 12개월 만료된 적립금이
--   잔액에 그대로 남아 재무 부채로 누적되는 것을 방지.
--
-- 스케줄: 매일 KST 04:00 (= UTC 19:00 전날) 실행. 트래픽 가장 적은 시간대.
-- 멱등성: 같은 job 이름으로 cron.schedule을 재실행하면 기존 job이 덮어쓰기됨.
--
-- 실행 후 확인:
--   1) cron.job 테이블에서 등록 확인
--   2) 다음 04:00 KST 이후 cron.job_run_details에서 success 여부 확인
--   3) 31_적립금이력 테이블에 type='expire' 신규 row 확인
-- ═══════════════════════════════════════════════════════════════


-- ─── 1. pg_cron 확장 활성화 ─────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS pg_cron;


-- ─── 2. 매일 KST 04:00 만료 처리 Job 등록 ──────────────────────
-- 같은 이름으로 재실행하면 upsert (기존 스케줄 안전하게 덮어쓰기)
SELECT cron.schedule(
    'loyalty-daily-expire',
    '0 19 * * *',                          -- UTC 19:00 = KST 04:00
    $$ SELECT expire_loyalty_points(); $$
);


-- ═══════════════════════════════════════════════════════════════
-- 검증 쿼리 (실행 후 확인용 — 주석 풀어서 개별 실행)
-- ═══════════════════════════════════════════════════════════════
-- 1) Job 등록 상태 확인
--    SELECT jobid, jobname, schedule, command, active
--    FROM cron.job
--    WHERE jobname = 'loyalty-daily-expire';
--
-- 2) 최근 실행 이력 (최초 04:00 KST 경과 후 row 생김)
--    SELECT jobid, runid, status, return_message, start_time, end_time
--    FROM cron.job_run_details
--    WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'loyalty-daily-expire')
--    ORDER BY start_time DESC
--    LIMIT 10;
--
-- 3) 자동 만료된 적립금 이력 (오늘 발생분)
--    SELECT user_id, points, reason, balance_after, created_at
--    FROM "31_적립금이력"
--    WHERE type = 'expire' AND source_type = 'auto_expire'
--      AND created_at >= CURRENT_DATE
--    ORDER BY created_at DESC;
--
-- 4) 수동 즉시 1회 실행 (스케줄 기다리지 않고 동작 검증하고 싶을 때)
--    SELECT * FROM expire_loyalty_points();
--
-- 5) Job 비활성화 (필요 시)
--    SELECT cron.alter_job(
--        job_id := (SELECT jobid FROM cron.job WHERE jobname = 'loyalty-daily-expire'),
--        active := false
--    );
--
-- 6) Job 완전 삭제 (필요 시 — 이력은 cron.job_run_details에 남음)
--    SELECT cron.unschedule('loyalty-daily-expire');
-- ═══════════════════════════════════════════════════════════════
