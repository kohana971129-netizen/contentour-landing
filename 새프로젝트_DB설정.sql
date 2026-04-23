-- ══════════════════════════════════════════════════════════════
-- 콘텐츄어 랜딩 - 새 Supabase 프로젝트 DB 설정
-- Supabase 대시보드 → SQL Editor에서 실행하세요
-- ══════════════════════════════════════════════════════════════

-- 1. ENUM 타입 생성
CREATE TYPE user_role AS ENUM ('member', 'admin', 'interpreter', 'customer');
CREATE TYPE contract_status AS ENUM ('pending', 'deposit_paid', 'in_progress', 'completed', 'settled', 'cancelled');
CREATE TYPE settlement_status AS ENUM ('request', 'approved', 'paid', 'rejected');
CREATE TYPE consultation_status AS ENUM ('draft', 'submitted', 'reviewed');
CREATE TYPE itq_status AS ENUM ('접수', '검토중', '견적발송', '계약진행', '완료', '취소');

-- 2. UUID 확장
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ══════════════════════════════════════════════════════════════
-- 3. 테이블 생성
-- ══════════════════════════════════════════════════════════════

-- 01_회원
CREATE TABLE "01_회원" (
  id uuid PRIMARY KEY,
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

-- 40_통역사프로필
CREATE TABLE "40_통역사프로필" (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL REFERENCES "01_회원"(id),
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
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 41_계좌정보
CREATE TABLE "41_계좌정보" (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL REFERENCES "01_회원"(id),
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
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id uuid,
  customer_id uuid REFERENCES "01_회원"(id),
  interpreter_id uuid REFERENCES "01_회원"(id),
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
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  contract_id uuid REFERENCES "42_통역계약"(id),
  interpreter_id uuid NOT NULL REFERENCES "01_회원"(id),
  bank_account_id uuid REFERENCES "41_계좌정보"(id),
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
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  contract_id uuid REFERENCES "42_통역계약"(id),
  order_id uuid,
  interpreter_id uuid NOT NULL REFERENCES "01_회원"(id),
  customer_id uuid REFERENCES "01_회원"(id),
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
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  room_id text NOT NULL,
  contract_id uuid REFERENCES "42_통역계약"(id),
  sender_id uuid NOT NULL REFERENCES "01_회원"(id),
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
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid REFERENCES "01_회원"(id),
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
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 47_결제기록
CREATE TABLE "47_결제기록" (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  contract_id uuid REFERENCES "42_통역계약"(id),
  customer_id uuid REFERENCES "01_회원"(id),
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
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
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
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id uuid NOT NULL REFERENCES "42_통역계약"(id),
  customer_id uuid NOT NULL REFERENCES "01_회원"(id),
  interpreter_id uuid NOT NULL REFERENCES "01_회원"(id),
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
  key text PRIMARY KEY,
  value jsonb NOT NULL DEFAULT '{}',
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

-- ══════════════════════════════════════════════════════════════
-- 4. 신규 회원 자동 생성 트리거
-- ══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public."01_회원" (id, email, name, role, phone)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'name', ''),
    COALESCE(
      NULLIF(NEW.raw_user_meta_data->>'role', '')::user_role,
      'member'::user_role
    ),
    COALESCE(NEW.raw_user_meta_data->>'phone', '')
  )
  ON CONFLICT (id) DO UPDATE SET
    name = COALESCE(NULLIF(public."01_회원".name, ''), EXCLUDED.name),
    role = CASE
      WHEN public."01_회원".role = 'member'::user_role
      THEN EXCLUDED.role
      ELSE public."01_회원".role
    END,
    phone = CASE
      WHEN public."01_회원".phone IS NULL OR public."01_회원".phone = ''
      THEN EXCLUDED.phone
      ELSE public."01_회원".phone
    END;
  RETURN NEW;
END;
$function$;

-- auth.users에 새 사용자 생성 시 자동으로 01_회원에 추가
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ══════════════════════════════════════════════════════════════
-- 5. RLS (Row Level Security) 활성화
-- ══════════════════════════════════════════════════════════════

ALTER TABLE "01_회원" ENABLE ROW LEVEL SECURITY;
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

-- 기본 RLS 정책: 인증된 사용자 읽기 허용
CREATE POLICY "authenticated_read" ON "01_회원" FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated_read" ON "40_통역사프로필" FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated_read" ON "42_통역계약" FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated_read" ON "43_정산내역" FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated_read" ON "44_상담일지" FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated_read" ON "45_채팅메시지" FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated_read" ON "46_ITQ견적문의" FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated_read" ON "47_결제기록" FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated_read" ON "48_통역사지원서" FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated_read" ON "49_통역사리뷰" FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated_read" ON "90_시스템설정" FOR SELECT TO authenticated USING (true);

-- 자기 계좌정보만 읽기
CREATE POLICY "own_read" ON "41_계좌정보" FOR SELECT TO authenticated USING (user_id = auth.uid());

-- 서비스 역할은 모든 작업 허용
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

-- 인증된 사용자 INSERT 허용 (견적문의, 채팅 등)
CREATE POLICY "authenticated_insert" ON "46_ITQ견적문의" FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "authenticated_insert" ON "45_채팅메시지" FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "authenticated_insert" ON "44_상담일지" FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "authenticated_insert" ON "47_결제기록" FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "authenticated_insert" ON "48_통역사지원서" FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "authenticated_insert" ON "49_통역사리뷰" FOR INSERT TO authenticated WITH CHECK (true);

-- anon 사용자도 견적문의 가능 (비로그인 견적 문의)
CREATE POLICY "anon_insert_itq" ON "46_ITQ견적문의" FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "anon_insert_apply" ON "48_통역사지원서" FOR INSERT TO anon WITH CHECK (true);

-- ══════════════════════════════════════════════════════════════
-- 6. 기본 시스템 설정 데이터
-- ══════════════════════════════════════════════════════════════

INSERT INTO "90_시스템설정" (key, value) VALUES
  ('daily_rate', '{"default": 250000}'),
  ('fee_rate', '{"default": 10}'),
  ('payment_mode', '{"default": "deposit_balance"}'),
  ('work_hours', '{"start": "09:00", "end": "18:00"}'),
  ('admin_email', '{"default": "cosmos@contentour.co.kr"}'),
  ('site_name', '{"default": "콘텐츄어"}'),
  ('currency', '{"default": "KRW"}'),
  ('tax_rate', '{"default": 10}'),
  ('deposit_rate', '{"default": 10}'),
  ('cancellation_policy', '{"free_days": 7}'),
  ('notification_email', '{"enabled": true}'),
  ('notification_sms', '{"enabled": false}'),
  ('maintenance_mode', '{"enabled": false}');
