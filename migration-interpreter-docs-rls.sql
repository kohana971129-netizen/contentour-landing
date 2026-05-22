-- ══════════════════════════════════════════════════════════
-- interpreter-docs Storage 버킷 RLS 강화
-- 작업일: 2026-05-22
-- 목적: 통역사 본인은 자기 폴더만 관리, admin만 전체 접근.
--       다른 통역사의 자격증·이력서·서류 SELECT/DOWNLOAD 차단.
--
-- 경로 규칙 (코드에서 사용 중):
--   - interpreter-dashboard 직접 업로드: '{user_id}/...'  (본인 폴더)
--   - interpreter-apply.html signed URL: 'certifications/...' 또는 'applications/...'
--     (signed URL은 service_role 컨텍스트로 업로드 → RLS bypass, 정상 동작)
--
-- 적용 후 영향:
--   - 본인 폴더 SELECT/INSERT/UPDATE/DELETE: 허용
--   - 다른 통역사의 본인 폴더 접근: 차단
--   - certifications/applications 폴더는 일반 client에서 접근 불가
--     (admin만 가능, 일반 사용자는 service_role API를 통해서만 다운로드)
-- ══════════════════════════════════════════════════════════

-- Storage.objects는 기본적으로 RLS 활성화 상태 (Supabase 기본).
-- 명시적으로 재확인:
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- ── SELECT: 본인 폴더 OR admin ──
DROP POLICY IF EXISTS "interp_docs_select_own_or_admin" ON storage.objects;
CREATE POLICY "interp_docs_select_own_or_admin" ON storage.objects
    FOR SELECT TO authenticated
    USING (
        bucket_id = 'interpreter-docs'
        AND (
            (storage.foldername(name))[1] = auth.uid()::text
            OR EXISTS (SELECT 1 FROM "01_회원" WHERE id = auth.uid() AND role = 'admin')
        )
    );

-- ── INSERT: 본인 폴더 OR admin ──
DROP POLICY IF EXISTS "interp_docs_insert_own_or_admin" ON storage.objects;
CREATE POLICY "interp_docs_insert_own_or_admin" ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (
        bucket_id = 'interpreter-docs'
        AND (
            (storage.foldername(name))[1] = auth.uid()::text
            OR EXISTS (SELECT 1 FROM "01_회원" WHERE id = auth.uid() AND role = 'admin')
        )
    );

-- ── UPDATE: 본인 폴더 OR admin ──
DROP POLICY IF EXISTS "interp_docs_update_own_or_admin" ON storage.objects;
CREATE POLICY "interp_docs_update_own_or_admin" ON storage.objects
    FOR UPDATE TO authenticated
    USING (
        bucket_id = 'interpreter-docs'
        AND (
            (storage.foldername(name))[1] = auth.uid()::text
            OR EXISTS (SELECT 1 FROM "01_회원" WHERE id = auth.uid() AND role = 'admin')
        )
    );

-- ── DELETE: 본인 폴더 OR admin ──
DROP POLICY IF EXISTS "interp_docs_delete_own_or_admin" ON storage.objects;
CREATE POLICY "interp_docs_delete_own_or_admin" ON storage.objects
    FOR DELETE TO authenticated
    USING (
        bucket_id = 'interpreter-docs'
        AND (
            (storage.foldername(name))[1] = auth.uid()::text
            OR EXISTS (SELECT 1 FROM "01_회원" WHERE id = auth.uid() AND role = 'admin')
        )
    );

-- anon은 private 버킷이라 자동 차단 (정책 없음 = 거부)

-- ══════════════════════════════════════════════════════════
-- 검증 SQL
-- ══════════════════════════════════════════════════════════
SELECT
    polname AS policy_name,
    polcmd AS command,
    pg_get_expr(polqual, polrelid) AS using_expr
FROM pg_policy
WHERE polrelid = 'storage.objects'::regclass
  AND polname LIKE 'interp_docs%'
ORDER BY polname;
