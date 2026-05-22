-- ══════════════════════════════════════════════════════════
-- 42_통역계약 결제 관련 컬럼을 클라이언트 직접 UPDATE로부터 보호
-- 작업일: 2026-05-22
-- 목적: customer/interpreter RLS가 계약의 모든 컬럼 UPDATE를 허용하므로,
--       악의적 사용자가 결제 안 하고 deposit_status='paid' 등으로 변조 가능했음.
--       service_role(verify-payment)과 admin만 결제 컬럼 변경 가능하도록 트리거로 강제.
--
-- 보호 대상 컬럼:
--   - deposit_status, deposit_paid_at, deposit_amount
--   - balance_status, balance_paid_at, balance_amount
--   - total_amount, daily_rate, tax_amount, net_amount
--   - settlement_status
--   - status 컬럼이 결제 관련 값으로 전이될 때 (deposit_paid / balance_paid / settled 등)
--
-- 사전 작업: customer-dashboard.html의 클라이언트 UPDATE 제거 + verify-payment에 서버측 UPDATE 추가.
-- ══════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.prevent_unauthorized_payment_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    actor_role text;
    is_service_role boolean;
BEGIN
    -- service_role(verify-payment 등 API)은 자유 통과
    -- auth.role()이 'service_role'이거나 auth.uid()가 NULL이면 서버측 호출
    is_service_role := (auth.role() = 'service_role') OR (auth.uid() IS NULL);
    IF is_service_role THEN
        RETURN NEW;
    END IF;

    -- admin도 자유 통과
    SELECT role INTO actor_role FROM "01_회원" WHERE id = auth.uid();
    IF actor_role = 'admin' THEN
        RETURN NEW;
    END IF;

    -- 일반 사용자(customer/interpreter)는 결제 컬럼 변경 금지
    IF NEW.deposit_status IS DISTINCT FROM OLD.deposit_status
       OR NEW.deposit_paid_at IS DISTINCT FROM OLD.deposit_paid_at
       OR NEW.deposit_amount IS DISTINCT FROM OLD.deposit_amount
       OR NEW.balance_status IS DISTINCT FROM OLD.balance_status
       OR NEW.balance_paid_at IS DISTINCT FROM OLD.balance_paid_at
       OR NEW.balance_amount IS DISTINCT FROM OLD.balance_amount
       OR NEW.total_amount IS DISTINCT FROM OLD.total_amount
       OR NEW.daily_rate IS DISTINCT FROM OLD.daily_rate
       OR NEW.tax_amount IS DISTINCT FROM OLD.tax_amount
       OR NEW.net_amount IS DISTINCT FROM OLD.net_amount
       OR NEW.settlement_status IS DISTINCT FROM OLD.settlement_status
    THEN
        RAISE EXCEPTION '결제 관련 컬럼은 관리자 또는 결제 API에서만 변경할 수 있습니다.';
    END IF;

    -- status를 결제 관련 값으로 전이시키는 행위 차단 (계약 동의·취소는 허용)
    IF NEW.status IS DISTINCT FROM OLD.status THEN
        IF NEW.status IN ('deposit_paid', 'balance_paid', 'paid', 'settled', 'refunded') THEN
            RAISE EXCEPTION '결제 상태 전이는 관리자 또는 결제 API에서만 가능합니다.';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_42_통역계약_prevent_payment_update ON "42_통역계약";
CREATE TRIGGER trg_42_통역계약_prevent_payment_update
    BEFORE UPDATE ON "42_통역계약"
    FOR EACH ROW
    EXECUTE FUNCTION public.prevent_unauthorized_payment_update();

COMMENT ON FUNCTION public.prevent_unauthorized_payment_update IS
    'service_role/admin이 아닌 사용자가 42_통역계약 결제 관련 컬럼을 직접 UPDATE하는 것을 차단. RLS column-level 제한 대체.';
