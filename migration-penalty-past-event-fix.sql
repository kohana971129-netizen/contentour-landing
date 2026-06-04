-- ═══════════════════════════════════════════════════════════════
-- 위약금 정책 fix: 지난 행사(행사 시작일 경과) 취소는 환불 불가 (2026-06-04)
-- ═══════════════════════════════════════════════════════════════
-- 배경(버그):
--   calculate_penalty는 v_days = (행사 시작일 - 오늘)로 남은 일수를 계산한다.
--   지난 행사는 v_days < 0 이라 50_위약금정책의 어떤 구간(모두 min_days >= 0)에도
--   매칭되지 않고, fallback이 penalty_rate=0 → '전액 환불'로 산정됐다.
--   → 이미 끝난/시작된 행사를 취소하면 전액 환불되는 버그.
--
-- 수정:
--   v_rate IS NULL(매칭 정책 없음)일 때 v_days 부호로 분기
--     · v_days < 0  (행사 시작일 경과) → 위약금 100% (환불 0) = 환불 불가
--     · v_days >= 0 (정책 구간 밖, 사실상 없음/먼 미래) → 기존대로 전액 환불(rate 0)
--
-- 적용처: Supabase Dashboard → SQL Editor → Run
-- 프로젝트: jgeqbdrfpekzuumaklvx
-- ※ 50_위약금정책 테이블은 변경 없음. calculate_penalty 함수만 교체.
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.calculate_penalty(
    p_contract_id uuid,
    p_cancelled_by text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_start date;
    v_total numeric;
    v_deposit numeric;
    v_days int;
    v_policy uuid;
    v_rate numeric;
    v_base text;
    v_base_amount numeric;
    v_penalty numeric;
    v_refund numeric;
    v_description text;
    v_interp_action text;
BEGIN
    -- deposit_amount가 0/NULL이면 total_amount로 대체 (A안 100% 선결제 호환)
    SELECT start_date,
           total_amount,
           COALESCE(NULLIF(deposit_amount, 0), total_amount)
      INTO v_start, v_total, v_deposit
    FROM "42_통역계약"
    WHERE id = p_contract_id;

    IF v_start IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', '계약을 찾을 수 없습니다.');
    END IF;

    v_days := v_start - CURRENT_DATE;

    SELECT id, penalty_rate, penalty_base, description, interpreter_action
      INTO v_policy, v_rate, v_base, v_description, v_interp_action
    FROM "50_위약금정책"
    WHERE cancel_type = p_cancelled_by
      AND v_days >= min_days
      AND (max_days IS NULL OR v_days <= max_days)
    ORDER BY min_days DESC
    LIMIT 1;

    IF v_rate IS NULL THEN
        IF v_days < 0 THEN
            -- 행사 시작일 경과(지난 행사): 환불 불가 (위약금 100%)
            v_rate := 100;
            v_base := 'total';
            v_description := '행사 시작일 경과 후 취소: 환불 불가';
        ELSE
            -- 정책 구간 밖(사실상 없음/먼 미래): 안전하게 전액 환불
            v_rate := 0;
            v_base := 'total';
            v_description := COALESCE(v_description, '해당 정책 없음');
        END IF;
    END IF;

    -- penalty_base에 따라 base 금액 결정
    IF v_base = 'total' THEN
        v_base_amount := v_total;
    ELSE
        v_base_amount := v_deposit;
    END IF;

    v_penalty := round(v_base_amount * v_rate / 100);
    -- 환불액 = 고객이 실제 지불한 총액 - 위약금
    v_refund := v_total - v_penalty;
    IF v_refund < 0 THEN v_refund := 0; END IF;

    RETURN jsonb_build_object(
        'success', true,
        'policy_id', v_policy,
        'days_remaining', v_days,
        'penalty_rate', v_rate,
        'penalty_base', v_base,
        'penalty_amount', v_penalty,
        'refund_amount', v_refund,
        'description', v_description,
        'interpreter_action', v_interp_action
    );
END
$function$;

-- ═══════════════════════════════════════════════════════════════
-- 검증 (적용 후): 지난 행사 계약 id로 호출 → refund_amount=0, penalty_rate=100 확인
-- SELECT calculate_penalty('<지난행사-contract-uuid>', 'customer');
-- ═══════════════════════════════════════════════════════════════
