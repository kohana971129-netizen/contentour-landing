-- ═══════════════════════════════════════════════════════════════
-- 적립금 시스템 Phase 7 — 사용 시 만료일 자동 연장 제거 (2026-05-15)
-- ═══════════════════════════════════════════════════════════════
-- 전제: phase1 + phase4 + phase5 + cron 적용 완료
-- 적용처: Supabase Dashboard → SQL Editor → Run
-- 프로젝트: jgeqbdrfpekzuumaklvx
--
-- 변경 사항:
--   use_loyalty_points: 사용 시 잔여 earn 항목의 expires_at을
--                       NOW()+12개월로 갱신하던 로직 제거
--   결과: 각 적립 건은 자기 적립 시점 +12개월에 정확히 만료
--         (사용 여부와 무관 — 활발한 단골도 점진적 소멸)
--
-- 기존 데이터 영향:
--   이미 Phase 5 발동으로 expires_at이 연장돼 있는 적립금은 그대로 유지
--   (소급 적용 X — 본 함수 적용 시점부터 새로 사용되는 건만 비연장)
--
-- 다른 함수 영향:
--   earn_loyalty_points (적립 +12개월), expire_loyalty_points (만료 처리),
--   pg_cron job 'loyalty-daily-expire' 모두 그대로 작동
-- ═══════════════════════════════════════════════════════════════


CREATE OR REPLACE FUNCTION use_loyalty_points(
    p_user_id UUID,
    p_points INTEGER,
    p_source_type TEXT,
    p_source_id TEXT DEFAULT NULL,
    p_reason TEXT DEFAULT NULL
) RETURNS INTEGER AS $$
DECLARE
    v_current_balance INTEGER;
    v_new_balance INTEGER;
BEGIN
    IF p_points <= 0 THEN
        RAISE EXCEPTION '사용 포인트는 양수여야 합니다';
    END IF;

    SELECT balance INTO v_current_balance
    FROM "30_적립금"
    WHERE user_id = p_user_id
    FOR UPDATE;

    IF v_current_balance IS NULL OR v_current_balance < p_points THEN
        RAISE EXCEPTION '적립금 잔액 부족 (보유: %, 요청: %)',
            COALESCE(v_current_balance, 0), p_points;
    END IF;

    UPDATE "30_적립금"
    SET balance = balance - p_points,
        total_used = total_used + p_points
    WHERE user_id = p_user_id
    RETURNING balance INTO v_new_balance;

    INSERT INTO "31_적립금이력"
        (user_id, type, points, source_type, source_id, reason, balance_after)
    VALUES
        (p_user_id, 'use', -p_points, p_source_type, p_source_id, p_reason, v_new_balance);

    RETURN v_new_balance;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ═══════════════════════════════════════════════════════════════
-- 검증 쿼리 (실행 후 확인용)
-- ═══════════════════════════════════════════════════════════════
-- 1) 함수 정의에서 'renew' 또는 '연장' 키워드 사라졌는지 확인
--    SELECT prosrc FROM pg_proc WHERE proname = 'use_loyalty_points';
--    → 본문에 UPDATE "31_적립금이력" SET expires_at ... 가 없어야 함
--
-- 2) 향후 적립금 사용 시 type='renew' 이력이 더 이상 안 쌓이는지 확인
--    (기존 type='renew' row는 과거 이력이라 유지됨, 신규만 안 생김)
--    SELECT type, COUNT(*) FROM "31_적립금이력"
--      WHERE created_at >= CURRENT_DATE GROUP BY type;
-- ═══════════════════════════════════════════════════════════════
