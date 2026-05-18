-- ============================================================
-- RLS 정책 강화 v5 — 48_통역사지원서 INSERT 정책 제거 (2026-05-18)
-- 이슈: anon_insert_apply (WITH CHECK true) +
--       authenticated_insert (WITH CHECK true)
--       → 누구나 임의 데이터로 무제한 지원서 INSERT 가능
--          (스팸·허위 지원서 → admin 검토 비용 증가)
-- 영향: 정상 흐름은 모두 service_role 경유 → 영향 없음
--       · interpreter-apply.html:1662 → fetch('/api/submit-application')
--       · api/submit.js:10 → SERVICE_KEY로 INSERT
--       클라이언트가 직접 supabase.from('48_통역사지원서').insert()
--       호출하는 코드 0건 확인 완료
-- 재실행 안전 (DROP IF EXISTS)
-- ============================================================

DROP POLICY IF EXISTS anon_insert_apply ON "48_통역사지원서";
DROP POLICY IF EXISTS authenticated_insert ON "48_통역사지원서";

-- 참고:
-- - service_all (service_role ALL) 유지 → 서버 API 정상
-- - authenticated_read (is_admin) 유지 → admin 콘솔 조회
-- - authenticated_update (is_admin) 유지 → admin 승인·반려
