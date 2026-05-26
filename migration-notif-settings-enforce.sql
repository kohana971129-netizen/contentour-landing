-- ════════════════════════════════════════════════════════════════
-- migration: 24_알림 INSERT 시 받는 사람의 notification_settings 강제
-- 목적: customer/interpreter가 마이페이지에서 알림 설정 토글한 값을 실제로 반영.
--       기존 알림 INSERT 위치는 8개 파일에 분산 — 코드 변경 없이 DB trigger 하나로 일괄 처리.
--
-- 매핑 (notification_type → notification_settings 키):
--   payment    → payment
--   chat       → chat
--   assignment → contract  (매칭 확정은 계약 흐름)
--   quote      → contract  (견적 응답은 계약 흐름)
--   service    → contract  (잔금·완료·취소 등 광범위, 대부분 계약 관련)
--   marketing  → marketing
--   points     → points
--   (그 외 알 수 없는 타입은 통과 — 차단보다 발송이 안전)
--
-- 동작:
--   - 설정이 false → INSERT skip (silent)
--   - 설정이 true 또는 NULL → INSERT 진행 (기본은 발송)
--   - notification_settings 컬럼 자체가 NULL이면 발송 (구 회원 backward compat)
-- ════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.enforce_notif_settings()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_settings JSONB;
    v_key      TEXT;
    v_val      BOOLEAN;
BEGIN
    -- notification_type → settings 키 매핑
    v_key := CASE NEW.notification_type
        WHEN 'payment'    THEN 'payment'
        WHEN 'chat'       THEN 'chat'
        WHEN 'assignment' THEN 'contract'
        WHEN 'quote'      THEN 'contract'
        WHEN 'service'    THEN 'contract'
        WHEN 'marketing'  THEN 'marketing'
        WHEN 'points'     THEN 'points'
        ELSE NULL
    END;

    -- 매핑 안 된 타입은 통과 (안전)
    IF v_key IS NULL THEN
        RETURN NEW;
    END IF;

    -- 받는 사람의 설정 조회
    SELECT notification_settings INTO v_settings
      FROM "01_회원"
     WHERE id = NEW.user_id;

    -- 설정 자체가 없으면 통과 (기본 발송)
    IF v_settings IS NULL THEN
        RETURN NEW;
    END IF;

    v_val := (v_settings ->> v_key)::boolean;

    -- false면 INSERT skip (NULL 반환 = BEFORE trigger가 row drop)
    IF v_val IS FALSE THEN
        RETURN NULL;
    END IF;

    RETURN NEW;
END;
$$;

-- 기존 trigger가 있으면 교체
DROP TRIGGER IF EXISTS trg_24_알림_enforce_notif_settings ON "24_알림";

CREATE TRIGGER trg_24_알림_enforce_notif_settings
BEFORE INSERT ON "24_알림"
FOR EACH ROW
EXECUTE FUNCTION public.enforce_notif_settings();

COMMENT ON FUNCTION public.enforce_notif_settings IS
'24_알림 INSERT 시 받는 사람의 01_회원.notification_settings 확인. 해당 타입이 false면 silent skip. NULL 또는 매핑 안 된 타입은 통과(기본 발송).';
