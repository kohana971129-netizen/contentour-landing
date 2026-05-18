-- ═══════════════════════════════════════════════════════════════
-- 49_통역사리뷰 컬럼 단위 보호 BEFORE UPDATE 트리거 (2026-05-18)
-- ═══════════════════════════════════════════════════════════════
-- 이슈:
--   현재 RLS 정책은 행 단위만 허용 검증.
--   - authenticated_update (customer_id = auth.uid() OR is_admin())
--     → 고객사가 자기 리뷰 UPDATE 시 interpreter_reply, is_public,
--       hidden_*, report_* 등 통역사·관리자 전용 컬럼까지 변경 가능
--   - interpreter_reply_own_review (interpreter_id = auth.uid())
--     → 통역사가 자기 리뷰의 별점·본문까지 위조 가능
--
-- 해결:
--   BEFORE UPDATE 트리거에서 호출자 role별로 변경 가능 컬럼을 화이트리스트.
--
-- 권한 매트릭스:
--   | 컬럼 그룹              | 고객사 | 통역사 | admin | service_role |
--   |------------------------|--------|--------|-------|--------------|
--   | 식별자 (contract_id,   |   ❌   |   ❌   |  ❌   |      ✅      |
--   |  customer_id,          |        |        |       |              |
--   |  interpreter_id)       |        |        |       |              |
--   | 별점·본문·전시회명     |   ✅   |   ❌   |  ✅   |      ✅      |
--   | 답글 (interpreter_     |   ❌   |   ✅   |  ✅   |      ✅      |
--   |  reply, *_at)          |        |        |       |              |
--   | 신고 (report_*)        |   ❌   |   ✅   |  ✅   |      ✅      |
--   | 모더레이션 (is_public, |   ❌   |   ❌   |  ✅   |      ✅      |
--   |  hidden_*, hide_*,     |        |        |       |              |
--   |  auto_flagged, flagged)|        |        |       |              |
--
-- 재실행 안전 (CREATE OR REPLACE + DROP IF EXISTS)
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION protect_review_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    -- service_role / postgres / supabase_admin은 모든 변경 허용 (서버 API용)
    IF current_user IN ('service_role', 'postgres', 'supabase_admin') THEN
        RETURN NEW;
    END IF;

    -- 식별자(contract_id, customer_id, interpreter_id)는 admin 포함 누구도 변경 금지
    IF NEW.contract_id IS DISTINCT FROM OLD.contract_id
       OR NEW.customer_id IS DISTINCT FROM OLD.customer_id
       OR NEW.interpreter_id IS DISTINCT FROM OLD.interpreter_id THEN
        RAISE EXCEPTION '리뷰의 식별자(contract_id/customer_id/interpreter_id)는 변경할 수 없습니다.';
    END IF;

    -- admin은 식별자 외 모든 컬럼 변경 가능
    IF is_admin() THEN
        RETURN NEW;
    END IF;

    -- 고객사: 별점·본문·전시회명만 변경 가능
    IF auth.uid() = OLD.customer_id THEN
        IF NEW.interpreter_reply IS DISTINCT FROM OLD.interpreter_reply
           OR NEW.interpreter_reply_at IS DISTINCT FROM OLD.interpreter_reply_at
           OR NEW.report_status IS DISTINCT FROM OLD.report_status
           OR NEW.report_reason IS DISTINCT FROM OLD.report_reason
           OR NEW.reported_at IS DISTINCT FROM OLD.reported_at
           OR NEW.is_public IS DISTINCT FROM OLD.is_public
           OR NEW.auto_flagged IS DISTINCT FROM OLD.auto_flagged
           OR NEW.flagged_keywords IS DISTINCT FROM OLD.flagged_keywords
           OR NEW.hidden_by IS DISTINCT FROM OLD.hidden_by
           OR NEW.hidden_at IS DISTINCT FROM OLD.hidden_at
           OR NEW.hide_reason IS DISTINCT FROM OLD.hide_reason THEN
            RAISE EXCEPTION '고객사는 별점·본문·전시회명만 수정할 수 있습니다.';
        END IF;
        RETURN NEW;
    END IF;

    -- 통역사: 답글·신고 컬럼만 변경 가능
    IF auth.uid() = OLD.interpreter_id THEN
        IF NEW.exhibition_name IS DISTINCT FROM OLD.exhibition_name
           OR NEW.rating_expertise IS DISTINCT FROM OLD.rating_expertise
           OR NEW.rating_manner IS DISTINCT FROM OLD.rating_manner
           OR NEW.rating_communication IS DISTINCT FROM OLD.rating_communication
           OR NEW.rating_overall IS DISTINCT FROM OLD.rating_overall
           OR NEW.review_text IS DISTINCT FROM OLD.review_text
           OR NEW.is_public IS DISTINCT FROM OLD.is_public
           OR NEW.auto_flagged IS DISTINCT FROM OLD.auto_flagged
           OR NEW.flagged_keywords IS DISTINCT FROM OLD.flagged_keywords
           OR NEW.hidden_by IS DISTINCT FROM OLD.hidden_by
           OR NEW.hidden_at IS DISTINCT FROM OLD.hidden_at
           OR NEW.hide_reason IS DISTINCT FROM OLD.hide_reason THEN
            RAISE EXCEPTION '통역사는 답글과 신고만 수정할 수 있습니다.';
        END IF;
        RETURN NEW;
    END IF;

    -- RLS가 이미 차단하지만 방어적
    RAISE EXCEPTION '리뷰를 수정할 권한이 없습니다.';
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_review_columns ON "49_통역사리뷰";

CREATE TRIGGER trg_protect_review_columns
BEFORE UPDATE ON "49_통역사리뷰"
FOR EACH ROW
EXECUTE FUNCTION protect_review_columns();

-- 검증 시나리오:
-- 1) 고객사가 자기 리뷰의 interpreter_reply 위조 시도 → EXCEPTION
-- 2) 통역사가 자기 리뷰의 rating_overall 위조 시도 → EXCEPTION
-- 3) 고객사가 자기 리뷰 별점 정상 수정 → OK
-- 4) 통역사가 자기 리뷰 답글 정상 작성 → OK
-- 5) admin이 모더레이션 (is_public, hidden_*) 변경 → OK
-- 6) service_role API → OK (트리거 우회)
