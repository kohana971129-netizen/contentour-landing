-- 누락된 6개 테이블 생성 (통역 서비스 프로젝트)
-- Supabase Dashboard → SQL Editor에서 실행

-- 1. 50_감사로그
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
ALTER TABLE "50_감사로그" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "감사로그_관리자_조회" ON "50_감사로그" FOR SELECT TO authenticated USING (is_admin());
CREATE POLICY "감사로그_생성" ON "50_감사로그" FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- 2. 50_위약금정책
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
ALTER TABLE "50_위약금정책" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "위약금정책_공개조회" ON "50_위약금정책" FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "위약금정책_관리자수정" ON "50_위약금정책" FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());

-- 위약금정책 데이터
INSERT INTO "50_위약금정책" (cancel_type, min_days, max_days, penalty_rate, penalty_base, interpreter_action, description) VALUES
('customer', 14, 9999, 0, 'deposit', NULL, '14일 이전 취소: 무료 취소, 전액 환불'),
('customer', 7, 13, 50, 'deposit', NULL, '7~13일 전 취소: 계약금 50% 차감'),
('customer', 3, 6, 100, 'deposit', NULL, '3~6일 전 취소: 계약금 100% 차감'),
('customer', 1, 2, 50, 'total', NULL, '1~2일 전 취소: 총액 50% 위약금'),
('customer', 0, 0, 100, 'total', NULL, '당일/노쇼: 총액 100% 위약금'),
('interpreter', 14, 9999, 0, 'total', '경고 없음', '14일 이전 취소: 무료 취소'),
('interpreter', 7, 13, 0, 'total', '패널티 경고', '7~13일 전 취소: 패널티 경고 1회'),
('interpreter', 3, 6, 0, 'total', '매칭 제한 + 패널티', '3~6일 전 취소: 매칭 제한 + 패널티'),
('interpreter', 1, 2, 0, 'total', '매칭 정지 + 패널티', '1~2일 전 취소: 매칭 정지 + 패널티'),
('interpreter', 0, 0, 0, 'total', '계정 정지 검토', '당일/노쇼: 계정 정지 검토');

-- 3. 51_취소내역
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
ALTER TABLE "51_취소내역" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "취소내역_관리자전체" ON "51_취소내역" FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "취소내역_본인작성" ON "51_취소내역" FOR INSERT TO authenticated WITH CHECK (cancelled_user_id = auth.uid());
CREATE POLICY "취소내역_본인조회" ON "51_취소내역" FOR SELECT TO authenticated USING ((cancelled_user_id = auth.uid()) OR (contract_id IN (SELECT id FROM "42_통역계약" WHERE customer_id = auth.uid() OR interpreter_id = auth.uid())));

-- 4. 52_성과사례
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
ALTER TABLE "52_성과사례" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "성과사례_공개조회" ON "52_성과사례" FOR SELECT TO anon, authenticated USING (is_published = true);
CREATE POLICY "성과사례_관리자전체" ON "52_성과사례" FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());

-- 성과사례 데이터
INSERT INTO "52_성과사례" (title, client_company, exhibition_name, country, country_flag, exhibition_date, case_type, interpreter_name, industry, image_url, link_url, metric1_label, metric1_value, metric2_label, metric2_value, is_published, sort_order) VALUES
('일본 Nano Tech 2026', '태림산업', 'Nano Tech 2026', '일본', '🇯🇵', '2026.02', '부스 통역', '고하나', '제조/나노기술', 'https://contentour.co.kr/wp-content/uploads/2026/02/1770078227892-scaled-768x500.jpg', 'https://contentour.co.kr/nano-tech/', '상담 통역', '32건', '상담액', '₩8.5억', true, 1),
('미국 디트로이트 Battery Show NA 2025', '제이스텍', 'The Battery Show NA 2025', '미국', '🇺🇸', '2025.10', '부스 통역', '박준혁', '배터리/에너지', 'https://contentour.co.kr/wp-content/uploads/2026/01/20251008_154636-1-scaled-768x500.jpg', 'https://contentour.co.kr/the-battery-show/', '상담 통역', '28건', '계약 추진', '₩12억', true, 2),
('독일 MEDICA 2025', '부산TP & 부산경제진흥원', 'MEDICA 2025', '독일', '🇩🇪', '2025.12', '미팅 통역', '서지원', '의료기기', 'https://contentour.co.kr/wp-content/uploads/2025/12/KakaoTalk_20251122_205029643_01-scaled-768x500.jpg', 'https://contentour.co.kr/medica/', '미팅 통역', '45건', 'MOU 체결', '3건', true, 3),
('태국 방콕 MEDICAL FAIR 2025', '부산TP', 'MEDICAL FAIR 2025', '태국', '🇹🇭', '2025.10', '부스 통역', 'Somchai P.', '의료/헬스케어', 'https://contentour.co.kr/wp-content/uploads/2025/10/20250910_125519-scaled-768x500.jpg', 'https://contentour.co.kr/medical-fair/', '상담 통역', '38건', '상담액', '₩6.2억', true, 4),
('독일 베를린 IFA Berlin 2025', '하츠', 'IFA Berlin 2025', '독일', '🇩🇪', '2025.09', '현장 통역', 'Anna S.', '가전/전자', 'https://contentour.co.kr/wp-content/uploads/2025/09/20250904_140752-scaled-768x500.jpg', 'https://contentour.co.kr/ifa-berlin/', '바이어 통역', '120+건', '통역 기간', '5일', true, 5),
('독일 슈투트가르트 Battery Show Europe', '한국진공', 'The Battery Show Europe', '독일', '🇩🇪', '2025.07', '미팅 통역', '윤태호', '자동차/기계', 'https://contentour.co.kr/wp-content/uploads/2025/07/20250603_113502-scaled-768x500.jpg', 'https://contentour.co.kr/%ed%95%9c%ea%b5%ad%ec%a7%84%ea%b3%b5-%eb%8f%85%ec%9d%bc-%ec%8a%88%ed%88%ac%ed%8a%b8%ea%b0%80%eb%a5%b4%ed%8a%b8-%eb%b0%b0%ed%84%b0%eb%a6%ac-%ec%a0%84%ec%8b%9c%ed%9a%8c-the-battery-show-europe/', '기술 미팅 통역', '85+건', '통역 기간', '4일', true, 6);

-- 5. 91_단가변경이력
CREATE TABLE IF NOT EXISTS "91_단가변경이력" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
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
ALTER TABLE "91_단가변경이력" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "관리자_단가이력_조회" ON "91_단가변경이력" FOR SELECT TO public USING (is_admin());
CREATE POLICY "본인_단가이력_조회" ON "91_단가변경이력" FOR SELECT TO public USING (auth.uid() = interpreter_id);
CREATE POLICY "본인_단가이력_삽입" ON "91_단가변경이력" FOR INSERT TO public WITH CHECK (auth.uid() = interpreter_id);

-- 6. 51_주문상태이력 (service_status enum이 없으면 text로 대체)
DO $$ BEGIN
  CREATE TYPE service_status AS ENUM ('상담중','상담완료','견적진행','진행중','완료','취소');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "51_주문상태이력" (
  "history_id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "order_id" uuid NOT NULL,
  "prev_status" text,
  "new_status" text NOT NULL,
  "changed_by" uuid,
  "changed_at" timestamptz NOT NULL DEFAULT now(),
  "note" text,
  PRIMARY KEY ("history_id")
);
ALTER TABLE "51_주문상태이력" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "관리자 전체" ON "51_주문상태이력" FOR ALL TO public USING (is_admin());
