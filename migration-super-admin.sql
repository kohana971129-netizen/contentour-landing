-- ══════════════════════════════════════════════════════════
-- 01_회원에 is_super_admin 플래그 추가 (Phase 1 권한 분리)
-- 작업일: 2026-05-22
-- 목적: admin 중 일부만 환불·취소승인 같은 되돌릴 수 없는 액션 수행 가능
-- 정책:
--   - role='admin' AND is_super_admin=true → super_admin
--   - role='admin' AND is_super_admin=false → 일반 admin (조회·게재 검토 등만)
--   - 기본값 false (안전한 방향)
-- ══════════════════════════════════════════════════════════

ALTER TABLE "01_회원"
    ADD COLUMN IF NOT EXISTS is_super_admin boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN "01_회원".is_super_admin IS
    'role=admin인 사용자 중 환불·취소승인 등 되돌릴 수 없는 액션 권한 보유 여부. 기본 false.';

-- 부분 인덱스: super_admin 조회를 빠르게
CREATE INDEX IF NOT EXISTS idx_01_회원_super_admin
    ON "01_회원"(id) WHERE is_super_admin = true;

-- 초기 super_admin 설정은 별도 SQL로 (예시):
-- UPDATE "01_회원" SET is_super_admin = true WHERE email = 'OWNER_EMAIL_HERE' AND role = 'admin';
