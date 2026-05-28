-- ════════════════════════════════════════════════════════════════
-- migration: assign_inquiry_atomic
-- 목적: api/assign.js (견적문의 → 통역사 배정)의 다단계 DB 쓰기를
--       단일 트랜잭션으로 묶어 부분 실패 시 전체 롤백 보장.
--       (showcase_assign_atomic 과 동일 패턴)
--
-- 처리: 1) 46_ITQ견적문의 상태·admin_note 갱신
--       2) order_id 기준 기존 계약 있으면 UPDATE, 없으면 INSERT
--       3) 신규 INSERT 시 견적문의.contract_id 연결
-- 모두 한 트랜잭션. 계약 금액은 호출측(JS)에서 계산해 p_contract(jsonb)로 전달.
-- (일당=공급가, total=net×1.1, deposit=total, balance=0 — [[project_vat_model]])
--
-- 클라이언트는 이 함수가 없으면 자동 fallback(단계별 처리) — backward compat.
-- CREATE OR REPLACE (idempotent, 데이터 변경 없음).
-- ════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.assign_inquiry_atomic(
    p_inquiry_id  UUID,
    p_db_status   TEXT,
    p_admin_note  JSONB,
    p_contract    JSONB
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_existing     UUID;
    v_contract_id  UUID;
    v_total        NUMERIC := (p_contract->>'total_amount')::NUMERIC;
BEGIN
    -- 1) 견적문의 상태/메모 갱신
    UPDATE "46_ITQ견적문의"
       SET status     = p_db_status,
           admin_note = p_admin_note::text
     WHERE id = p_inquiry_id;

    -- 2) order_id 기준 기존 계약 확인
    SELECT id INTO v_existing
      FROM "42_통역계약"
     WHERE order_id = p_inquiry_id
     LIMIT 1;

    IF v_existing IS NOT NULL THEN
        UPDATE "42_통역계약" SET
            interpreter_id = (p_contract->>'interpreter_id')::uuid,
            customer_id    = COALESCE((p_contract->>'customer_id')::uuid, customer_id),
            exhibition_name= p_contract->>'exhibition_name',
            client_company = p_contract->>'client_company',
            venue          = p_contract->>'venue',
            start_date     = NULLIF(p_contract->>'start_date','')::date,
            end_date       = NULLIF(p_contract->>'end_date','')::date,
            working_days   = (p_contract->>'working_days')::int,
            language_pair  = p_contract->>'language_pair',
            service_type   = p_contract->>'service_type',
            daily_rate     = (p_contract->>'daily_rate')::numeric,
            total_amount   = v_total,
            tax_amount     = (p_contract->>'tax_amount')::numeric,
            net_amount     = (p_contract->>'net_amount')::numeric,
            deposit_amount = v_total,
            balance_amount = 0,
            balance_status = 'paid'
         WHERE id = v_existing;
        v_contract_id := v_existing;
    ELSE
        INSERT INTO "42_통역계약" (
            order_id, customer_id, interpreter_id,
            exhibition_name, client_company, venue,
            start_date, end_date, working_days,
            language_pair, service_type,
            daily_rate, total_amount, tax_amount, net_amount,
            deposit_amount, balance_amount, balance_status, status
        ) VALUES (
            p_inquiry_id,
            (p_contract->>'customer_id')::uuid,
            (p_contract->>'interpreter_id')::uuid,
            p_contract->>'exhibition_name',
            p_contract->>'client_company',
            p_contract->>'venue',
            NULLIF(p_contract->>'start_date','')::date,
            NULLIF(p_contract->>'end_date','')::date,
            (p_contract->>'working_days')::int,
            p_contract->>'language_pair',
            p_contract->>'service_type',
            (p_contract->>'daily_rate')::numeric,
            v_total, (p_contract->>'tax_amount')::numeric, (p_contract->>'net_amount')::numeric,
            v_total, 0, 'paid', 'pending'
        )
        RETURNING id INTO v_contract_id;

        UPDATE "46_ITQ견적문의" SET contract_id = v_contract_id WHERE id = p_inquiry_id;
    END IF;

    RETURN v_contract_id;
END;
$$;

-- 권한: service_role만 (API 서버 전용)
REVOKE ALL ON FUNCTION public.assign_inquiry_atomic(UUID, TEXT, JSONB, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.assign_inquiry_atomic(UUID, TEXT, JSONB, JSONB) FROM anon;
REVOKE ALL ON FUNCTION public.assign_inquiry_atomic(UUID, TEXT, JSONB, JSONB) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.assign_inquiry_atomic(UUID, TEXT, JSONB, JSONB) TO service_role;

COMMENT ON FUNCTION public.assign_inquiry_atomic IS
'견적문의 → 통역사 배정: 견적 상태/메모 + 계약 생성·갱신 + contract_id 연결을 단일 트랜잭션 처리. (api/assign.js)';
