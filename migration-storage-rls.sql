-- Storage RLS 정책: interpreter-docs, case-images
-- 작업일: 2026-04-23
-- 업로드 경로 규약:
--   interpreter-docs/{user_id}/doc_*.{ext}  (통역사 본인 서류)
--   case-images/case_*.{ext}                (관리자 업로드 성과사례 이미지)

-- ═══════════════════════════════════════════════════════
-- interpreter-docs (비공개)
-- ═══════════════════════════════════════════════════════

-- 통역사: 본인 폴더 조회
DROP POLICY IF EXISTS "interpreter_docs_select_own" ON storage.objects;
CREATE POLICY "interpreter_docs_select_own" ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'interpreter-docs'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- 통역사: 본인 폴더 업로드
DROP POLICY IF EXISTS "interpreter_docs_insert_own" ON storage.objects;
CREATE POLICY "interpreter_docs_insert_own" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'interpreter-docs'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- 통역사: 본인 폴더 삭제
DROP POLICY IF EXISTS "interpreter_docs_delete_own" ON storage.objects;
CREATE POLICY "interpreter_docs_delete_own" ON storage.objects
FOR DELETE TO authenticated
USING (
  bucket_id = 'interpreter-docs'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- 관리자: 전체 조회 (서류 검수용, createSignedUrl 포함)
DROP POLICY IF EXISTS "interpreter_docs_select_admin" ON storage.objects;
CREATE POLICY "interpreter_docs_select_admin" ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'interpreter-docs'
  AND EXISTS (
    SELECT 1 FROM "01_회원"
    WHERE id = auth.uid() AND role = 'admin'
  )
);

-- ═══════════════════════════════════════════════════════
-- case-images (공개 읽기)
-- ═══════════════════════════════════════════════════════

-- 공개 읽기
DROP POLICY IF EXISTS "case_images_select_public" ON storage.objects;
CREATE POLICY "case_images_select_public" ON storage.objects
FOR SELECT TO public
USING (bucket_id = 'case-images');

-- 관리자: 업로드
DROP POLICY IF EXISTS "case_images_insert_admin" ON storage.objects;
CREATE POLICY "case_images_insert_admin" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'case-images'
  AND EXISTS (
    SELECT 1 FROM "01_회원"
    WHERE id = auth.uid() AND role = 'admin'
  )
);

-- 관리자: 수정
DROP POLICY IF EXISTS "case_images_update_admin" ON storage.objects;
CREATE POLICY "case_images_update_admin" ON storage.objects
FOR UPDATE TO authenticated
USING (
  bucket_id = 'case-images'
  AND EXISTS (
    SELECT 1 FROM "01_회원"
    WHERE id = auth.uid() AND role = 'admin'
  )
);

-- 관리자: 삭제
DROP POLICY IF EXISTS "case_images_delete_admin" ON storage.objects;
CREATE POLICY "case_images_delete_admin" ON storage.objects
FOR DELETE TO authenticated
USING (
  bucket_id = 'case-images'
  AND EXISTS (
    SELECT 1 FROM "01_회원"
    WHERE id = auth.uid() AND role = 'admin'
  )
);
