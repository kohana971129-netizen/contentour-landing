-- ═══════════════════════════════════════════════════════════════
-- 정산 RPC 권한 상승 취약점 수정: admin 가드 추가 (2026-06-01)
-- ═══════════════════════════════════════════════════════════════
-- 취약점: approve_settlement / reject_settlement / complete_settlement_payment 가
--   SECURITY DEFINER(소유자 권한, RLS 우회) + authenticated 전체에 GRANT 인데
--   함수 내부에 호출자 admin 검증이 없음. p_admin_id는 파라미터로 받기만 함.
--   → 일반 고객/통역사가 직접 RPC 호출로 정산 승인·입금·반려 가능 (금전 권한 상승).
--
-- 수정: 각 함수 맨 앞에 public.is_admin() 가드 추가 (RLS 정책에서 쓰는 동일 함수).
--   비admin이면 실행 차단. 기존 로직·시그니처는 그대로 유지(CREATE OR REPLACE).
--
-- 적용처: Supabase Dashboard → SQL Editor → Run
-- 프로젝트: jgeqbdrfpekzuumaklvx
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.approve_settlement(p_settlement_id uuid, p_admin_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_settlement RECORD;
    v_bank RECORD;
BEGIN
    -- ★ 권한 가드: 관리자만 정산 승인 가능
    IF NOT public.is_admin() THEN
        RETURN jsonb_build_object('success', false, 'error', '관리자 권한이 필요합니다.');
    END IF;

    SELECT * INTO v_settlement FROM "43_정산내역" WHERE id = p_settlement_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', '정산 내역을 찾을 수 없습니다.');
    END IF;
    IF v_settlement.status != 'request' THEN
        RETURN jsonb_build_object('success', false, 'error', '승인 대기 상태가 아닙니다.');
    END IF;

    SELECT * INTO v_bank FROM "41_계좌정보" WHERE user_id = v_settlement.interpreter_id;

    UPDATE "43_정산내역" SET status = 'approved', approved_at = now(), approved_by = p_admin_id, bank_account_id = v_bank.id WHERE id = p_settlement_id;

    IF v_settlement.contract_id IS NOT NULL THEN
        UPDATE "42_통역계약" SET settlement_status = 'approved' WHERE id = v_settlement.contract_id;
    END IF;

    INSERT INTO "24_알림" (user_id, notification_type, title, message, link)
    VALUES (v_settlement.interpreter_id, 'settlement', '정산이 승인되었습니다',
        v_settlement.exhibition_name || ' 정산이 승인되었습니다. 영업일 3~5일 내 입금 예정입니다.',
        '/interpreter-dashboard.html#settlement');

    RETURN jsonb_build_object('success', true, 'status', 'approved', 'bank_registered', v_bank.id IS NOT NULL);
END;
$function$;

CREATE OR REPLACE FUNCTION public.complete_settlement_payment(p_settlement_id uuid, p_payment_reference text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_settlement RECORD;
    v_bank RECORD;
BEGIN
    -- ★ 권한 가드: 관리자만 입금 완료 처리 가능 (실제 송금 확정 — 가장 민감)
    IF NOT public.is_admin() THEN
        RETURN jsonb_build_object('success', false, 'error', '관리자 권한이 필요합니다.');
    END IF;

    SELECT * INTO v_settlement FROM "43_정산내역" WHERE id = p_settlement_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', '정산 내역을 찾을 수 없습니다.');
    END IF;
    IF v_settlement.status != 'approved' THEN
        RETURN jsonb_build_object('success', false, 'error', '승인 완료 상태가 아닙니다.');
    END IF;

    SELECT * INTO v_bank FROM "41_계좌정보" WHERE user_id = v_settlement.interpreter_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', '등록된 계좌가 없습니다.');
    END IF;

    UPDATE "43_정산내역" SET status = 'paid', paid_at = now(), paid_amount = v_settlement.net_amount,
        payment_reference = p_payment_reference, paid_bank_name = v_bank.bank_name,
        paid_account_holder = v_bank.account_holder, paid_account_number = v_bank.account_number
    WHERE id = p_settlement_id;

    IF v_settlement.contract_id IS NOT NULL THEN
        UPDATE "42_통역계약" SET status = 'settled', settlement_status = 'paid' WHERE id = v_settlement.contract_id;
    END IF;

    INSERT INTO "24_알림" (user_id, notification_type, title, message, link)
    VALUES (v_settlement.interpreter_id, 'settlement', '입금이 완료되었습니다',
        v_settlement.exhibition_name || ' 정산금 ₩' || to_char(v_settlement.net_amount, 'FM999,999,999') || '이 입금되었습니다.',
        '/interpreter-dashboard.html#settlement');

    RETURN jsonb_build_object('success', true, 'status', 'paid', 'amount', v_settlement.net_amount);
END;
$function$;

CREATE OR REPLACE FUNCTION public.reject_settlement(p_settlement_id uuid, p_admin_id uuid, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_settlement RECORD;
BEGIN
    -- ★ 권한 가드: 관리자만 정산 반려 가능
    IF NOT public.is_admin() THEN
        RETURN jsonb_build_object('success', false, 'error', '관리자 권한이 필요합니다.');
    END IF;

    SELECT * INTO v_settlement FROM "43_정산내역" WHERE id = p_settlement_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', '정산 내역을 찾을 수 없습니다.');
    END IF;

    UPDATE "43_정산내역" SET status = 'rejected', rejected_at = now(), rejected_by = p_admin_id, reject_reason = p_reason WHERE id = p_settlement_id;

    INSERT INTO "24_알림" (user_id, notification_type, title, message, link)
    VALUES (v_settlement.interpreter_id, 'settlement', '정산이 반려되었습니다',
        v_settlement.exhibition_name || ' 정산이 반려되었습니다. 사유: ' || p_reason,
        '/interpreter-dashboard.html#settlement');

    RETURN jsonb_build_object('success', true, 'status', 'rejected');
END;
$function$;

-- ─── 검증 (적용 후) ────────────────────────────────────────────
-- 1) 세 함수 모두 is_admin() 가드 포함 확인:
--    SELECT proname FROM pg_proc WHERE proname IN
--      ('approve_settlement','reject_settlement','complete_settlement_payment')
--      AND prosrc ILIKE '%is_admin%';   -- 3행 나와야 정상
-- 2) 일반(비admin) 계정으로 RPC 호출 시 {"success":false,"error":"관리자 권한이 필요합니다."} 반환되는지
