-- ═══════════════════════════════════════════════════════════════
-- 사업자등록증 파일 업로드 검증 시스템 (2026-05-04)
-- ═══════════════════════════════════════════════════════════════
-- 적용처: Supabase Dashboard → SQL Editor → Run
-- 프로젝트: jgeqbdrfpekzuumaklvx
--
-- 변경 내용:
--   1. 01_회원에 사업자등록증 검증 관련 컬럼 추가
--   2. business-registrations Storage 버킷 RLS 정책
--   3. 어드민용 검수 RPC 2종 (승인/반려)
--
-- 필수 사전 작업 (UI에서):
--   Storage → New bucket → 이름: business-registrations, Public: OFF
-- ═══════════════════════════════════════════════════════════════


-- ─── 1. 01_회원 컬럼 추가 ──────────────────────────────────────
ALTER TABLE "01_회원"
    ADD COLUMN IF NOT EXISTS business_number TEXT,
    ADD COLUMN IF NOT EXISTS business_registration_url TEXT,
    ADD COLUMN IF NOT EXISTS business_registration_status TEXT NOT NULL DEFAULT 'pending',
    ADD COLUMN IF NOT EXISTS business_registration_uploaded_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS business_registration_reviewed_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS business_registration_reviewed_by UUID REFERENCES "01_회원"(id),
    ADD COLUMN IF NOT EXISTS business_registration_reject_reason TEXT;

COMMENT ON COLUMN "01_회원".business_registration_status IS 'pending: 검수 대기, approved: 승인 완료, rejected: 반려, none: 미제출';

-- 기존 고객사 데이터: 파일 미제출이면 'none'으로 표시 (검수 대상 아님)
UPDATE "01_회원"
SET business_registration_status = 'none'
WHERE role = 'customer'
  AND business_registration_url IS NULL
  AND business_registration_status = 'pending';

CREATE INDEX IF NOT EXISTS idx_회원_검수상태
    ON "01_회원"(business_registration_status)
    WHERE role = 'customer';


-- ─── 2. Storage 버킷 RLS 정책 ──────────────────────────────────
-- 업로드 경로 규약: business-registrations/{user_id}/{timestamp}_{filename}

-- 고객사: 본인 폴더 조회
DROP POLICY IF EXISTS "biz_reg_select_own" ON storage.objects;
CREATE POLICY "biz_reg_select_own" ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'business-registrations'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- 고객사: 본인 폴더 업로드
DROP POLICY IF EXISTS "biz_reg_insert_own" ON storage.objects;
CREATE POLICY "biz_reg_insert_own" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'business-registrations'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- 고객사: 본인 폴더 삭제 (재업로드 위해)
DROP POLICY IF EXISTS "biz_reg_delete_own" ON storage.objects;
CREATE POLICY "biz_reg_delete_own" ON storage.objects
FOR DELETE TO authenticated
USING (
  bucket_id = 'business-registrations'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- 관리자: 전체 조회 (검수용, createSignedUrl 포함)
DROP POLICY IF EXISTS "biz_reg_select_admin" ON storage.objects;
CREATE POLICY "biz_reg_select_admin" ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'business-registrations'
  AND EXISTS (
    SELECT 1 FROM "01_회원"
    WHERE id = auth.uid() AND role = 'admin'
  )
);


-- ─── 3. 검수 RPC: 승인 ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION admin_approve_business_registration(
    p_user_id UUID
) RETURNS BOOLEAN AS $$
BEGIN
    -- 어드민 권한 확인
    IF NOT EXISTS (SELECT 1 FROM "01_회원" WHERE id = auth.uid() AND role = 'admin') THEN
        RAISE EXCEPTION '관리자 권한이 필요합니다';
    END IF;

    UPDATE "01_회원"
    SET business_registration_status = 'approved',
        business_registration_reviewed_at = NOW(),
        business_registration_reviewed_by = auth.uid(),
        business_registration_reject_reason = NULL,
        company_verified_at = NOW()
    WHERE id = p_user_id;

    RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ─── 4. 검수 RPC: 반려 ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION admin_reject_business_registration(
    p_user_id UUID,
    p_reason TEXT
) RETURNS BOOLEAN AS $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM "01_회원" WHERE id = auth.uid() AND role = 'admin') THEN
        RAISE EXCEPTION '관리자 권한이 필요합니다';
    END IF;

    IF p_reason IS NULL OR LENGTH(TRIM(p_reason)) = 0 THEN
        RAISE EXCEPTION '반려 사유가 필요합니다';
    END IF;

    UPDATE "01_회원"
    SET business_registration_status = 'rejected',
        business_registration_reviewed_at = NOW(),
        business_registration_reviewed_by = auth.uid(),
        business_registration_reject_reason = p_reason,
        company_verified_at = NULL
    WHERE id = p_user_id;

    RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ─── 5. 권한 부여 ──────────────────────────────────────────────
GRANT EXECUTE ON FUNCTION admin_approve_business_registration(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION admin_reject_business_registration(UUID, TEXT) TO authenticated;


-- ═══════════════════════════════════════════════════════════════
-- 검증 쿼리
-- ═══════════════════════════════════════════════════════════════
-- 컬럼 확인
-- SELECT column_name FROM information_schema.columns
--   WHERE table_name = '01_회원' AND column_name LIKE 'business%';
--
-- 검수 대기 고객사 조회
-- SELECT id, name, email, business_number, business_registration_status,
--        business_registration_uploaded_at
-- FROM "01_회원"
-- WHERE role = 'customer' AND business_registration_status = 'pending'
-- ORDER BY business_registration_uploaded_at DESC;
-- ═══════════════════════════════════════════════════════════════
