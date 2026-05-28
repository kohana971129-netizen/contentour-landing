-- ════════════════════════════════════════════════════════════════
-- migration: showcase_assign_atomic — 부가세 처리 수정 (VAT fix)
-- 목적: showcase_assign_atomic RPC가 total_amount을 공급가 그대로 저장하던
--       버그 수정. 일당=공급가 모델로 total = 공급가 + 부가세(10%).
--       + deposit_amount(=total)·balance_amount(0)·balance_status('paid') 설정
--         (A안 100% 선결제 — 미설정 시 고객 결제 금액이 0원으로 매핑되던 문제 해소).
--
-- 견적 작성기(admin-dashboard sendQuote)·assign.js(api)와 동일한 산식으로 통일.
-- CREATE OR REPLACE 이므로 적용 시 함수만 갱신됨 (데이터 변경 없음).
-- 기존 계약(이미 잘못 저장된 건)은 별도 보정 필요 — 아래 주석 참고.
-- ════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.showcase_assign_atomic(
    p_posting_id           UUID,
    p_interpreter_id       UUID,
    p_daily_rate           NUMERIC,
    p_memo                 TEXT,
    p_interpreter_display  TEXT
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_posting        RECORD;
    v_days           INT;
    v_net            NUMERIC;
    v_tax            NUMERIC;
    v_total          NUMERIC;
    v_customer_id    UUID;
    v_contract_id    UUID;
BEGIN
    -- 1) posting 조회
    SELECT *
      INTO v_posting
      FROM "46_ITQ견적문의"
     WHERE id = p_posting_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'posting not found: %', p_posting_id;
    END IF;

    -- 2) 일수 계산
    v_days := 1;
    IF v_posting.start_date IS NOT NULL AND v_posting.end_date IS NOT NULL THEN
        v_days := GREATEST(1, (v_posting.end_date - v_posting.start_date) + 1);
    END IF;

    -- 부가세 별도 모델: 일당=공급가 → 총액 = 공급가 + 부가세(10%)
    v_net   := COALESCE(p_daily_rate, 0) * v_days;
    v_tax   := ROUND(v_net * 0.1);
    v_total := v_net + v_tax;
    v_customer_id := COALESCE(v_posting.posted_by_user_id, v_posting.user_id);

    -- 3) 계약 생성 (deposit_amount=total, balance 없음 — A안 100% 선결제)
    INSERT INTO "42_통역계약" (
        order_id, customer_id, interpreter_id,
        exhibition_name, client_company, venue,
        start_date, end_date, working_days,
        language_pair, service_type,
        daily_rate, total_amount, tax_amount, net_amount,
        deposit_amount, balance_amount, balance_status,
        status
    ) VALUES (
        p_posting_id, v_customer_id, p_interpreter_id,
        COALESCE(v_posting.exhibition_name, ''),
        COALESCE(v_posting.company, ''),
        COALESCE(v_posting.venue, v_posting.location, ''),
        v_posting.start_date, v_posting.end_date, v_days,
        COALESCE(v_posting.language_pair, ''), 'OTHER',
        p_daily_rate, v_total, v_tax, v_net,
        v_total, 0, 'paid',
        'pending'
    )
    RETURNING id INTO v_contract_id;

    -- 4) 견적문의 → 계약진행
    UPDATE "46_ITQ견적문의"
       SET contract_id = v_contract_id,
           status      = '계약진행',
           admin_note  = jsonb_build_object(
                             'interpreter',   p_interpreter_display,
                             'interpreterId', p_interpreter_id,
                             'memo',          COALESCE(p_memo, '')
                         )::text
     WHERE id = p_posting_id;

    -- 5) 지원자 → 매칭 확정
    UPDATE "70_구인공고지원"
       SET status      = 'matched',
           contract_id = v_contract_id
     WHERE posting_id     = p_posting_id
       AND interpreter_id = p_interpreter_id;

    -- 6) 나머지 지원자 → 거절
    UPDATE "70_구인공고지원"
       SET status = 'declined'
     WHERE posting_id     = p_posting_id
       AND interpreter_id <> p_interpreter_id
       AND status IN ('pending', 'forwarded');

    RETURN v_contract_id;
END;
$$;

-- 권한: service_role만 호출 가능 (API 서버에서만 사용)
REVOKE ALL ON FUNCTION public.showcase_assign_atomic(UUID, UUID, NUMERIC, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.showcase_assign_atomic(UUID, UUID, NUMERIC, TEXT, TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.showcase_assign_atomic(UUID, UUID, NUMERIC, TEXT, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.showcase_assign_atomic(UUID, UUID, NUMERIC, TEXT, TEXT) TO service_role;

-- ────────────────────────────────────────────────────────────────
-- (선택) 이미 잘못 저장된 기존 계약 보정 — VAT 누락분 반영.
-- order_id가 direct_posting 공고에서 생성됐고 total_amount=net_amount(=공급가)로
-- 잘못 저장된 건만 대상. 결제 완료 전(deposit_status != 'paid') 계약에 한해 안전하게 보정.
-- 검토 후 수동 실행 권장 (자동 실행 안 함).
--
-- UPDATE "42_통역계약"
--    SET tax_amount     = ROUND(net_amount * 0.1),
--        total_amount   = net_amount + ROUND(net_amount * 0.1),
--        deposit_amount = net_amount + ROUND(net_amount * 0.1),
--        balance_amount = 0,
--        balance_status = 'paid'
--  WHERE total_amount = net_amount          -- VAT 미반영 상태
--    AND COALESCE(deposit_status,'') <> 'paid'  -- 아직 결제 안 됨
--    AND net_amount > 0;
-- ────────────────────────────────────────────────────────────────
