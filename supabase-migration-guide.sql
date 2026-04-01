-- ══════════════════════════════════════════════════════════
-- 콘텐츄어 통역 서비스 - Supabase 마이그레이션 SQL
-- 새 Supabase 프로젝트에 이 파일을 실행하면 동일한 DB가 구성됩니다.
--
-- 현재 프로젝트: yvtgfieoeoqhfbofzunk (B2B Matchmaking Program 2)
-- supabase-config.js 연결: jgeqbdrfpekzuumaklvx (통역 서비스 프로젝트)
--
-- 마이그레이션 일시: 2026-04-01
-- ══════════════════════════════════════════════════════════

-- ═══════════════════════
-- 1. ENUM 타입 생성
-- ═══════════════════════

CREATE TYPE user_role AS ENUM ('member', 'admin', 'interpreter', 'customer');
CREATE TYPE notification_type AS ENUM ('system', 'service', 'payment', 'matching', 'settlement', 'chat', 'contract', 'assignment', 'mutual_match', 'rate_change');
CREATE TYPE contract_status AS ENUM ('pending', 'deposit_paid', 'in_progress', 'completed', 'settled', 'cancelled');
CREATE TYPE settlement_status AS ENUM ('request', 'approved', 'paid', 'rejected');
CREATE TYPE consultation_status AS ENUM ('draft', 'submitted', 'reviewed');
CREATE TYPE itq_status AS ENUM ('접수', '검토중', '견적발송', '계약진행', '완료', '취소');

-- ═══════════════════════
-- 2. 테이블 생성
-- ═══════════════════════

-- 01_회원
CREATE TABLE "01_회원" (
    id uuid NOT NULL PRIMARY KEY,
    email text NOT NULL,
    name text NOT NULL,
    phone text,
    role user_role NOT NULL DEFAULT 'member',
    company_id uuid,
    language text DEFAULT 'ko',
    company_verified_at timestamptz,
    profile_image_url text,
    position text DEFAULT '',
    company_name text DEFAULT '',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- 24_알림
CREATE TABLE "24_알림" (
    id uuid NOT NULL DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id uuid NOT NULL,
    notification_type notification_type NOT NULL,
    title text NOT NULL,
    message text,
    link text,
    is_read boolean DEFAULT false,
    read_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
);

-- 40_통역사프로필
CREATE TABLE "40_통역사프로필" (
    id uuid NOT NULL DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id uuid NOT NULL,
    display_name text NOT NULL,
    phone text,
    intro text,
    profile_image_url text,
    languages text[] NOT NULL DEFAULT '{}',
    specialties text[] DEFAULT '{}',
    certifications text[] DEFAULT '{}',
    experience_years integer DEFAULT 0,
    base_rate integer NOT NULL DEFAULT 150000,
    rate_by_type jsonb DEFAULT '{}',
    rate_by_language jsonb DEFAULT '{}',
    is_active boolean DEFAULT true,
    is_verified boolean DEFAULT false,
    verified_at timestamptz,
    verification_docs jsonb DEFAULT '[]',
    verification_note text,
    verified_by uuid,
    pending_rate_by_type jsonb,
    pending_rate_by_language jsonb,
    rate_status text NOT NULL DEFAULT 'approved',
    rate_rejected_reason text,
    rate_submitted_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- 41_계좌정보
CREATE TABLE "41_계좌정보" (
    id uuid NOT NULL DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id uuid NOT NULL,
    bank_name text NOT NULL,
    account_holder text NOT NULL,
    account_number text NOT NULL,
    is_verified boolean DEFAULT false,
    verified_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- 42_통역계약
CREATE TABLE "42_통역계약" (
    id uuid NOT NULL DEFAULT uuid_generate_v4() PRIMARY KEY,
    order_id uuid,
    customer_id uuid,
    interpreter_id uuid,
    exhibition_name text NOT NULL,
    client_company text NOT NULL,
    venue text,
    start_date date NOT NULL,
    end_date date NOT NULL,
    working_days integer NOT NULL DEFAULT 1,
    language_pair text NOT NULL,
    service_type text,
    daily_rate integer NOT NULL,
    total_amount integer NOT NULL,
    tax_amount integer NOT NULL DEFAULT 0,
    net_amount integer NOT NULL,
    deposit_amount integer DEFAULT 0,
    deposit_status text DEFAULT 'pending',
    deposit_paid_at timestamptz,
    balance_amount integer DEFAULT 0,
    balance_status text DEFAULT 'pending',
    balance_paid_at timestamptz,
    status contract_status NOT NULL DEFAULT 'pending',
    settlement_status settlement_status,
    contract_signed boolean DEFAULT false,
    contract_signed_at timestamptz,
    contract_file_url text,
    interpreter_accepted boolean,
    accepted_at timestamptz,
    rejected_at timestamptz,
    reject_reason text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- 43_정산내역
CREATE TABLE "43_정산내역" (
    id uuid NOT NULL DEFAULT uuid_generate_v4() PRIMARY KEY,
    contract_id uuid,
    interpreter_id uuid NOT NULL,
    bank_account_id uuid,
    exhibition_name text NOT NULL,
    client_company text NOT NULL,
    language_pair text NOT NULL,
    start_date date NOT NULL,
    end_date date NOT NULL,
    working_days integer NOT NULL,
    daily_rate integer NOT NULL,
    gross_amount integer NOT NULL,
    tax_amount integer NOT NULL DEFAULT 0,
    net_amount integer NOT NULL,
    platform_fee integer NOT NULL DEFAULT 0,
    client_total integer NOT NULL DEFAULT 0,
    platform_fee_rate numeric NOT NULL DEFAULT 0.10,
    journal_submitted boolean NOT NULL DEFAULT false,
    status settlement_status NOT NULL DEFAULT 'request',
    requested_at timestamptz NOT NULL DEFAULT now(),
    approved_at timestamptz,
    approved_by uuid,
    rejected_at timestamptz,
    rejected_by uuid,
    reject_reason text,
    paid_at timestamptz,
    paid_amount integer,
    payment_reference text,
    paid_bank_name text,
    paid_account_holder text,
    paid_account_number text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- 44_상담일지
CREATE TABLE "44_상담일지" (
    id uuid NOT NULL DEFAULT uuid_generate_v4() PRIMARY KEY,
    contract_id uuid,
    order_id uuid,
    interpreter_id uuid NOT NULL,
    customer_id uuid,
    exhibition_name text NOT NULL,
    consultation_date date NOT NULL,
    buyer_company text,
    buyer_contact text,
    buyer_country text,
    discussion_summary text,
    buyer_interest text,
    follow_up_needed boolean DEFAULT false,
    follow_up_notes text,
    attachments jsonb DEFAULT '[]',
    photos jsonb DEFAULT '[]',
    status consultation_status NOT NULL DEFAULT 'draft',
    submitted_at timestamptz,
    reviewed_at timestamptz,
    reviewed_by uuid,
    review_comment text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- 45_채팅메시지
CREATE TABLE "45_채팅메시지" (
    id uuid NOT NULL DEFAULT uuid_generate_v4() PRIMARY KEY,
    room_id text NOT NULL,
    contract_id uuid,
    sender_id uuid NOT NULL,
    sender_role user_role NOT NULL,
    sender_name text NOT NULL,
    message text NOT NULL,
    message_type text DEFAULT 'text',
    attachments jsonb DEFAULT '[]',
    read_by jsonb DEFAULT '[]',
    created_at timestamptz NOT NULL DEFAULT now()
);

-- 46_ITQ견적문의
CREATE TABLE "46_ITQ견적문의" (
    id uuid NOT NULL DEFAULT uuid_generate_v4() PRIMARY KEY,
    company text NOT NULL,
    contact_name text NOT NULL,
    email text NOT NULL,
    phone text NOT NULL,
    exhibition_name text NOT NULL,
    location text,
    venue text,
    start_date date NOT NULL,
    end_date date NOT NULL,
    language_pair text NOT NULL,
    service_type text NOT NULL,
    headcount integer DEFAULT 1,
    working_hours text,
    keywords text,
    message text NOT NULL,
    consent boolean NOT NULL DEFAULT false,
    status itq_status NOT NULL DEFAULT '접수',
    assigned_admin_id uuid,
    admin_note text,
    quoted_amount integer,
    quoted_at timestamptz,
    quote_id uuid,
    contract_id uuid,
    user_id uuid,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- 47_결제기록
CREATE TABLE "47_결제기록" (
    id uuid NOT NULL DEFAULT uuid_generate_v4() PRIMARY KEY,
    contract_id uuid,
    customer_id uuid,
    payment_type text NOT NULL,
    amount integer NOT NULL,
    method text NOT NULL,
    pg_provider text DEFAULT 'portone',
    pg_tid text,
    merchant_uid text,
    imp_uid text,
    status text NOT NULL DEFAULT 'ready',
    paid_at timestamptz,
    failed_at timestamptz,
    cancelled_at timestamptz,
    cancel_reason text,
    receipt_url text,
    metadata jsonb DEFAULT '{}',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- 48_통역사지원서
CREATE TABLE "48_통역사지원서" (
    id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    name_ko text NOT NULL,
    name_en text,
    email text NOT NULL,
    phone text NOT NULL,
    nationality text,
    birth_date date,
    gender text,
    city text,
    intro text,
    language_pairs jsonb DEFAULT '[]',
    specialties text[] DEFAULT '{}',
    interpretation_types text[] DEFAULT '{}',
    preferred_regions text[] DEFAULT '{}',
    careers jsonb DEFAULT '[]',
    total_experience text,
    certifications jsonb DEFAULT '[]',
    school text,
    major text,
    resume_file_url text,
    resume_file_name text,
    portfolio_url text,
    motivation text,
    status text DEFAULT 'pending',
    reviewed_by uuid,
    reviewed_at timestamptz,
    review_notes text,
    rejection_reason text,
    created_user_id uuid,
    application_number text,
    privacy_consent boolean DEFAULT false,
    privacy_consent_at timestamptz,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- 49_통역사리뷰
CREATE TABLE "49_통역사리뷰" (
    id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    contract_id uuid NOT NULL,
    customer_id uuid NOT NULL,
    interpreter_id uuid NOT NULL,
    exhibition_name text NOT NULL,
    rating_expertise integer NOT NULL,
    rating_manner integer NOT NULL,
    rating_communication integer NOT NULL,
    rating_overall integer NOT NULL,
    review_text text,
    is_public boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- 90_시스템설정
CREATE TABLE "90_시스템설정" (
    key text NOT NULL PRIMARY KEY,
    value jsonb NOT NULL DEFAULT '{}',
    updated_at timestamptz NOT NULL DEFAULT now(),
    updated_by uuid
);

-- 91_단가변경이력
CREATE TABLE "91_단가변경이력" (
    id uuid NOT NULL DEFAULT uuid_generate_v4() PRIMARY KEY,
    interpreter_id uuid NOT NULL,
    interpreter_name text,
    previous_rates jsonb,
    new_rates jsonb,
    previous_lang_rates jsonb,
    new_lang_rates jsonb,
    changed_at timestamptz NOT NULL DEFAULT now(),
    action_type text DEFAULT 'approved',
    actor_id uuid,
    actor_name text,
    reason text
);

-- ═══════════════════════
-- 3. RLS 활성화
-- ═══════════════════════

ALTER TABLE "01_회원" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "24_알림" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "40_통역사프로필" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "41_계좌정보" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "42_통역계약" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "43_정산내역" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "44_상담일지" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "45_채팅메시지" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "46_ITQ견적문의" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "47_결제기록" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "48_통역사지원서" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "49_통역사리뷰" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "90_시스템설정" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "91_단가변경이력" ENABLE ROW LEVEL SECURITY;

-- ═══════════════════════
-- 4. 함수 생성
-- ═══════════════════════

-- is_admin 헬퍼 함수
CREATE OR REPLACE FUNCTION public.is_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM "01_회원"
    WHERE id = auth.uid()
    AND role = 'admin'
  );
$function$;

-- 비밀번호 초기화 함수
CREATE OR REPLACE FUNCTION public.admin_reset_password(target_user_id uuid, new_password text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  UPDATE auth.users
  SET encrypted_password = crypt(new_password, gen_salt('bf')),
      updated_at = NOW()
  WHERE id = target_user_id;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'message', '해당 사용자를 찾을 수 없습니다.');
  END IF;

  RETURN json_build_object('success', true, 'message', '비밀번호가 초기화되었습니다.');
END;
$function$;

-- 이메일 인증 확인 함수
CREATE OR REPLACE FUNCTION public.admin_confirm_user(target_user_id uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  UPDATE auth.users SET
    email_confirmed_at = COALESCE(email_confirmed_at, NOW()),
    confirmation_token = COALESCE(confirmation_token, ''),
    recovery_token = COALESCE(recovery_token, ''),
    email_change = COALESCE(email_change, ''),
    email_change_token_new = COALESCE(email_change_token_new, ''),
    email_change_token_current = COALESCE(email_change_token_current, ''),
    email_change_confirm_status = COALESCE(email_change_confirm_status, 0),
    phone_change = COALESCE(phone_change, ''),
    phone_change_token = COALESCE(phone_change_token, ''),
    reauthentication_token = COALESCE(reauthentication_token, '')
  WHERE id = target_user_id;

  RETURN json_build_object('success', true);
END;
$function$;

-- ═══════════════════════
-- 5. RLS 정책
-- ═══════════════════════

-- 01_회원
CREATE POLICY "관리자 전체" ON "01_회원" FOR ALL USING (is_admin());
CREATE POLICY "본인 프로필 조회" ON "01_회원" FOR SELECT USING (auth.uid() = id);
CREATE POLICY "본인 프로필 수정" ON "01_회원" FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "회원가입 시 삽입" ON "01_회원" FOR INSERT WITH CHECK ((auth.uid() = id) OR (current_setting('role', true) = 'service_role') OR (CURRENT_USER = 'postgres'));

-- 24_알림
CREATE POLICY "관리자 전체" ON "24_알림" FOR ALL USING (is_admin());
CREATE POLICY "본인 알림 조회" ON "24_알림" FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "본인 알림 읽음" ON "24_알림" FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "인증사용자_알림_삽입" ON "24_알림" FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- 40_통역사프로필
CREATE POLICY "통역사_본인프로필_조회" ON "40_통역사프로필" FOR SELECT USING (
  (auth.uid() = user_id) OR (EXISTS (SELECT 1 FROM "01_회원" WHERE "01_회원".id = auth.uid() AND "01_회원".role = 'admin')) OR (is_active = true)
);
CREATE POLICY "통역사_본인프로필_수정" ON "40_통역사프로필" FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "통역사_프로필_생성" ON "40_통역사프로필" FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "프로필_anon_읽기" ON "40_통역사프로필" FOR SELECT TO anon USING (true);

-- 41_계좌정보
CREATE POLICY "계좌_본인_조회" ON "41_계좌정보" FOR SELECT USING (
  (auth.uid() = user_id) OR (EXISTS (SELECT 1 FROM "01_회원" WHERE "01_회원".id = auth.uid() AND "01_회원".role = 'admin'))
);
CREATE POLICY "계좌_본인_생성" ON "41_계좌정보" FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "계좌_본인_수정" ON "41_계좌정보" FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "계좌_본인_삭제" ON "41_계좌정보" FOR DELETE USING (auth.uid() = user_id);

-- 42_통역계약
CREATE POLICY "계약_관련자_조회" ON "42_통역계약" FOR SELECT USING (
  (auth.uid() = customer_id) OR (auth.uid() = interpreter_id) OR (EXISTS (SELECT 1 FROM "01_회원" WHERE "01_회원".id = auth.uid() AND "01_회원".role = 'admin'))
);
CREATE POLICY "계약_생성" ON "42_통역계약" FOR INSERT TO authenticated WITH CHECK ((auth.uid() = customer_id) OR is_admin());
CREATE POLICY "계약_관리자_수정" ON "42_통역계약" FOR UPDATE USING (EXISTS (SELECT 1 FROM "01_회원" WHERE "01_회원".id = auth.uid() AND "01_회원".role = 'admin'));
CREATE POLICY "계약_고객_업데이트" ON "42_통역계약" FOR UPDATE TO authenticated USING (auth.uid() = customer_id) WITH CHECK (auth.uid() = customer_id);
CREATE POLICY "계약_통역사_응답" ON "42_통역계약" FOR UPDATE USING (auth.uid() = interpreter_id) WITH CHECK (auth.uid() = interpreter_id);

-- 43_정산내역
CREATE POLICY "정산_통역사_조회" ON "43_정산내역" FOR SELECT TO authenticated USING ((auth.uid() = interpreter_id) OR is_admin());
CREATE POLICY "정산_생성" ON "43_정산내역" FOR INSERT TO authenticated WITH CHECK ((auth.uid() = interpreter_id) OR is_admin());
CREATE POLICY "정산_관리자_처리" ON "43_정산내역" FOR UPDATE TO authenticated USING ((auth.uid() = interpreter_id) OR is_admin()) WITH CHECK ((auth.uid() = interpreter_id) OR is_admin());

-- 44_상담일지
CREATE POLICY "상담일지_관련자_조회" ON "44_상담일지" FOR SELECT USING (
  (auth.uid() = interpreter_id) OR (auth.uid() = customer_id) OR (EXISTS (SELECT 1 FROM "01_회원" WHERE "01_회원".id = auth.uid() AND "01_회원".role = 'admin'))
);
CREATE POLICY "상담일지_작성" ON "44_상담일지" FOR INSERT WITH CHECK (
  (auth.uid() = interpreter_id) OR (auth.uid() = customer_id) OR (EXISTS (SELECT 1 FROM "01_회원" WHERE "01_회원".id = auth.uid() AND "01_회원".role = 'admin'))
);
CREATE POLICY "상담일지_통역사_수정" ON "44_상담일지" FOR UPDATE USING (
  (auth.uid() = interpreter_id) OR (EXISTS (SELECT 1 FROM "01_회원" WHERE "01_회원".id = auth.uid() AND "01_회원".role = 'admin'))
);

-- 45_채팅메시지
CREATE POLICY "채팅_참여자_조회" ON "45_채팅메시지" FOR SELECT USING (
  (auth.uid() = sender_id) OR
  (EXISTS (SELECT 1 FROM "42_통역계약" c WHERE c.id = "45_채팅메시지".contract_id AND (c.customer_id = auth.uid() OR c.interpreter_id = auth.uid()))) OR
  (EXISTS (SELECT 1 FROM "01_회원" WHERE "01_회원".id = auth.uid() AND "01_회원".role = 'admin'))
);
CREATE POLICY "채팅_메시지_전송" ON "45_채팅메시지" FOR INSERT WITH CHECK (auth.uid() = sender_id);
CREATE POLICY "채팅_읽음_처리" ON "45_채팅메시지" FOR UPDATE USING (
  (EXISTS (SELECT 1 FROM "42_통역계약" c WHERE c.id = "45_채팅메시지".contract_id AND (c.customer_id = auth.uid() OR c.interpreter_id = auth.uid()))) OR
  (EXISTS (SELECT 1 FROM "01_회원" WHERE "01_회원".id = auth.uid() AND "01_회원".role = 'admin'))
);
CREATE POLICY "채팅_본인_메시지_삭제" ON "45_채팅메시지" FOR DELETE USING (sender_id = auth.uid());

-- 46_ITQ견적문의
CREATE POLICY "ITQ_비로그인_문의_접수" ON "46_ITQ견적문의" FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "ITQ_문의_접수" ON "46_ITQ견적문의" FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "ITQ_고객_자기문의_조회" ON "46_ITQ견적문의" FOR SELECT TO authenticated USING (
  (user_id = auth.uid()) OR (EXISTS (SELECT 1 FROM "01_회원" WHERE "01_회원".id = auth.uid() AND "01_회원".role = 'admin'))
);
CREATE POLICY "ITQ_관리자_수정" ON "46_ITQ견적문의" FOR UPDATE USING (
  EXISTS (SELECT 1 FROM "01_회원" WHERE "01_회원".id = auth.uid() AND "01_회원".role = 'admin')
);

-- 47_결제기록
CREATE POLICY "결제_본인_조회" ON "47_결제기록" FOR SELECT USING (
  (customer_id = auth.uid()) OR (EXISTS (SELECT 1 FROM "01_회원" WHERE "01_회원".id = auth.uid() AND "01_회원".role = 'admin'))
);
CREATE POLICY "결제_본인_생성" ON "47_결제기록" FOR INSERT WITH CHECK (customer_id = auth.uid());
CREATE POLICY "결제_관리자_수정" ON "47_결제기록" FOR UPDATE USING (
  (EXISTS (SELECT 1 FROM "01_회원" WHERE "01_회원".id = auth.uid() AND "01_회원".role = 'admin')) OR (customer_id = auth.uid())
);

-- 48_통역사지원서
CREATE POLICY "anyone_can_apply" ON "48_통역사지원서" FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "admin_full_access" ON "48_통역사지원서" FOR ALL TO authenticated USING (
  EXISTS (SELECT 1 FROM "01_회원" WHERE "01_회원".id = auth.uid() AND "01_회원".role = 'admin')
);

-- 49_통역사리뷰
CREATE POLICY "리뷰_조회" ON "49_통역사리뷰" FOR SELECT TO authenticated USING (true);
CREATE POLICY "리뷰_공개_조회" ON "49_통역사리뷰" FOR SELECT TO anon USING (is_public = true);
CREATE POLICY "리뷰_본인_작성" ON "49_통역사리뷰" FOR INSERT TO authenticated WITH CHECK (auth.uid() = customer_id);
CREATE POLICY "리뷰_본인_수정" ON "49_통역사리뷰" FOR UPDATE TO authenticated USING (auth.uid() = customer_id);

-- 90_시스템설정
CREATE POLICY "설정_관리자_조회" ON "90_시스템설정" FOR SELECT USING (
  EXISTS (SELECT 1 FROM "01_회원" WHERE "01_회원".id = auth.uid() AND "01_회원".role = 'admin')
);
CREATE POLICY "설정_관리자_수정" ON "90_시스템설정" FOR UPDATE USING (
  EXISTS (SELECT 1 FROM "01_회원" WHERE "01_회원".id = auth.uid() AND "01_회원".role = 'admin')
);

-- 91_단가변경이력
CREATE POLICY "관리자_단가이력_조회" ON "91_단가변경이력" FOR SELECT USING (is_admin());
CREATE POLICY "본인_단가이력_조회" ON "91_단가변경이력" FOR SELECT USING (auth.uid() = interpreter_id);
CREATE POLICY "본인_단가이력_삽입" ON "91_단가변경이력" FOR INSERT WITH CHECK (auth.uid() = interpreter_id);

-- ═══════════════════════
-- 6. Storage 버킷
-- ═══════════════════════

INSERT INTO storage.buckets (id, name, public) VALUES ('company-logos', 'company-logos', true);
INSERT INTO storage.buckets (id, name, public) VALUES ('interpreter-docs', 'interpreter-docs', false);
INSERT INTO storage.buckets (id, name, public) VALUES ('profile-images', 'profile-images', true);
INSERT INTO storage.buckets (id, name, public) VALUES ('resumes', 'resumes', false);

-- ═══════════════════════
-- 7. service_role 전체 접근 정책
-- ═══════════════════════

CREATE POLICY "service_all" ON "01_회원" FOR ALL TO service_role USING (true);
CREATE POLICY "service_all" ON "40_통역사프로필" FOR ALL TO service_role USING (true);
CREATE POLICY "service_all" ON "41_계좌정보" FOR ALL TO service_role USING (true);
CREATE POLICY "service_all" ON "42_통역계약" FOR ALL TO service_role USING (true);
CREATE POLICY "service_all" ON "43_정산내역" FOR ALL TO service_role USING (true);
CREATE POLICY "service_all" ON "44_상담일지" FOR ALL TO service_role USING (true);
CREATE POLICY "service_all" ON "45_채팅메시지" FOR ALL TO service_role USING (true);
CREATE POLICY "service_all" ON "46_ITQ견적문의" FOR ALL TO service_role USING (true);
CREATE POLICY "service_all" ON "47_결제기록" FOR ALL TO service_role USING (true);
CREATE POLICY "service_all" ON "48_통역사지원서" FOR ALL TO service_role USING (true);
CREATE POLICY "service_all" ON "49_통역사리뷰" FOR ALL TO service_role USING (true);
CREATE POLICY "service_all" ON "90_시스템설정" FOR ALL TO service_role USING (true);
CREATE POLICY "service_all" ON "91_단가변경이력" FOR ALL TO service_role USING (true);

-- ═══════════════════════
-- 8. 초기 계정 생성 (마이그레이션 후 수동)
-- ═══════════════════════

-- ** 새 프로젝트에서 수동으로 처리할 항목 **
-- 1. Supabase Dashboard → Authentication → Users 에서 계정 생성:
--    - 관리자: cosmos@contentour.co.kr (role: admin)
--    - 관리자: hana@contentour.co.kr (role: admin)
--    - 통역사: hana.kim@contentour.co.kr (role: interpreter)
--
-- 2. 계정 생성 후 01_회원 테이블에 INSERT:
--    INSERT INTO "01_회원" (id, email, name, role) VALUES
--    ('<auth_user_id>', 'cosmos@contentour.co.kr', '관리자', 'admin'),
--    ('<auth_user_id>', 'hana@contentour.co.kr', '고하나', 'admin'),
--    ('<auth_user_id>', 'hana.kim@contentour.co.kr', '김하나', 'interpreter');
--
-- 3. supabase-config.js 에서 URL과 ANON KEY를 새 프로젝트 값으로 변경:
--    var SUPABASE_URL = 'https://<새프로젝트ref>.supabase.co';
--    var SUPABASE_ANON_KEY = '<새프로젝트_anon_key>';
--
-- 4. admin-interpreters.html 에서도 Supabase 클라이언트 설정 변경 (라인 1514~1518)

-- ═══════════════════════
-- 마이그레이션 완료
-- ═══════════════════════
