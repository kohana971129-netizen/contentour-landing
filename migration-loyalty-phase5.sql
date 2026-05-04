-- ═══════════════════════════════════════════════════════════════
-- 적립금 시스템 Phase 5 — 만료 정책 변경 (24개월 → 12개월) + 사용 시 자동 연장 (2026-05-04)
-- ═══════════════════════════════════════════════════════════════
-- 전제: migration-loyalty-phase1.sql + migration-loyalty-phase4.sql 적용 완료
-- 적용처: Supabase Dashboard → SQL Editor → Run
-- 프로젝트: jgeqbdrfpekzuumaklvx
--
-- 변경 사항:
--   1. earn_loyalty_points: 기본 만료를 24개월 → 12개월로 단축
--   2. use_loyalty_points: 적립금 사용 시 남은 미만료 earn 항목들의 expires_at을
--      NOW() + 12개월로 자동 연장 (활발한 단골 보호)
--   3. expire_loyalty_points: 만료 사유 텍스트 갱신
--
-- 기존 데이터 영향:
--   이미 24개월 만료일이 박혀 있는 적립금은 그대로 유지 (소급 적용 X)
--   본 함수 적용 후 새로 적립되는 건만 12개월
-- ═══════════════════════════════════════════════════════════════


-- ─── 1. earn_loyalty_points: 기본 만료를 12개월로 ──────────────
CREATE OR REPLACE FUNCTION earn_loyalty_points(
    p_user_id UUID,
    p_points INTEGER,
    p_source_type TEXT,
    p_source_id TEXT DEFAULT NULL,
    p_reason TEXT DEFAULT NULL,
    p_expires_at TIMESTAMPTZ DEFAULT NULL
) RETURNS INTEGER AS $$
DECLARE
    v_new_balance INTEGER;
    v_effective_expires_at TIMESTAMPTZ;
BEGIN
    IF p_points <= 0 THEN
        RAISE EXCEPTION '적립 포인트는 양수여야 합니다';
    END IF;

    -- expires_at 미지정 시 NOW() + 12개월 (Phase 5)
    v_effective_expires_at := COALESCE(p_expires_at, NOW() + INTERVAL '12 months');

    INSERT INTO "30_적립금" (user_id, balance, total_earned)
    VALUES (p_user_id, p_points, p_points)
    ON CONFLICT (user_id) DO UPDATE
        SET balance = "30_적립금".balance + p_points,
            total_earned = "30_적립금".total_earned + p_points
    RETURNING balance INTO v_new_balance;

    INSERT INTO "31_적립금이력"
        (user_id, type, points, source_type, source_id, reason, balance_after, expires_at)
    VALUES
        (p_user_id, 'earn', p_points, p_source_type, p_source_id, p_reason,
         v_new_balance, v_effective_expires_at);

    RETURN v_new_balance;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ─── 2. use_loyalty_points: 사용 시 남은 적립금 만료일 자동 연장 ──
-- 활발히 거래하는 단골은 적립금이 사실상 만료되지 않음 (만료일 12개월씩 갱신)
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
    v_renewed_count INTEGER;
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

    -- ── Phase 5 신규: 사용 시 남은 미만료 earn 항목들의 만료일을 NOW() + 12개월로 갱신 ──
    -- 단골 보호: 한 번이라도 쓰면 잔여 적립금 만료일 모두 연장
    UPDATE "31_적립금이력"
    SET expires_at = NOW() + INTERVAL '12 months'
    WHERE user_id = p_user_id
      AND type = 'earn'
      AND expired_at IS NULL
      AND expires_at IS NOT NULL
      AND expires_at > NOW();

    GET DIAGNOSTICS v_renewed_count = ROW_COUNT;

    -- 갱신 이력 기록 (감사용 — 별도 type='renew')
    IF v_renewed_count > 0 THEN
        INSERT INTO "31_적립금이력"
            (user_id, type, points, source_type, reason, balance_after)
        VALUES
            (p_user_id, 'renew', 0, 'auto_renew',
             '적립금 사용으로 잔여 ' || v_renewed_count || '건 만료일 12개월 연장',
             v_new_balance);
    END IF;

    RETURN v_new_balance;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ─── 3. expire_loyalty_points: 사유 텍스트 갱신 ─────────────────
CREATE OR REPLACE FUNCTION expire_loyalty_points()
RETURNS TABLE(processed_users INTEGER, total_expired INTEGER) AS $$
DECLARE
    rec RECORD;
    v_actual_expire INTEGER;
    v_new_balance INTEGER;
    v_users INTEGER := 0;
    v_total INTEGER := 0;
BEGIN
    FOR rec IN
        SELECT user_id, SUM(points)::INTEGER AS expire_amt
        FROM "31_적립금이력"
        WHERE type = 'earn'
          AND expired_at IS NULL
          AND expires_at IS NOT NULL
          AND expires_at < NOW()
        GROUP BY user_id
        HAVING SUM(points) > 0
    LOOP
        SELECT balance INTO v_new_balance
        FROM "30_적립금"
        WHERE user_id = rec.user_id
        FOR UPDATE;

        IF v_new_balance IS NULL THEN
            v_new_balance := 0;
        END IF;

        v_actual_expire := LEAST(rec.expire_amt, v_new_balance);

        IF v_actual_expire > 0 THEN
            UPDATE "30_적립금"
            SET balance = balance - v_actual_expire
            WHERE user_id = rec.user_id
            RETURNING balance INTO v_new_balance;

            INSERT INTO "31_적립금이력"
                (user_id, type, points, source_type, reason, balance_after)
            VALUES
                (rec.user_id, 'expire', -v_actual_expire, 'auto_expire',
                 '12개월 만료 자동 처리 (' || rec.expire_amt || 'P 만료 대상 중 ' || v_actual_expire || 'P 차감)',
                 v_new_balance);

            v_total := v_total + v_actual_expire;
        END IF;

        UPDATE "31_적립금이력"
        SET expired_at = NOW()
        WHERE user_id = rec.user_id
          AND type = 'earn'
          AND expired_at IS NULL
          AND expires_at IS NOT NULL
          AND expires_at < NOW();

        v_users := v_users + 1;
    END LOOP;

    processed_users := v_users;
    total_expired := v_total;
    RETURN NEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ═══════════════════════════════════════════════════════════════
-- 검증 쿼리 (실행 후 확인)
-- ═══════════════════════════════════════════════════════════════
-- 1) 새로 적립 → 만료일 12개월 후로 박히는지
--    SELECT earn_loyalty_points('test-user-uuid', 1000, 'test', NULL, '검증');
--    SELECT expires_at FROM "31_적립금이력" WHERE user_id = 'test-user-uuid' ORDER BY created_at DESC LIMIT 1;
--
-- 2) 사용 → 잔여 earn 만료일이 갱신되는지
--    SELECT use_loyalty_points('test-user-uuid', 100, 'test', NULL, '검증 사용');
--    SELECT expires_at FROM "31_적립금이력"
--      WHERE user_id = 'test-user-uuid' AND type = 'earn' AND expired_at IS NULL;
-- ═══════════════════════════════════════════════════════════════
