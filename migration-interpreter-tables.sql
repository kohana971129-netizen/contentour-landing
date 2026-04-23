-- =====================================================
-- 콘텐츄어 통역사 관련 테이블 마이그레이션
-- 원본: yvtgfieoeoqhfbofzunk → 대상: jgeqbdrfpekzuumaklvx
-- 생성일: 2026-04-03
-- =====================================================

-- ══════════════ 1. ENUM 타입 생성 ══════════════
DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('member','admin','interpreter','customer');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE contract_status AS ENUM ('pending','deposit_paid','in_progress','completed','settled','cancelled');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE settlement_status AS ENUM ('request','approved','paid','rejected');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE consultation_status AS ENUM ('draft','submitted','reviewed');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE itq_status AS ENUM ('접수','검토중','견적발송','계약진행','완료','취소');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE service_status AS ENUM ('상담중','상담완료','견적진행','진행중','완료','취소');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ══════════════ 2. uuid-ossp 확장 ══════════════
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ══════════════ 3. 테이블 생성 ══════════════

-- 01_회원
CREATE TABLE IF NOT EXISTS "01_회원" (
  "id" uuid NOT NULL,
  "email" text NOT NULL,
  "name" text NOT NULL,
  "phone" text,
  "role" user_role NOT NULL DEFAULT 'member'::user_role,
  "company_id" uuid,
  "language" text DEFAULT 'ko'::text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "company_verified_at" timestamptz,
  "profile_image_url" text,
  "position" text DEFAULT ''::text,
  "company_name" text DEFAULT ''::text,
  PRIMARY KEY ("id")
);

-- 40_통역사프로필
CREATE TABLE IF NOT EXISTS "40_통역사프로필" (
  "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
  "user_id" uuid NOT NULL,
  "display_name" text NOT NULL,
  "phone" text,
  "intro" text,
  "profile_image_url" text,
  "languages" text[] NOT NULL DEFAULT '{}'::text[],
  "specialties" text[] DEFAULT '{}'::text[],
  "certifications" text[] DEFAULT '{}'::text[],
  "experience_years" integer DEFAULT 0,
  "base_rate" integer NOT NULL DEFAULT 150000,
  "rate_by_type" jsonb DEFAULT '{}'::jsonb,
  "rate_by_language" jsonb DEFAULT '{}'::jsonb,
  "is_active" boolean DEFAULT true,
  "is_verified" boolean DEFAULT false,
  "verified_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "verification_docs" jsonb DEFAULT '[]'::jsonb,
  "verification_note" text,
  "verified_by" uuid,
  "pending_rate_by_type" jsonb,
  "pending_rate_by_language" jsonb,
  "rate_status" text NOT NULL DEFAULT 'approved'::text,
  "rate_rejected_reason" text,
  "rate_submitted_at" timestamptz,
  "penalty_count" integer NOT NULL DEFAULT 0,
  "is_suspended" boolean NOT NULL DEFAULT false,
  "suspended_until" timestamptz,
  "country_code" text,
  "field_tag" text,
  "cases_count" integer DEFAULT 0,
  "rating" numeric DEFAULT 0.0,
  "satisfaction" integer DEFAULT 0,
  PRIMARY KEY ("id"),
  UNIQUE ("user_id")
);

-- 41_계좌정보
CREATE TABLE IF NOT EXISTS "41_계좌정보" (
  "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
  "user_id" uuid NOT NULL,
  "bank_name" text NOT NULL,
  "account_holder" text NOT NULL,
  "account_number" text NOT NULL,
  "is_verified" boolean DEFAULT false,
  "verified_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY ("id"),
  UNIQUE ("user_id")
);

-- 42_통역계약
CREATE TABLE IF NOT EXISTS "42_통역계약" (
  "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
  "order_id" uuid,
  "customer_id" uuid,
  "interpreter_id" uuid,
  "exhibition_name" text NOT NULL,
  "client_company" text NOT NULL,
  "venue" text,
  "start_date" date NOT NULL,
  "end_date" date NOT NULL,
  "working_days" integer NOT NULL DEFAULT 1,
  "language_pair" text NOT NULL,
  "service_type" text,
  "daily_rate" integer NOT NULL,
  "total_amount" integer NOT NULL,
  "tax_amount" integer NOT NULL DEFAULT 0,
  "net_amount" integer NOT NULL,
  "deposit_amount" integer DEFAULT 0,
  "deposit_status" text DEFAULT 'pending'::text,
  "deposit_paid_at" timestamptz,
  "balance_amount" integer DEFAULT 0,
  "balance_status" text DEFAULT 'pending'::text,
  "balance_paid_at" timestamptz,
  "status" contract_status NOT NULL DEFAULT 'pending'::contract_status,
  "settlement_status" settlement_status,
  "contract_signed" boolean DEFAULT false,
  "contract_signed_at" timestamptz,
  "contract_file_url" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "interpreter_accepted" boolean,
  "accepted_at" timestamptz,
  "rejected_at" timestamptz,
  "reject_reason" text,
  "cancelled_by" text,
  "cancel_reason" text,
  "cancelled_at" timestamptz,
  PRIMARY KEY ("id")
);

-- 43_정산내역
CREATE TABLE IF NOT EXISTS "43_정산내역" (
  "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
  "contract_id" uuid,
  "interpreter_id" uuid NOT NULL,
  "bank_account_id" uuid,
  "exhibition_name" text NOT NULL,
  "client_company" text NOT NULL,
  "language_pair" text NOT NULL,
  "start_date" date NOT NULL,
  "end_date" date NOT NULL,
  "working_days" integer NOT NULL,
  "daily_rate" integer NOT NULL,
  "gross_amount" integer NOT NULL,
  "tax_amount" integer NOT NULL DEFAULT 0,
  "net_amount" integer NOT NULL,
  "status" settlement_status NOT NULL DEFAULT 'request'::settlement_status,
  "requested_at" timestamptz NOT NULL DEFAULT now(),
  "approved_at" timestamptz,
  "approved_by" uuid,
  "rejected_at" timestamptz,
  "rejected_by" uuid,
  "reject_reason" text,
  "paid_at" timestamptz,
  "paid_amount" integer,
  "payment_reference" text,
  "paid_bank_name" text,
  "paid_account_holder" text,
  "paid_account_number" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "platform_fee" integer NOT NULL DEFAULT 0,
  "client_total" integer NOT NULL DEFAULT 0,
  "platform_fee_rate" numeric NOT NULL DEFAULT 0.10,
  "journal_submitted" boolean NOT NULL DEFAULT false,
  PRIMARY KEY ("id")
);

-- 44_상담일지
CREATE TABLE IF NOT EXISTS "44_상담일지" (
  "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
  "contract_id" uuid,
  "order_id" uuid,
  "interpreter_id" uuid NOT NULL,
  "customer_id" uuid,
  "exhibition_name" text NOT NULL,
  "consultation_date" date NOT NULL,
  "buyer_company" text,
  "buyer_contact" text,
  "buyer_country" text,
  "discussion_summary" text,
  "buyer_interest" text,
  "follow_up_needed" boolean DEFAULT false,
  "follow_up_notes" text,
  "attachments" jsonb DEFAULT '[]'::jsonb,
  "photos" jsonb DEFAULT '[]'::jsonb,
  "status" consultation_status NOT NULL DEFAULT 'draft'::consultation_status,
  "submitted_at" timestamptz,
  "reviewed_at" timestamptz,
  "reviewed_by" uuid,
  "review_comment" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY ("id")
);

-- 45_채팅메시지
CREATE TABLE IF NOT EXISTS "45_채팅메시지" (
  "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
  "room_id" text NOT NULL,
  "contract_id" uuid,
  "sender_id" uuid NOT NULL,
  "sender_role" user_role NOT NULL,
  "sender_name" text NOT NULL,
  "message" text NOT NULL,
  "message_type" text DEFAULT 'text'::text,
  "attachments" jsonb DEFAULT '[]'::jsonb,
  "read_by" jsonb DEFAULT '[]'::jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY ("id")
);

-- 46_ITQ견적문의
CREATE TABLE IF NOT EXISTS "46_ITQ견적문의" (
  "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
  "company" text NOT NULL,
  "contact_name" text NOT NULL,
  "email" text NOT NULL,
  "phone" text NOT NULL,
  "exhibition_name" text NOT NULL,
  "location" text,
  "venue" text,
  "start_date" date NOT NULL,
  "end_date" date NOT NULL,
  "language_pair" text NOT NULL,
  "service_type" text NOT NULL,
  "headcount" integer DEFAULT 1,
  "working_hours" text,
  "keywords" text,
  "message" text NOT NULL,
  "consent" boolean NOT NULL DEFAULT false,
  "status" itq_status NOT NULL DEFAULT '접수'::itq_status,
  "assigned_admin_id" uuid,
  "admin_note" text,
  "quoted_amount" integer,
  "quoted_at" timestamptz,
  "quote_id" uuid,
  "contract_id" uuid,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "user_id" uuid,
  PRIMARY KEY ("id")
);

-- 47_결제기록
CREATE TABLE IF NOT EXISTS "47_결제기록" (
  "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
  "contract_id" uuid,
  "customer_id" uuid,
  "payment_type" text NOT NULL,
  "amount" integer NOT NULL,
  "method" text NOT NULL,
  "pg_provider" text DEFAULT 'portone'::text,
  "pg_tid" text,
  "merchant_uid" text,
  "imp_uid" text,
  "status" text NOT NULL DEFAULT 'ready'::text,
  "paid_at" timestamptz,
  "failed_at" timestamptz,
  "cancelled_at" timestamptz,
  "cancel_reason" text,
  "receipt_url" text,
  "metadata" jsonb DEFAULT '{}'::jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY ("id"),
  UNIQUE ("merchant_uid")
);

-- 48_통역사지원서
CREATE TABLE IF NOT EXISTS "48_통역사지원서" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "name_ko" text NOT NULL,
  "name_en" text,
  "email" text NOT NULL,
  "phone" text NOT NULL,
  "nationality" text,
  "birth_date" date,
  "gender" text,
  "city" text,
  "intro" text,
  "language_pairs" jsonb DEFAULT '[]'::jsonb,
  "specialties" text[] DEFAULT '{}'::text[],
  "interpretation_types" text[] DEFAULT '{}'::text[],
  "preferred_regions" text[] DEFAULT '{}'::text[],
  "careers" jsonb DEFAULT '[]'::jsonb,
  "total_experience" text,
  "certifications" jsonb DEFAULT '[]'::jsonb,
  "school" text,
  "major" text,
  "resume_file_url" text,
  "resume_file_name" text,
  "portfolio_url" text,
  "motivation" text,
  "status" text DEFAULT 'pending'::text,
  "reviewed_by" uuid,
  "reviewed_at" timestamptz,
  "review_notes" text,
  "rejection_reason" text,
  "created_user_id" uuid,
  "application_number" text,
  "privacy_consent" boolean DEFAULT false,
  "privacy_consent_at" timestamptz,
  "created_at" timestamptz DEFAULT now(),
  "updated_at" timestamptz DEFAULT now(),
  PRIMARY KEY ("id")
);

-- 49_통역사리뷰
CREATE TABLE IF NOT EXISTS "49_통역사리뷰" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "contract_id" uuid NOT NULL,
  "customer_id" uuid NOT NULL,
  "interpreter_id" uuid NOT NULL,
  "exhibition_name" text NOT NULL,
  "rating_expertise" integer NOT NULL,
  "rating_manner" integer NOT NULL,
  "rating_communication" integer NOT NULL,
  "rating_overall" integer NOT NULL,
  "review_text" text,
  "is_public" boolean NOT NULL DEFAULT true,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY ("id"),
  UNIQUE ("contract_id", "customer_id")
);

-- 50_감사로그
CREATE TABLE IF NOT EXISTS "50_감사로그" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "user_id" uuid,
  "action" varchar(100) NOT NULL,
  "target_table" varchar(100),
  "target_id" text,
  "details" jsonb DEFAULT '{}'::jsonb,
  "ip_address" text,
  "created_at" timestamptz DEFAULT now(),
  PRIMARY KEY ("id")
);

-- 50_위약금정책
CREATE TABLE IF NOT EXISTS "50_위약금정책" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "cancel_type" text NOT NULL,
  "min_days" integer NOT NULL,
  "max_days" integer NOT NULL,
  "penalty_rate" integer NOT NULL DEFAULT 0,
  "penalty_base" text NOT NULL DEFAULT 'deposit'::text,
  "interpreter_action" text,
  "description" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY ("id")
);

-- 51_주문상태이력
CREATE TABLE IF NOT EXISTS "51_주문상태이력" (
  "history_id" uuid NOT NULL DEFAULT uuid_generate_v4(),
  "order_id" uuid NOT NULL,
  "prev_status" service_status,
  "new_status" service_status NOT NULL,
  "changed_by" uuid,
  "changed_at" timestamptz NOT NULL DEFAULT now(),
  "note" text,
  PRIMARY KEY ("history_id")
);

-- 51_취소내역
CREATE TABLE IF NOT EXISTS "51_취소내역" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "contract_id" uuid NOT NULL,
  "cancelled_by" text NOT NULL,
  "cancelled_user_id" uuid,
  "cancel_reason" text NOT NULL,
  "cancel_date" timestamptz NOT NULL DEFAULT now(),
  "exhibition_start" date NOT NULL,
  "days_remaining" integer NOT NULL,
  "applied_policy_id" uuid,
  "penalty_rate" integer NOT NULL DEFAULT 0,
  "penalty_amount" integer NOT NULL DEFAULT 0,
  "refund_amount" integer NOT NULL DEFAULT 0,
  "status" text NOT NULL DEFAULT 'pending'::text,
  "admin_note" text,
  "replacement_interpreter_id" uuid,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY ("id")
);

-- 52_성과사례
CREATE TABLE IF NOT EXISTS "52_성과사례" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "title" text NOT NULL,
  "client_company" text NOT NULL,
  "exhibition_name" text NOT NULL,
  "country" text NOT NULL,
  "country_flag" text NOT NULL DEFAULT '🌐'::text,
  "exhibition_date" text NOT NULL,
  "case_type" text NOT NULL DEFAULT '부스 통역'::text,
  "interpreter_name" text,
  "interpreter_id" uuid,
  "industry" text,
  "image_url" text,
  "link_url" text,
  "metric1_label" text DEFAULT '상담 통역'::text,
  "metric1_value" text,
  "metric2_label" text DEFAULT '상담액'::text,
  "metric2_value" text,
  "metric3_label" text,
  "metric3_value" text,
  "is_published" boolean NOT NULL DEFAULT true,
  "sort_order" integer NOT NULL DEFAULT 0,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "description" text,
  "photos" jsonb DEFAULT '[]'::jsonb,
  "manager_name" text,
  "manager_role" text,
  "interpreter_photo" text,
  "interpreter_comment" text,
  "work_summary" text,
  PRIMARY KEY ("id")
);

-- 90_시스템설정
CREATE TABLE IF NOT EXISTS "90_시스템설정" (
  "key" text NOT NULL,
  "value" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "updated_by" uuid,
  PRIMARY KEY ("key")
);

-- 91_단가변경이력
CREATE TABLE IF NOT EXISTS "91_단가변경이력" (
  "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
  "interpreter_id" uuid NOT NULL,
  "interpreter_name" text,
  "previous_rates" jsonb,
  "new_rates" jsonb,
  "previous_lang_rates" jsonb,
  "new_lang_rates" jsonb,
  "changed_at" timestamptz NOT NULL DEFAULT now(),
  "action_type" text DEFAULT 'approved'::text,
  "actor_id" uuid,
  "actor_name" text,
  "reason" text,
  PRIMARY KEY ("id")
);

-- ══════════════ 4. Foreign Key 제약조건 ══════════════
ALTER TABLE "01_회원" ADD CONSTRAINT "users_id_fkey" FOREIGN KEY ("id") REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE "40_통역사프로필" ADD CONSTRAINT "40_통역사프로필_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "01_회원"(id);
ALTER TABLE "40_통역사프로필" ADD CONSTRAINT "40_통역사프로필_verified_by_fkey" FOREIGN KEY ("verified_by") REFERENCES "01_회원"(id);
ALTER TABLE "41_계좌정보" ADD CONSTRAINT "41_계좌정보_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "01_회원"(id);
ALTER TABLE "42_통역계약" ADD CONSTRAINT "42_통역계약_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "01_회원"(id);
ALTER TABLE "42_통역계약" ADD CONSTRAINT "42_통역계약_interpreter_id_fkey" FOREIGN KEY ("interpreter_id") REFERENCES "01_회원"(id);
ALTER TABLE "43_정산내역" ADD CONSTRAINT "43_정산내역_interpreter_id_fkey" FOREIGN KEY ("interpreter_id") REFERENCES "01_회원"(id);
ALTER TABLE "43_정산내역" ADD CONSTRAINT "43_정산내역_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "42_통역계약"(id);
ALTER TABLE "43_정산내역" ADD CONSTRAINT "43_정산내역_bank_account_id_fkey" FOREIGN KEY ("bank_account_id") REFERENCES "41_계좌정보"(id);
ALTER TABLE "43_정산내역" ADD CONSTRAINT "43_정산내역_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "01_회원"(id);
ALTER TABLE "43_정산내역" ADD CONSTRAINT "43_정산내역_rejected_by_fkey" FOREIGN KEY ("rejected_by") REFERENCES "01_회원"(id);
ALTER TABLE "44_상담일지" ADD CONSTRAINT "44_상담일지_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "42_통역계약"(id);
ALTER TABLE "44_상담일지" ADD CONSTRAINT "44_상담일지_interpreter_id_fkey" FOREIGN KEY ("interpreter_id") REFERENCES "01_회원"(id);
ALTER TABLE "44_상담일지" ADD CONSTRAINT "44_상담일지_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "01_회원"(id);
ALTER TABLE "44_상담일지" ADD CONSTRAINT "44_상담일지_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "01_회원"(id);
ALTER TABLE "45_채팅메시지" ADD CONSTRAINT "45_채팅메시지_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "42_통역계약"(id);
ALTER TABLE "45_채팅메시지" ADD CONSTRAINT "45_채팅메시지_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "01_회원"(id);
ALTER TABLE "46_ITQ견적문의" ADD CONSTRAINT "46_ITQ견적문의_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "01_회원"(id);
ALTER TABLE "46_ITQ견적문의" ADD CONSTRAINT "46_ITQ견적문의_assigned_admin_id_fkey" FOREIGN KEY ("assigned_admin_id") REFERENCES "01_회원"(id);
ALTER TABLE "46_ITQ견적문의" ADD CONSTRAINT "46_ITQ견적문의_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "42_통역계약"(id);
ALTER TABLE "47_결제기록" ADD CONSTRAINT "47_결제기록_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "42_통역계약"(id);
ALTER TABLE "47_결제기록" ADD CONSTRAINT "47_결제기록_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "01_회원"(id);
ALTER TABLE "48_통역사지원서" ADD CONSTRAINT "48_통역사지원서_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "01_회원"(id);
ALTER TABLE "48_통역사지원서" ADD CONSTRAINT "48_통역사지원서_created_user_id_fkey" FOREIGN KEY ("created_user_id") REFERENCES "01_회원"(id);
ALTER TABLE "49_통역사리뷰" ADD CONSTRAINT "49_통역사리뷰_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "42_통역계약"(id);
ALTER TABLE "49_통역사리뷰" ADD CONSTRAINT "49_통역사리뷰_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "01_회원"(id);
ALTER TABLE "49_통역사리뷰" ADD CONSTRAINT "49_통역사리뷰_interpreter_id_fkey" FOREIGN KEY ("interpreter_id") REFERENCES "01_회원"(id);
ALTER TABLE "50_감사로그" ADD CONSTRAINT "50_감사로그_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "01_회원"(id);
ALTER TABLE "51_취소내역" ADD CONSTRAINT "51_취소내역_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "42_통역계약"(id);
ALTER TABLE "51_취소내역" ADD CONSTRAINT "51_취소내역_cancelled_user_id_fkey" FOREIGN KEY ("cancelled_user_id") REFERENCES "01_회원"(id);
ALTER TABLE "51_취소내역" ADD CONSTRAINT "51_취소내역_applied_policy_id_fkey" FOREIGN KEY ("applied_policy_id") REFERENCES "50_위약금정책"(id);
ALTER TABLE "51_취소내역" ADD CONSTRAINT "51_취소내역_replacement_interpreter_id_fkey" FOREIGN KEY ("replacement_interpreter_id") REFERENCES "01_회원"(id);
ALTER TABLE "52_성과사례" ADD CONSTRAINT "52_성과사례_interpreter_id_fkey" FOREIGN KEY ("interpreter_id") REFERENCES "01_회원"(id);
ALTER TABLE "90_시스템설정" ADD CONSTRAINT "90_시스템설정_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "01_회원"(id);
ALTER TABLE "91_단가변경이력" ADD CONSTRAINT "91_단가변경이력_interpreter_id_fkey" FOREIGN KEY ("interpreter_id") REFERENCES "01_회원"(id);

-- ══════════════ 5. is_admin() 함수 ══════════════
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

-- ══════════════ 6. RLS 활성화 ══════════════
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
ALTER TABLE "50_감사로그" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "50_위약금정책" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "51_주문상태이력" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "51_취소내역" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "52_성과사례" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "90_시스템설정" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "91_단가변경이력" ENABLE ROW LEVEL SECURITY;

-- ══════════════ 7. RLS 정책 ══════════════

-- 01_회원 정책
CREATE POLICY "관리자 전체" ON "01_회원" FOR ALL TO public USING (is_admin());
CREATE POLICY "본인 프로필 조회" ON "01_회원" FOR SELECT TO public USING (auth.uid() = id);
CREATE POLICY "본인 프로필 수정" ON "01_회원" FOR UPDATE TO public USING (auth.uid() = id);
CREATE POLICY "회원가입 시 삽입" ON "01_회원" FOR INSERT TO public WITH CHECK ((auth.uid() = id) OR (current_setting('role'::text, true) = 'service_role'::text) OR (CURRENT_USER = 'postgres'::name));
CREATE POLICY "리뷰_작성자_공개조회" ON "01_회원" FOR SELECT TO anon, authenticated USING (id IN (SELECT customer_id FROM "49_통역사리뷰" WHERE is_public = true));

-- 40_통역사프로필 정책
CREATE POLICY "통역사_본인프로필_조회" ON "40_통역사프로필" FOR SELECT TO public USING ((auth.uid() = user_id) OR (EXISTS (SELECT 1 FROM "01_회원" WHERE "01_회원".id = auth.uid() AND "01_회원".role = 'admin'::user_role)) OR (is_active = true));
CREATE POLICY "통역사_본인프로필_수정" ON "40_통역사프로필" FOR UPDATE TO public USING (auth.uid() = user_id);
CREATE POLICY "통역사_프로필_생성" ON "40_통역사프로필" FOR INSERT TO public WITH CHECK (auth.uid() = user_id);
CREATE POLICY "프로필_anon_읽기" ON "40_통역사프로필" FOR SELECT TO anon USING (true);

-- 41_계좌정보 정책
CREATE POLICY "계좌_본인_조회" ON "41_계좌정보" FOR SELECT TO public USING ((auth.uid() = user_id) OR (EXISTS (SELECT 1 FROM "01_회원" WHERE "01_회원".id = auth.uid() AND "01_회원".role = 'admin'::user_role)));
CREATE POLICY "계좌_본인_생성" ON "41_계좌정보" FOR INSERT TO public WITH CHECK (auth.uid() = user_id);
CREATE POLICY "계좌_본인_수정" ON "41_계좌정보" FOR UPDATE TO public USING (auth.uid() = user_id);
CREATE POLICY "계좌_본인_삭제" ON "41_계좌정보" FOR DELETE TO public USING (auth.uid() = user_id);

-- 42_통역계약 정책
CREATE POLICY "계약_관련자_조회" ON "42_통역계약" FOR SELECT TO public USING ((auth.uid() = customer_id) OR (auth.uid() = interpreter_id) OR (EXISTS (SELECT 1 FROM "01_회원" WHERE "01_회원".id = auth.uid() AND "01_회원".role = 'admin'::user_role)));
CREATE POLICY "계약_생성" ON "42_통역계약" FOR INSERT TO authenticated WITH CHECK ((auth.uid() = customer_id) OR is_admin());
CREATE POLICY "계약_관리자_수정" ON "42_통역계약" FOR UPDATE TO public USING (EXISTS (SELECT 1 FROM "01_회원" WHERE "01_회원".id = auth.uid() AND "01_회원".role = 'admin'::user_role));
CREATE POLICY "계약_고객_업데이트" ON "42_통역계약" FOR UPDATE TO authenticated USING (auth.uid() = customer_id) WITH CHECK (auth.uid() = customer_id);
CREATE POLICY "계약_통역사_응답" ON "42_통역계약" FOR UPDATE TO public USING (auth.uid() = interpreter_id) WITH CHECK (auth.uid() = interpreter_id);

-- 43_정산내역 정책
CREATE POLICY "정산_통역사_조회" ON "43_정산내역" FOR SELECT TO authenticated USING ((auth.uid() = interpreter_id) OR is_admin());
CREATE POLICY "정산_생성" ON "43_정산내역" FOR INSERT TO authenticated WITH CHECK ((auth.uid() = interpreter_id) OR is_admin());
CREATE POLICY "정산_관리자_처리" ON "43_정산내역" FOR UPDATE TO authenticated USING ((auth.uid() = interpreter_id) OR is_admin()) WITH CHECK ((auth.uid() = interpreter_id) OR is_admin());

-- 44_상담일지 정책
CREATE POLICY "상담일지_관련자_조회" ON "44_상담일지" FOR SELECT TO public USING ((auth.uid() = interpreter_id) OR (auth.uid() = customer_id) OR (EXISTS (SELECT 1 FROM "01_회원" WHERE "01_회원".id = auth.uid() AND "01_회원".role = 'admin'::user_role)));
CREATE POLICY "상담일지_작성" ON "44_상담일지" FOR INSERT TO public WITH CHECK ((auth.uid() = interpreter_id) OR (auth.uid() = customer_id) OR (EXISTS (SELECT 1 FROM "01_회원" WHERE "01_회원".id = auth.uid() AND "01_회원".role = 'admin'::user_role)));
CREATE POLICY "상담일지_통역사_수정" ON "44_상담일지" FOR UPDATE TO public USING ((auth.uid() = interpreter_id) OR (EXISTS (SELECT 1 FROM "01_회원" WHERE "01_회원".id = auth.uid() AND "01_회원".role = 'admin'::user_role)));

-- 45_채팅메시지 정책
CREATE POLICY "채팅_참여자_조회" ON "45_채팅메시지" FOR SELECT TO public USING ((auth.uid() = sender_id) OR (EXISTS (SELECT 1 FROM "42_통역계약" c WHERE c.id = "45_채팅메시지".contract_id AND (c.customer_id = auth.uid() OR c.interpreter_id = auth.uid()))) OR (EXISTS (SELECT 1 FROM "01_회원" WHERE "01_회원".id = auth.uid() AND "01_회원".role = 'admin'::user_role)));
CREATE POLICY "채팅_메시지_전송" ON "45_채팅메시지" FOR INSERT TO public WITH CHECK (auth.uid() = sender_id);
CREATE POLICY "채팅_읽음_처리" ON "45_채팅메시지" FOR UPDATE TO public USING ((EXISTS (SELECT 1 FROM "42_통역계약" c WHERE c.id = "45_채팅메시지".contract_id AND (c.customer_id = auth.uid() OR c.interpreter_id = auth.uid()))) OR (EXISTS (SELECT 1 FROM "01_회원" WHERE "01_회원".id = auth.uid() AND "01_회원".role = 'admin'::user_role)));
CREATE POLICY "채팅_본인_메시지_삭제" ON "45_채팅메시지" FOR DELETE TO public USING (sender_id = auth.uid());

-- 46_ITQ견적문의 정책
CREATE POLICY "ITQ_고객_자기문의_조회" ON "46_ITQ견적문의" FOR SELECT TO authenticated USING ((user_id = auth.uid()) OR (EXISTS (SELECT 1 FROM "01_회원" WHERE "01_회원".id = auth.uid() AND "01_회원".role = 'admin'::user_role)));
CREATE POLICY "ITQ_문의_접수" ON "46_ITQ견적문의" FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "ITQ_비로그인_문의_접수" ON "46_ITQ견적문의" FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "ITQ_관리자_수정" ON "46_ITQ견적문의" FOR UPDATE TO public USING (EXISTS (SELECT 1 FROM "01_회원" WHERE "01_회원".id = auth.uid() AND "01_회원".role = 'admin'::user_role));

-- 47_결제기록 정책
CREATE POLICY "결제_본인_조회" ON "47_결제기록" FOR SELECT TO public USING ((customer_id = auth.uid()) OR (EXISTS (SELECT 1 FROM "01_회원" WHERE "01_회원".id = auth.uid() AND "01_회원".role = 'admin'::user_role)));
CREATE POLICY "결제_본인_생성" ON "47_결제기록" FOR INSERT TO public WITH CHECK (customer_id = auth.uid());
CREATE POLICY "결제_관리자_수정" ON "47_결제기록" FOR UPDATE TO public USING ((EXISTS (SELECT 1 FROM "01_회원" WHERE "01_회원".id = auth.uid() AND "01_회원".role = 'admin'::user_role)) OR (customer_id = auth.uid()));

-- 48_통역사지원서 정책
CREATE POLICY "anyone_can_apply" ON "48_통역사지원서" FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "admin_full_access" ON "48_통역사지원서" FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM "01_회원" WHERE "01_회원".id = auth.uid() AND "01_회원".role = 'admin'::user_role));
CREATE POLICY "anon_read_own_application" ON "48_통역사지원서" FOR SELECT TO anon USING ((email = ((current_setting('request.headers'::text, true))::json ->> 'x-forwarded-email'::text)) OR (true = false));

-- 49_통역사리뷰 정책
CREATE POLICY "리뷰_조회" ON "49_통역사리뷰" FOR SELECT TO authenticated USING (true);
CREATE POLICY "리뷰_공개_조회" ON "49_통역사리뷰" FOR SELECT TO anon USING (is_public = true);
CREATE POLICY "리뷰_본인_작성" ON "49_통역사리뷰" FOR INSERT TO authenticated WITH CHECK (auth.uid() = customer_id);
CREATE POLICY "리뷰_본인_수정" ON "49_통역사리뷰" FOR UPDATE TO authenticated USING (auth.uid() = customer_id);

-- 50_감사로그 정책
CREATE POLICY "감사로그_관리자_조회" ON "50_감사로그" FOR SELECT TO authenticated USING (is_admin());
CREATE POLICY "감사로그_생성" ON "50_감사로그" FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- 50_위약금정책 정책
CREATE POLICY "위약금정책_공개조회" ON "50_위약금정책" FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "위약금정책_관리자수정" ON "50_위약금정책" FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());

-- 51_주문상태이력 정책
CREATE POLICY "관리자 전체" ON "51_주문상태이력" FOR ALL TO public USING (is_admin());

-- 51_취소내역 정책
CREATE POLICY "취소내역_관리자전체" ON "51_취소내역" FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "취소내역_본인작성" ON "51_취소내역" FOR INSERT TO authenticated WITH CHECK (cancelled_user_id = auth.uid());
CREATE POLICY "취소내역_본인조회" ON "51_취소내역" FOR SELECT TO authenticated USING ((cancelled_user_id = auth.uid()) OR (contract_id IN (SELECT id FROM "42_통역계약" WHERE customer_id = auth.uid() OR interpreter_id = auth.uid())));

-- 52_성과사례 정책
CREATE POLICY "성과사례_공개조회" ON "52_성과사례" FOR SELECT TO anon, authenticated USING (is_published = true);
CREATE POLICY "성과사례_관리자전체" ON "52_성과사례" FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());

-- 90_시스템설정 정책
CREATE POLICY "설정_관리자_조회" ON "90_시스템설정" FOR SELECT TO public USING (EXISTS (SELECT 1 FROM "01_회원" WHERE "01_회원".id = auth.uid() AND "01_회원".role = 'admin'::user_role));
CREATE POLICY "설정_관리자_수정" ON "90_시스템설정" FOR UPDATE TO public USING (EXISTS (SELECT 1 FROM "01_회원" WHERE "01_회원".id = auth.uid() AND "01_회원".role = 'admin'::user_role));
CREATE POLICY "설정_관리자_삽입" ON "90_시스템설정" FOR INSERT TO public WITH CHECK (EXISTS (SELECT 1 FROM "01_회원" WHERE "01_회원".id = auth.uid() AND "01_회원".role = 'admin'::user_role));

-- 91_단가변경이력 정책
CREATE POLICY "관리자_단가이력_조회" ON "91_단가변경이력" FOR SELECT TO public USING (is_admin());
CREATE POLICY "본인_단가이력_조회" ON "91_단가변경이력" FOR SELECT TO public USING (auth.uid() = interpreter_id);
CREATE POLICY "본인_단가이력_삽입" ON "91_단가변경이력" FOR INSERT TO public WITH CHECK (auth.uid() = interpreter_id);

-- ══════════════ 8. 뷰 생성 ══════════════
CREATE OR REPLACE VIEW v_interpreter_ratings AS
SELECT r.interpreter_id,
    m.name AS interpreter_name,
    p.display_name,
    p.languages,
    p.specialties,
    p.profile_image_url,
    p.intro,
    p.experience_years,
    count(r.id) AS review_count,
    round(avg(r.rating_expertise), 1) AS avg_expertise,
    round(avg(r.rating_manner), 1) AS avg_manner,
    round(avg(r.rating_communication), 1) AS avg_communication,
    round(avg(r.rating_overall), 1) AS avg_overall,
    round(avg((r.rating_expertise + r.rating_manner + r.rating_communication + r.rating_overall)::numeric / 4.0), 1) AS avg_total
   FROM "49_통역사리뷰" r
     JOIN "01_회원" m ON m.id = r.interpreter_id
     LEFT JOIN "40_통역사프로필" p ON p.user_id = r.interpreter_id
  WHERE r.is_public = true
  GROUP BY r.interpreter_id, m.name, p.display_name, p.languages, p.specialties, p.profile_image_url, p.intro, p.experience_years;

-- ══════════════ 9. 데이터 삽입 ══════════════
-- ⚠️ 주의: 01_회원 데이터는 auth.users에 먼저 사용자가 등록되어야 합니다.
-- 새 프로젝트에서 아래 3명의 사용자를 먼저 Supabase Auth에 등록한 후 실행하세요.
-- 1) cosmos@contentour.co.kr (비밀번호 설정 필요) → admin
-- 2) hana.kim@contentour.co.kr → interpreter
-- 3) hana@contentour.co.kr → customer

-- 01_회원 (auth.users 등록 후 실행)
INSERT INTO "01_회원" (id, email, name, phone, role, company_id, language, created_at, updated_at, company_verified_at, profile_image_url, position, company_name) VALUES
('292a4b2b-d54a-4eb6-a9a5-ce9c62558769', 'cosmos@contentour.co.kr', '박재현', '010-1234-5678', 'admin', NULL, 'ko', '2026-02-23 01:25:59.66338+00', '2026-03-25 02:16:30.128+00', '2026-03-27 00:32:40.603+00', NULL, '매니저', '(주) 콘텐츄어'),
('33cc8b18-7e09-4477-ab37-14bd42cddf72', 'hana.kim@contentour.co.kr', '김하나', NULL, 'interpreter', NULL, 'ko', '2026-03-17 01:46:43.064219+00', '2026-03-17 01:46:43.064219+00', NULL, NULL, '', ''),
('2bff9341-ba82-42ab-bafb-0a876351121d', 'hana@contentour.co.kr', '고하나', '01074606784', 'customer', NULL, 'ko', '2026-03-20 03:33:27.92881+00', '2026-03-23 06:14:36.626+00', NULL, NULL, '매니저', '(주) 콘텐츄어')
ON CONFLICT (id) DO NOTHING;

-- 40_통역사프로필
INSERT INTO "40_통역사프로필" (id, user_id, display_name, phone, intro, profile_image_url, languages, specialties, certifications, experience_years, base_rate, rate_by_type, rate_by_language, is_active, is_verified, verified_at, created_at, updated_at, country_code, field_tag, cases_count, rating, satisfaction) VALUES
('b5a0323f-a1c0-429b-b2af-23c239ed771e', '33cc8b18-7e09-4477-ab37-14bd42cddf72', '김하나', '01074606784', '전시회 현장 통역 전문. 영어/일본어 동시통역 가능. KOTRA, KINTEX 등 다수 전시회 경험.', NULL, ARRAY['영어','일본어'], ARRAY['전시회 통역','비즈매칭','부스 상주'], '{}', 3, 250000, '{}', '{}', true, true, '2026-03-23 06:45:38.073662+00', '2026-03-23 06:45:38.073662+00', '2026-04-02 07:10:19.228319+00', 'jp', '전시회 통역', 2, 4.8, 97)
ON CONFLICT (id) DO NOTHING;

-- 42_통역계약
INSERT INTO "42_통역계약" (id, order_id, customer_id, interpreter_id, exhibition_name, client_company, venue, start_date, end_date, working_days, language_pair, service_type, daily_rate, total_amount, tax_amount, net_amount, deposit_amount, deposit_status, balance_amount, balance_status, status, contract_signed, contract_signed_at, created_at, updated_at, interpreter_accepted, accepted_at) VALUES
('d0308fef-80a5-4871-ba18-e05d0cadbaee', NULL, '2bff9341-ba82-42ab-bafb-0a876351121d', '33cc8b18-7e09-4477-ab37-14bd42cddf72', '일본 도쿄 메디컬전시회', '고하나', '일본 도쿄', '2026-03-27', '2026-03-29', 3, '한국어 ↔ 일본어', 'OTHER', 378000, 1247400, 113400, 1134000, 124740, 'pending', 1122660, 'pending', 'pending', true, NULL, '2026-03-25 07:17:29.954082+00', '2026-04-02 01:28:25.076764+00', true, '2026-03-26 01:58:29.121+00'),
('991992ba-3941-47b0-8318-35a7a3428b3d', NULL, '2bff9341-ba82-42ab-bafb-0a876351121d', '33cc8b18-7e09-4477-ab37-14bd42cddf72', '독일 뒤셀도르프 메디컬 전시회', '고하나', '독일', '2026-04-08', '2026-04-10', 3, '한국어 ↔ 독일어', 'OTHER', 540000, 1782000, 162000, 1620000, 178200, 'pending', 1603800, 'pending', 'pending', true, '2026-03-26 04:07:23.817+00', '2026-03-26 04:07:15.318874+00', '2026-04-02 01:28:25.076764+00', true, '2026-03-26 04:08:05.573+00')
ON CONFLICT (id) DO NOTHING;

-- 45_채팅메시지
INSERT INTO "45_채팅메시지" (id, room_id, contract_id, sender_id, sender_role, sender_name, message, message_type, attachments, read_by, created_at) VALUES
('6e5479b7-20ee-4a24-b296-34486f13ece3', 'contract_991992ba-3941-47b0-8318-35a7a3428b3d', '991992ba-3941-47b0-8318-35a7a3428b3d', '33cc8b18-7e09-4477-ab37-14bd42cddf72', 'interpreter', '김하나', '안녕하세요', 'text', '[]', '["33cc8b18-7e09-4477-ab37-14bd42cddf72","2bff9341-ba82-42ab-bafb-0a876351121d"]', '2026-03-27 00:49:13.235765+00'),
('f25f103f-44d3-4d76-8b85-7706edc60d88', 'contract_d0308fef-80a5-4871-ba18-e05d0cadbaee', 'd0308fef-80a5-4871-ba18-e05d0cadbaee', '33cc8b18-7e09-4477-ab37-14bd42cddf72', 'interpreter', '김하나', '안녕하세요.', 'text', '[]', '["33cc8b18-7e09-4477-ab37-14bd42cddf72"]', '2026-03-27 01:13:11.138146+00')
ON CONFLICT (id) DO NOTHING;

-- 46_ITQ견적문의
INSERT INTO "46_ITQ견적문의" (id, company, contact_name, email, phone, exhibition_name, location, venue, start_date, end_date, language_pair, service_type, headcount, working_hours, keywords, message, consent, status, admin_note, quoted_amount, quoted_at, contract_id, created_at, updated_at, user_id) VALUES
('ad6494f7-29d4-4421-83a8-ea3787f46de6', '고하나', '고하나', 'cosmos@contentour.co.kr', '-', '일본 도쿄 메디컬전시회', '일본 / 도쿄', '마쿠하리 맷세', '2026-03-27', '2026-03-29', '한국어 ↔ 일본어', 'OTHER', 1, '10:00 ~ 17:00', '의료기기', '부스 방문객 상담 통역이 필요합니다,', true, '완료', '{"interpreter":"김하나","interpreterId":"33cc8b18-7e09-4477-ab37-14bd42cddf72","country":"일본","days":3,"dailyRate":378000,"subtotal":1134000,"platformFee":113400,"total":1247400,"deposit":124740,"balance":1122660,"memo":"","quoteId":"QT-1774411037789"}', 1247400, '2026-03-25 03:57:17.789+00', 'd0308fef-80a5-4871-ba18-e05d0cadbaee', '2026-03-25 02:15:39.87837+00', '2026-04-02 01:39:49.312394+00', '2bff9341-ba82-42ab-bafb-0a876351121d'),
('27e7a42c-572a-4828-9768-72eb7c4880cb', '고하나', '고하나', 'hana@contentour.co.kr', '01074606784', '독일 뒤셀도르프 메디컬 전시회', '독일/ 뒤셀도르프', '', '2026-04-08', '2026-04-10', '한국어 ↔ 독일어', 'OTHER', 1, '10:00 ~ 17:00', '의료기기', '부스 방문객 상담 요청 드립니다.', true, '완료', '{"interpreter":"김하나","interpreterId":"33cc8b18-7e09-4477-ab37-14bd42cddf72","country":"독일","days":3,"dailyRate":540000,"subtotal":1620000,"platformFee":162000,"total":1782000,"deposit":178200,"balance":1603800,"memo":"","quoteId":"QT-1774490101555"}', 1782000, '2026-03-26 01:55:01.556+00', NULL, '2026-03-26 01:53:23.581475+00', '2026-04-02 01:39:49.312394+00', '2bff9341-ba82-42ab-bafb-0a876351121d')
ON CONFLICT (id) DO NOTHING;

-- 49_통역사리뷰
INSERT INTO "49_통역사리뷰" (id, contract_id, customer_id, interpreter_id, exhibition_name, rating_expertise, rating_manner, rating_communication, rating_overall, review_text, is_public, created_at, updated_at) VALUES
('23efe589-8f11-4fcb-921e-ada0c37b20c8', 'd0308fef-80a5-4871-ba18-e05d0cadbaee', '2bff9341-ba82-42ab-bafb-0a876351121d', '33cc8b18-7e09-4477-ab37-14bd42cddf72', '일본 도쿄 메디컬전시회', 5, 5, 4, 5, '의료기기 전문 용어를 정확하게 통역해주셔서 바이어 상담이 매끄럽게 진행되었습니다.', true, '2026-03-26 05:13:57.505701+00', '2026-03-26 05:13:57.505701+00')
ON CONFLICT (id) DO NOTHING;

-- 50_위약금정책
INSERT INTO "50_위약금정책" (id, cancel_type, min_days, max_days, penalty_rate, penalty_base, interpreter_action, description) VALUES
('9d45e2c5-d243-4987-ab46-0ecaaf1f5259', 'customer', 14, 9999, 0, 'deposit', NULL, '14일 이전 취소: 무료 취소, 전액 환불'),
('c8931b4c-fa20-4bdd-84d1-bf82eafea066', 'customer', 7, 13, 50, 'deposit', NULL, '7~13일 전 취소: 계약금 50% 차감'),
('9344f32b-0828-4ab0-9626-77ffe7de5053', 'customer', 3, 6, 100, 'deposit', NULL, '3~6일 전 취소: 계약금 100% 차감'),
('6499c28f-65d8-4ba6-8d30-a5540d1f14b5', 'customer', 1, 2, 50, 'total', NULL, '1~2일 전 취소: 총액 50% 위약금'),
('bdc75f72-c5aa-4b4b-880b-8a1362300be5', 'customer', 0, 0, 100, 'total', NULL, '당일/노쇼: 총액 100% 위약금'),
('f175733d-d363-4111-a31a-b5878ee93146', 'interpreter', 14, 9999, 0, 'total', '경고 없음', '14일 이전 취소: 무료 취소'),
('01ef00c9-ed14-4b0d-b521-feb9a91704e7', 'interpreter', 7, 13, 0, 'total', '패널티 경고', '7~13일 전 취소: 패널티 경고 1회'),
('4710f34f-eea7-444c-8b0f-e283941f2cfe', 'interpreter', 3, 6, 0, 'total', '매칭 제한 + 패널티', '3~6일 전 취소: 매칭 제한 + 패널티'),
('2e789dec-7580-4fec-81cd-c9644d6e9aaa', 'interpreter', 1, 2, 0, 'total', '매칭 정지 + 패널티', '1~2일 전 취소: 매칭 정지 + 패널티'),
('832ab18b-0088-4755-842d-d117f3fc3857', 'interpreter', 0, 0, 0, 'total', '계정 정지 검토', '당일/노쇼: 계정 정지 검토')
ON CONFLICT (id) DO NOTHING;

-- 52_성과사례
INSERT INTO "52_성과사례" (id, title, client_company, exhibition_name, country, country_flag, exhibition_date, case_type, interpreter_name, industry, image_url, link_url, metric1_label, metric1_value, metric2_label, metric2_value, is_published, sort_order) VALUES
('9c7d1ba9-027f-4220-bccf-c272d4f5ef49', '일본 Nano Tech 2026', '태림산업', 'Nano Tech 2026', '일본', '🇯🇵', '2026.02', '부스 통역', '고하나', '제조/나노기술', 'https://contentour.co.kr/wp-content/uploads/2026/02/1770078227892-scaled-768x500.jpg', 'https://contentour.co.kr/nano-tech/', '상담 통역', '32건', '상담액', '₩8.5억', true, 1),
('3c2bb193-e57f-4ee9-b1ef-b55cc01a5633', '미국 디트로이트 Battery Show NA 2025', '제이스텍', 'The Battery Show NA 2025', '미국', '🇺🇸', '2025.10', '부스 통역', '박준혁', '배터리/에너지', 'https://contentour.co.kr/wp-content/uploads/2026/01/20251008_154636-1-scaled-768x500.jpg', 'https://contentour.co.kr/the-battery-show/', '상담 통역', '28건', '계약 추진', '₩12억', true, 2),
('ba1e9e5f-7f02-41fb-a20d-06ee101b4876', '독일 MEDICA 2025', '부산TP & 부산경제진흥원', 'MEDICA 2025', '독일', '🇩🇪', '2025.12', '미팅 통역', '서지원', '의료기기', 'https://contentour.co.kr/wp-content/uploads/2025/12/KakaoTalk_20251122_205029643_01-scaled-768x500.jpg', 'https://contentour.co.kr/medica/', '미팅 통역', '45건', 'MOU 체결', '3건', true, 3),
('a18eaed5-27c4-479b-a018-2794cf95d722', '태국 방콕 MEDICAL FAIR 2025', '부산TP', 'MEDICAL FAIR 2025', '태국', '🇹🇭', '2025.10', '부스 통역', 'Somchai P.', '의료/헬스케어', 'https://contentour.co.kr/wp-content/uploads/2025/10/20250910_125519-scaled-768x500.jpg', 'https://contentour.co.kr/medical-fair/', '상담 통역', '38건', '상담액', '₩6.2억', true, 4),
('80bea910-b308-4c9f-b311-947ee98eb023', '독일 베를린 IFA Berlin 2025', '하츠', 'IFA Berlin 2025', '독일', '🇩🇪', '2025.09', '현장 통역', 'Anna S.', '가전/전자', 'https://contentour.co.kr/wp-content/uploads/2025/09/20250904_140752-scaled-768x500.jpg', 'https://contentour.co.kr/ifa-berlin/', '바이어 통역', '120+건', '통역 기간', '5일', true, 5),
('7087e02c-da1c-4fb4-9979-c59937e9a9af', '독일 슈투트가르트 Battery Show Europe', '한국진공', 'The Battery Show Europe', '독일', '🇩🇪', '2025.07', '미팅 통역', '윤태호', '자동차/기계', 'https://contentour.co.kr/wp-content/uploads/2025/07/20250603_113502-scaled-768x500.jpg', 'https://contentour.co.kr/%ed%95%9c%ea%b5%ad%ec%a7%84%ea%b3%b5-%eb%8f%85%ec%9d%bc-%ec%8a%88%ed%88%ac%ed%8a%b8%ea%b0%80%eb%a5%b4%ed%8a%b8-%eb%b0%b0%ed%84%b0%eb%a6%ac-%ec%a0%84%ec%8b%9c%ed%9a%8c-the-battery-show-europe/', '기술 미팅 통역', '85+건', '통역 기간', '4일', true, 6)
ON CONFLICT (id) DO NOTHING;

-- 90_시스템설정
INSERT INTO "90_시스템설정" (key, value, updated_at, updated_by) VALUES
('notify_email_payment', '"true"', '2026-03-25 06:40:21.636+00', '292a4b2b-d54a-4eb6-a9a5-ce9c62558769'),
('notify_kakao_enabled', '"false"', '2026-03-25 06:40:21.636+00', '292a4b2b-d54a-4eb6-a9a5-ce9c62558769'),
('auto_contract', '"true"', '2026-03-25 06:40:21.635+00', '292a4b2b-d54a-4eb6-a9a5-ce9c62558769'),
('platform_fee_rate', '"10"', '2026-03-25 06:40:21.635+00', '292a4b2b-d54a-4eb6-a9a5-ce9c62558769'),
('notify_dashboard_realtime', '"true"', '2026-03-25 06:40:21.636+00', '292a4b2b-d54a-4eb6-a9a5-ce9c62558769'),
('payment_mode', '"test"', '2026-03-25 06:40:21.635+00', '292a4b2b-d54a-4eb6-a9a5-ce9c62558769'),
('default_work_start', '"09:00"', '2026-03-25 06:40:21.635+00', '292a4b2b-d54a-4eb6-a9a5-ce9c62558769'),
('notify_email_assignment', '"true"', '2026-03-25 06:40:21.636+00', '292a4b2b-d54a-4eb6-a9a5-ce9c62558769'),
('notify_admin_email', '"hana@contentour.co.kr"', '2026-03-25 06:40:21.636+00', '292a4b2b-d54a-4eb6-a9a5-ce9c62558769'),
('default_work_end', '"18:00"', '2026-03-25 06:40:21.636+00', '292a4b2b-d54a-4eb6-a9a5-ce9c62558769'),
('notify_email_new_inquiry', '"true"', '2026-03-25 06:40:21.636+00', '292a4b2b-d54a-4eb6-a9a5-ce9c62558769'),
('default_daily_rate', '"250000"', '2026-03-25 06:40:21.635+00', '292a4b2b-d54a-4eb6-a9a5-ce9c62558769'),
('order_type_default', '"platform"', '2026-03-25 06:55:00.30342+00', NULL),
('rate_limits', '{"booth":{"max":500000,"min":150000},"meeting":{"max":600000,"min":200000},"operation":{"max":500000,"min":150000},"conference":{"max":800000,"min":300000}}', '2026-03-31 05:41:51.73866+00', NULL),
('recommended_rates', '{"tiers":[{"booth":{"max":280000,"min":180000},"label":"주니어 (1~3년)","meeting":{"max":320000,"min":220000},"max_years":3,"min_years":0,"operation":{"max":280000,"min":180000},"conference":{"max":400000,"min":300000}},{"booth":{"max":400000,"min":280000},"label":"경력 (3~7년)","meeting":{"max":450000,"min":320000},"max_years":7,"min_years":3,"operation":{"max":400000,"min":280000},"conference":{"max":600000,"min":400000}},{"booth":{"max":500000,"min":350000},"label":"시니어 (7년 이상)","meeting":{"max":600000,"min":400000},"max_years":99,"min_years":7,"operation":{"max":500000,"min":350000},"conference":{"max":800000,"min":500000}}]}', '2026-03-31 09:02:36.195745+00', NULL)
ON CONFLICT (key) DO NOTHING;

-- ══════════════ 완료 ══════════════
-- 마이그레이션 완료!
--
-- ⚠️ 중요: 이 SQL을 실행하기 전에 새 프로젝트에서 다음을 먼저 해주세요:
-- 1. Supabase Auth에서 3명의 사용자를 동일한 이메일/비밀번호로 생성
--    (UUID가 다를 수 있으므로 생성 후 위 INSERT문의 UUID를 새 UUID로 교체 필요)
-- 2. Storage에 'profile-images' 버킷 생성
