-- ============================================================
-- RLS 정책 강화 v6 — 24_알림 INSERT 조건 좁히기 + 리뷰 알림 trigger (2026-05-18)
--
-- 이슈: 24_알림 authenticated_insert가 "계약 상대방" EXISTS 조건을 허용
--       → 통역사가 자기 고객사에게 가짜 알림("결제 취소되었습니다" 등) INSERT 가능
--       → 시스템 무결성 위협은 아니나 UX 사기/혼란 가능
--
-- 해결: 정책에서 계약 상대방 EXISTS 조건 제거 → 본인 + admin만 허용.
--       유일한 클라이언트 호출처(customer-dashboard.html:2146 평가 알림)는
--       49_통역사리뷰 INSERT trigger로 대체 (SECURITY DEFINER → RLS 우회)
--
-- 재실행 안전 (DROP IF EXISTS + CREATE OR REPLACE)
-- ============================================================

-- ────────────────────────────────────────────────
-- 1) 24_알림 authenticated_insert 정책 좁히기
-- ────────────────────────────────────────────────
DROP POLICY IF EXISTS authenticated_insert ON "24_알림";

CREATE POLICY authenticated_insert
ON "24_알림"
FOR INSERT
TO authenticated
WITH CHECK (
  (user_id = auth.uid()) OR is_admin()
);

-- ────────────────────────────────────────────────
-- 2) 49_통역사리뷰 INSERT trigger — 통역사 자동 알림
-- ────────────────────────────────────────────────
-- SECURITY DEFINER 함수 → RLS 우회 (24_알림 정책과 무관하게 INSERT 가능)
-- INSERT 시에만 발화 (upsert의 UPDATE 경로는 별점 수정이라 알림 스팸 방지)

CREATE OR REPLACE FUNCTION notify_interpreter_on_review()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- 통역사 자기 본인 평가가 아닌 경우만 (방어적)
  IF NEW.interpreter_id IS NOT NULL AND NEW.interpreter_id <> NEW.customer_id THEN
    INSERT INTO "24_알림" (user_id, notification_type, title, message, is_read)
    VALUES (
      NEW.interpreter_id,
      'service',
      '⭐ 고객사로부터 현장 평가를 받았습니다',
      '"' || COALESCE(NEW.exhibition_name, '') || '" 건에 대한 현장 평가가 등록되었습니다. 전반적 만족도: ' || COALESCE(NEW.rating_overall::text, '0') || '/5점',
      false
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_interpreter_on_review ON "49_통역사리뷰";

CREATE TRIGGER trg_notify_interpreter_on_review
AFTER INSERT ON "49_통역사리뷰"
FOR EACH ROW
EXECUTE FUNCTION notify_interpreter_on_review();

-- 참고:
-- - admin-dashboard.html 7건의 알림 INSERT는 is_admin() 통과 ✅
-- - customer-dashboard.html:1847 본인 문의접수 알림은 user_id=auth.uid() 통과 ✅
-- - customer-dashboard.html:2146 평가 알림은 클라이언트에서 제거됨
--   (49_통역사리뷰 INSERT trigger가 자동 발송 — 별도 commit으로 클라이언트 코드 제거)
-- - 서버측 API들(assign.js, respond-inquiry.js 등)은 service_role이라 RLS 우회 ✅
