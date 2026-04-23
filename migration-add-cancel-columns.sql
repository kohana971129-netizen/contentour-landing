-- 42_통역계약 테이블에 계약 취소 관련 컬럼 3개 추가
-- 작업일: 2026-04-23
-- 목적: 고객/통역사가 계약 취소 시 42_통역계약.status 업데이트가 실패하던 버그 수정
--       (51_취소내역에는 저장되지만 계약 상태가 바뀌지 않던 문제)

ALTER TABLE "42_통역계약"
  ADD COLUMN IF NOT EXISTS cancelled_by text,
  ADD COLUMN IF NOT EXISTS cancel_reason text,
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz;
