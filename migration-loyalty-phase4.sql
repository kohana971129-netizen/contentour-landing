-- ═══════════════════════════════════════════════════════════════
-- 적립금 시스템 Phase 4 — 만료 정책 + 결제 차감 흐름 강화 (2026-04-29)
-- ═══════════════════════════════════════════════════════════════
-- 전제: migration-loyalty-phase1.sql 적용 완료
-- 적용처: Supabase Dashboard → SQL Editor → Run
-- 프로젝트: jgeqbdrfpekzuumaklvx
-- ═══════════════════════════════════════════════════════════════


-- ─── 1. 31_적립금이력에 expired_at 컬럼 추가 ────────────────────
-- 만료 처리된 시점을 기록 (NULL = 아직 만료 안 됨, NOT NULL = 만료 처리됨)
ALTER TABLE "31_적립금이력"
    ADD COLUMN IF NOT EXISTS expired_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_적립금이력_pending_expire
    ON "31_적립금이력"(expires_at)
    WHERE type = 'earn' AND expired_at IS NULL AND expires_at IS NOT NULL;


-- ─── 2. earn_loyalty_points: expires_at 기본값을 NOW() + 24개월로 ──
-- 호출 시 p_expires_at을 명시 안 하면 자동으로 24개월 후 만료 설정
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

    -- expires_at 미지정 시 NOW() + 24개월
    v_effective_expires_at := COALESCE(p_expires_at, NOW() + INTERVAL '24 months');

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


-- ─── 3. expire_loyalty_points: 사용자별 만료 일괄 처리 ───────────
-- 호출 시 만료 대상 earn 항목들을 처리하고 잔액에서 차감.
-- 잔액이 만료금액보다 적으면 잔액만큼만 차감 (음수 잔액 방지).
-- 처리된 earn 행은 expired_at = NOW()로 마킹.
-- 차감 결과를 type='expire'로 31_적립금이력에 새 row 추가.
-- 반환: 만료 처리된 총 사용자 수, 총 만료 포인트 (배열 형태)
CREATE OR REPLACE FUNCTION expire_loyalty_points()
RETURNS TABLE(processed_users INTEGER, total_expired INTEGER) AS $$
DECLARE
    rec RECORD;
    v_actual_expire INTEGER;
    v_new_balance INTEGER;
    v_users INTEGER := 0;
    v_total INTEGER := 0;
BEGIN
    -- 사용자별로 만료 대상 earn 합산 (FIFO 의미는 약하지만 실용적 단순화)
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
        -- 잔액 확인 (잠금)
        SELECT balance INTO v_new_balance
        FROM "30_적립금"
        WHERE user_id = rec.user_id
        FOR UPDATE;

        IF v_new_balance IS NULL THEN
            v_new_balance := 0;
        END IF;

        -- 잔액 한도 내에서만 차감 (이미 사용한 부분은 만료 의미 없음)
        v_actual_expire := LEAST(rec.expire_amt, v_new_balance);

        IF v_actual_expire > 0 THEN
            UPDATE "30_적립금"
            SET balance = balance - v_actual_expire
            WHERE user_id = rec.user_id
            RETURNING balance INTO v_new_balance;

            -- 만료 이력 기록
            INSERT INTO "31_적립금이력"
                (user_id, type, points, source_type, reason, balance_after)
            VALUES
                (rec.user_id, 'expire', -v_actual_expire, 'auto_expire',
                 '24개월 만료 자동 처리 (' || rec.expire_amt || 'P 만료 대상 중 ' || v_actual_expire || 'P 차감)',
                 v_new_balance);

            v_total := v_total + v_actual_expire;
        END IF;

        -- 만료 대상 earn 행들 모두 expired_at 마킹 (실제 차감 여부 무관)
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


-- ─── 4. 권한 부여 ──────────────────────────────────────────────
GRANT EXECUTE ON FUNCTION expire_loyalty_points() TO authenticated;


-- ═══════════════════════════════════════════════════════════════
-- 검증 쿼리 (실행 후 확인)
-- ═══════════════════════════════════════════════════════════════
-- SELECT column_name, data_type FROM information_schema.columns
--   WHERE table_name='31_적립금이력' AND column_name='expired_at';
-- SELECT * FROM expire_loyalty_points(); -- dry run, 만료 대상 없으면 0건 반환
-- ═══════════════════════════════════════════════════════════════
