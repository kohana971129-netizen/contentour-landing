-- ============================================================
-- RLS 정책 강화 v2 (2026-05-18 보안 갭 4건 수정)
-- 코드 영향 0 — 기존 클라이언트 사용 패턴과 호환 확인 완료
-- 재실행 안전 (DROP IF EXISTS + CREATE)
-- ============================================================

-- ────────────────────────────────────────────────
-- 1. 47_결제기록 INSERT 차단
-- ────────────────────────────────────────────────
-- 이슈: with_check=true → 사용자가 결제 안 하고도 본인 명의로
--        "결제됨" 행 위조 INSERT 가능 (결제 스킵 공격)
-- 영향: 클라이언트 코드는 SELECT만 함. INSERT는 모두 verify-payment
--        / portone-webhook (service_role) 경유 → 정책 제거 안전
DROP POLICY IF EXISTS "authenticated_insert" ON "47_결제기록";


-- ────────────────────────────────────────────────
-- 2. 45_채팅메시지 INSERT sender_id + 계약 참여자 검증
-- ────────────────────────────────────────────────
-- 이슈: with_check=true → 타인의 sender_id로 위조 또는
--        본인이 참여하지 않은 계약방에 메시지 발송 가능
-- 영향: sendMessage()가 항상 sender_id=auth.uid()로 INSERT,
--        그리고 본인 계약방에만 진입하므로 강화 후에도 동작 정상
DROP POLICY IF EXISTS "authenticated_insert" ON "45_채팅메시지";
CREATE POLICY "authenticated_insert"
  ON "45_채팅메시지"
  FOR INSERT
  TO authenticated
  WITH CHECK (
    sender_id = auth.uid()
    AND (
      contract_id IS NULL
      OR EXISTS (
        SELECT 1 FROM "42_통역계약" c
        WHERE c.id = contract_id
          AND (c.customer_id = auth.uid() OR c.interpreter_id = auth.uid())
      )
      OR is_admin()
    )
  );


-- ────────────────────────────────────────────────
-- 3. 44_상담일지 INSERT 자기 명의로만 + admin
-- ────────────────────────────────────────────────
-- 이슈: with_check=true → 누구나 다른 통역사 명의로 상담일지 위조 가능
-- 영향: 통역사는 interpreter_id=self로 INSERT, 고객사는 customer_id=self로
--        INSERT, admin은 마이그레이션 시 직접 INSERT — 모두 통과
-- 한계: 고객사가 interpreter_id를 임의 통역사로 셋하는 위조는 여전히
--        가능 (customer_id 검증만 통과하면 됨). 추후 트리거로 보강 가능
DROP POLICY IF EXISTS "authenticated_insert" ON "44_상담일지";
CREATE POLICY "authenticated_insert"
  ON "44_상담일지"
  FOR INSERT
  TO authenticated
  WITH CHECK (
    interpreter_id = auth.uid()
    OR customer_id = auth.uid()
    OR is_admin()
  );


-- ────────────────────────────────────────────────
-- 4. 49_통역사리뷰 SELECT 비공개 리뷰 보호
-- ────────────────────────────────────────────────
-- 이슈: using=true → is_public=false (자동 보류, 관리자 숨김) 리뷰도
--        anon으로 직접 쿼리 시 노출됨. 클라이언트 코드 필터에만 의존
-- 영향: 클라이언트는 이미 .eq('is_public', true) 필터 사용 →
--        정상 케이스는 영향 없음. 본인 작성 리뷰, 본인 받은 리뷰,
--        admin은 비공개 리뷰도 볼 수 있음
DROP POLICY IF EXISTS "authenticated_read" ON "49_통역사리뷰";
CREATE POLICY "authenticated_read"
  ON "49_통역사리뷰"
  FOR SELECT
  TO authenticated
  USING (
    is_public = true
    OR customer_id = auth.uid()
    OR interpreter_id = auth.uid()
    OR is_admin()
  );

-- anon 역할도 공개 리뷰만 보도록 (cases.html 등 공개 페이지)
DROP POLICY IF EXISTS "anon_read_public" ON "49_통역사리뷰";
CREATE POLICY "anon_read_public"
  ON "49_통역사리뷰"
  FOR SELECT
  TO anon
  USING (is_public = true);


-- ============================================================
-- 변경 후 검증 쿼리
-- ============================================================
-- 정책 다시 조회해서 변경 확인:
--
-- SELECT tablename, policyname, cmd, qual, with_check
-- FROM pg_policies
-- WHERE schemaname = 'public'
--   AND tablename IN ('47_결제기록','45_채팅메시지','44_상담일지','49_통역사리뷰')
-- ORDER BY tablename, cmd;
