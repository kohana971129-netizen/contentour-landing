-- ════════════════════════════════════════════════════════════════
-- migration: 01_회원.notification_settings JSONB 컬럼 추가
-- 목적: 고객사·통역사 알림 수신 설정(5개 옵션)을 한 컬럼에 저장.
--       JSONB라 미래 옵션 추가 시 마이그레이션 불필요.
--
-- 사용처:
--   customer-dashboard.html 마이페이지 → 알림 설정 5개 체크박스
--     - contract  계약 상태 변경
--     - payment   결제 완료
--     - points    적립금 적립/사용 (현재 UI OFF 상태이지만 백엔드 유지)
--     - chat      채팅 메시지
--     - marketing 마케팅/이벤트
--
-- 코드는 컬럼 없어도 안 깨지게 try/catch — 적용 전이라도 UI는 동작 (저장만 안 됨).
-- ════════════════════════════════════════════════════════════════

ALTER TABLE "01_회원"
  ADD COLUMN IF NOT EXISTS notification_settings JSONB
  DEFAULT '{"contract":true,"payment":true,"points":true,"chat":true,"marketing":false}'::jsonb;

COMMENT ON COLUMN "01_회원".notification_settings IS
'알림 수신 설정 (JSONB). keys: contract, payment, points, chat, marketing. 모두 boolean.';

-- 기존 회원에도 default 값 백필 (NULL인 행만)
UPDATE "01_회원"
   SET notification_settings = '{"contract":true,"payment":true,"points":true,"chat":true,"marketing":false}'::jsonb
 WHERE notification_settings IS NULL;
