-- ═══════════════════════════════════════════════════════════════
-- 적립금 시스템 Phase 1 — 저장소 DB 이전 (2026-04-29)
-- ═══════════════════════════════════════════════════════════════
-- 목적: customer-dashboard.html의 localStorage 기반 적립금 → DB 이전
-- 적용처: Supabase Dashboard → SQL Editor → Run
-- 프로젝트: jgeqbdrfpekzuumaklvx
-- ═══════════════════════════════════════════════════════════════


-- ─── 1. 적립금 잔액/등급 테이블 (사용자당 1행) ───────────────────
CREATE TABLE IF NOT EXISTS "30_적립금" (
    user_id UUID PRIMARY KEY REFERENCES "01_회원"(id) ON DELETE CASCADE,
    balance INTEGER NOT NULL DEFAULT 0 CHECK (balance >= 0),
    total_earned INTEGER NOT NULL DEFAULT 0,
    total_used INTEGER NOT NULL DEFAULT 0,
    completed_contracts INTEGER NOT NULL DEFAULT 0,
    total_spent BIGINT NOT NULL DEFAULT 0,
    current_tier TEXT NOT NULL DEFAULT 'normal'
        CHECK (current_tier IN ('normal','silver','gold','vip')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE "30_적립금" IS '고객사 적립금 잔액·등급 (사용자당 1행)';


-- ─── 2. 적립금 이력 테이블 (append-only, 감사용) ─────────────────
CREATE TABLE IF NOT EXISTS "31_적립금이력" (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES "01_회원"(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK (type IN ('earn','use','expire','admin_adjust','refund')),
    points INTEGER NOT NULL,
    source_type TEXT,
    source_id TEXT,
    reason TEXT,
    balance_after INTEGER NOT NULL,
    expires_at TIMESTAMPTZ,
    actor_id UUID REFERENCES "01_회원"(id) ON DELETE SET NULL,
    actor_role TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE "31_적립금이력" IS '적립/사용 이력 (append-only, 감사·복구용)';

CREATE INDEX IF NOT EXISTS idx_적립금이력_user_created
    ON "31_적립금이력"(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_적립금이력_expires
    ON "31_적립금이력"(expires_at) WHERE expires_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_적립금이력_type
    ON "31_적립금이력"(type);


-- ─── 3. updated_at 자동 갱신 트리거 ────────────────────────────
CREATE OR REPLACE FUNCTION update_loyalty_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_적립금_updated_at ON "30_적립금";
CREATE TRIGGER trg_적립금_updated_at
    BEFORE UPDATE ON "30_적립금"
    FOR EACH ROW
    EXECUTE FUNCTION update_loyalty_updated_at();


-- ─── 4. RLS (Row Level Security) ───────────────────────────────
ALTER TABLE "30_적립금" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "31_적립금이력" ENABLE ROW LEVEL SECURITY;

-- 기존 정책 제거 (재실행 안전성)
DROP POLICY IF EXISTS "본인 적립금 조회" ON "30_적립금";
DROP POLICY IF EXISTS "본인 적립금 수정" ON "30_적립금";
DROP POLICY IF EXISTS "관리자 적립금 전체" ON "30_적립금";
DROP POLICY IF EXISTS "본인 이력 조회" ON "31_적립금이력";
DROP POLICY IF EXISTS "본인 이력 추가" ON "31_적립금이력";
DROP POLICY IF EXISTS "관리자 이력 전체" ON "31_적립금이력";

-- 30_적립금
CREATE POLICY "본인 적립금 조회" ON "30_적립금"
    FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "본인 적립금 수정" ON "30_적립금"
    FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "관리자 적립금 전체" ON "30_적립금"
    FOR ALL USING (
        EXISTS (SELECT 1 FROM "01_회원" WHERE id = auth.uid() AND role = 'admin')
    );

-- 31_적립금이력
CREATE POLICY "본인 이력 조회" ON "31_적립금이력"
    FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "본인 이력 추가" ON "31_적립금이력"
    FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "관리자 이력 전체" ON "31_적립금이력"
    FOR ALL USING (
        EXISTS (SELECT 1 FROM "01_회원" WHERE id = auth.uid() AND role = 'admin')
    );


-- ─── 5. RPC: 적립 (atomic, 잔액·이력 한 번에 처리) ─────────────
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
BEGIN
    IF p_points <= 0 THEN
        RAISE EXCEPTION '적립 포인트는 양수여야 합니다';
    END IF;

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
         v_new_balance, p_expires_at);

    RETURN v_new_balance;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ─── 6. RPC: 사용 (atomic, 잔액 부족 시 실패) ──────────────────
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


-- ─── 7. RPC: 등급 재계산 (계약 완료 시 호출) ──────────────────
CREATE OR REPLACE FUNCTION update_loyalty_tier_on_contract(
    p_user_id UUID,
    p_contract_amount BIGINT
) RETURNS TEXT AS $$
DECLARE
    v_completed INTEGER;
    v_total_spent BIGINT;
    v_new_tier TEXT;
BEGIN
    INSERT INTO "30_적립금" (user_id, completed_contracts, total_spent)
    VALUES (p_user_id, 1, p_contract_amount)
    ON CONFLICT (user_id) DO UPDATE
        SET completed_contracts = "30_적립금".completed_contracts + 1,
            total_spent = "30_적립금".total_spent + p_contract_amount
    RETURNING completed_contracts, total_spent INTO v_completed, v_total_spent;

    -- 등급 결정 (project_loyalty_revision.md 기준)
    IF v_completed >= 10 AND v_total_spent >= 20000000 THEN
        v_new_tier := 'vip';
    ELSIF v_completed >= 5 AND v_total_spent >= 8000000 THEN
        v_new_tier := 'gold';
    ELSIF v_completed >= 2 AND v_total_spent >= 2000000 THEN
        v_new_tier := 'silver';
    ELSE
        v_new_tier := 'normal';
    END IF;

    UPDATE "30_적립금"
    SET current_tier = v_new_tier
    WHERE user_id = p_user_id;

    RETURN v_new_tier;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ─── 8. RPC: 관리자 수동 조정 (감사로그 자동 기록) ─────────────
CREATE OR REPLACE FUNCTION admin_adjust_loyalty(
    p_user_id UUID,
    p_delta INTEGER,
    p_reason TEXT
) RETURNS INTEGER AS $$
DECLARE
    v_actor_id UUID;
    v_new_balance INTEGER;
    v_is_admin BOOLEAN;
BEGIN
    v_actor_id := auth.uid();

    SELECT EXISTS (
        SELECT 1 FROM "01_회원" WHERE id = v_actor_id AND role = 'admin'
    ) INTO v_is_admin;

    IF NOT v_is_admin THEN
        RAISE EXCEPTION '관리자 권한이 필요합니다';
    END IF;

    INSERT INTO "30_적립금" (user_id, balance, total_earned, total_used)
    VALUES (p_user_id, GREATEST(p_delta, 0), GREATEST(p_delta, 0), GREATEST(-p_delta, 0))
    ON CONFLICT (user_id) DO UPDATE
        SET balance = GREATEST("30_적립금".balance + p_delta, 0),
            total_earned = "30_적립금".total_earned + GREATEST(p_delta, 0),
            total_used = "30_적립금".total_used + GREATEST(-p_delta, 0)
    RETURNING balance INTO v_new_balance;

    INSERT INTO "31_적립금이력"
        (user_id, type, points, source_type, reason, balance_after, actor_id, actor_role)
    VALUES
        (p_user_id, 'admin_adjust', p_delta, 'manual', p_reason,
         v_new_balance, v_actor_id, 'admin');

    RETURN v_new_balance;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ─── 9. 권한 부여 (anon + authenticated가 RPC 호출 가능) ───────
GRANT EXECUTE ON FUNCTION earn_loyalty_points(UUID, INTEGER, TEXT, TEXT, TEXT, TIMESTAMPTZ) TO authenticated;
GRANT EXECUTE ON FUNCTION use_loyalty_points(UUID, INTEGER, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION update_loyalty_tier_on_contract(UUID, BIGINT) TO authenticated;
GRANT EXECUTE ON FUNCTION admin_adjust_loyalty(UUID, INTEGER, TEXT) TO authenticated;


-- ═══════════════════════════════════════════════════════════════
-- 검증 쿼리 (실행 후 확인용)
-- ═══════════════════════════════════════════════════════════════
-- SELECT table_name FROM information_schema.tables
--   WHERE table_schema='public' AND table_name IN ('30_적립금','31_적립금이력');
-- SELECT routine_name FROM information_schema.routines
--   WHERE routine_schema='public' AND routine_name LIKE '%loyalty%';
-- ═══════════════════════════════════════════════════════════════
