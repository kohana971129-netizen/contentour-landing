-- ════════════════════════════════════════════════════════════
-- 통역사 D-day 컨펌 시스템 (Phase 1)
-- 적용 위치: Supabase Dashboard SQL Editor
-- 적용 후 통역사 대시보드 + 어드민 대시보드 코드가 활성화됨
-- ════════════════════════════════════════════════════════════

-- 통역사가 임박한 계약(D-2 ~ 당일)에 대해 "최종 확인" 버튼을 클릭한 시각
-- NULL이면 미확인 → 어드민에게 빨간 알림으로 노출됨
-- 값이 채워지면 통역사 본인이 확인했다는 증거(타임스탬프)로 보존

ALTER TABLE "42_통역계약"
  ADD COLUMN IF NOT EXISTS confirmation_clicked_at TIMESTAMPTZ NULL;

COMMENT ON COLUMN "42_통역계약".confirmation_clicked_at IS
  '통역사가 D-2 ~ 당일 사이 "최종 확인" 버튼을 클릭한 시각. NULL=미확인, 값 있음=확인 완료(타임스탬프 증거).';

-- 어드민/통역사 대시보드에서 "임박한 미확인 계약" 조회 시 사용할 인덱스
-- (start_date 기준 정렬 + confirmation_clicked_at IS NULL 필터)
CREATE INDEX IF NOT EXISTS idx_42_통역계약_confirmation
  ON "42_통역계약" (start_date, confirmation_clicked_at)
  WHERE confirmation_clicked_at IS NULL;
