-- ══════════════════════════════════════════════════════════
-- 99_감사로그 — 관리자 중요 액션 추적용 audit log
-- 작업일: 2026-05-22
-- 목적: 환불·취소 승인·계약 생성·견적 발송·통역사 승인 등 되돌릴 수 없는
--       관리자 액션을 시간순으로 기록 (사고·분쟁 시 추적·롤백 근거)
-- 적용 범위(최소한): 5~6개 핵심 액션만 (admin-app.js에서 명시적 호출)
-- ══════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS "99_감사로그" (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_user_id uuid REFERENCES "01_회원"(id) ON DELETE SET NULL,
    actor_role text,
    actor_email text,
    action text NOT NULL,
    target_table text,
    target_id text,
    before_data jsonb,
    after_data jsonb,
    note text,
    ip_address text,
    user_agent text,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_99_감사로그_created_at ON "99_감사로그"(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_99_감사로그_actor ON "99_감사로그"(actor_user_id);
CREATE INDEX IF NOT EXISTS idx_99_감사로그_action ON "99_감사로그"(action);
CREATE INDEX IF NOT EXISTS idx_99_감사로그_target ON "99_감사로그"(target_table, target_id);

-- RLS: admin만 읽기, 쓰기는 service_role 전용 (api/admin-app.js 통과)
ALTER TABLE "99_감사로그" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "audit_admin_read" ON "99_감사로그";
CREATE POLICY "audit_admin_read" ON "99_감사로그"
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM "01_회원"
            WHERE id = auth.uid() AND role = 'admin'
        )
    );

-- 기본: anon/authenticated는 UPDATE/DELETE 금지 (service_role만 가능)
REVOKE UPDATE, DELETE ON "99_감사로그" FROM anon, authenticated;
REVOKE INSERT ON "99_감사로그" FROM anon;

-- admin authenticated는 본인을 actor로 한 row만 INSERT 가능 (client-side 로깅 대응)
GRANT INSERT ON "99_감사로그" TO authenticated;
DROP POLICY IF EXISTS "audit_admin_insert" ON "99_감사로그";
CREATE POLICY "audit_admin_insert" ON "99_감사로그"
    FOR INSERT
    TO authenticated
    WITH CHECK (
        actor_user_id = auth.uid()
        AND EXISTS (
            SELECT 1 FROM "01_회원"
            WHERE id = auth.uid() AND role = 'admin'
        )
    );

COMMENT ON TABLE "99_감사로그" IS '관리자 중요 액션 audit trail. service_role API에서만 INSERT, admin만 SELECT.';
COMMENT ON COLUMN "99_감사로그".action IS '예: refund_complete, cancel_approve, cancel_reject, contract_create, quote_send, interpreter_approve, showcase_approve, showcase_assign';
