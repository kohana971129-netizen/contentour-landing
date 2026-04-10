-- ═══════════════════════════════════════════════════════════════
-- 60_해외전시회DB 테이블 생성 + 시드 데이터
-- ═══════════════════════════════════════════════════════════════
-- 실행 방법: Supabase 대시보드 > SQL Editor > 새 쿼리 > 전체 붙여넣기 > Run
-- ═══════════════════════════════════════════════════════════════

-- 1. 확장 (퍼지 검색용)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- 2. 테이블 생성
CREATE TABLE IF NOT EXISTS "60_해외전시회DB" (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    name_en TEXT,
    country TEXT NOT NULL,
    city TEXT,
    venue TEXT,
    field TEXT,
    start_date DATE,
    end_date DATE,
    source_url TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. 인덱스
CREATE INDEX IF NOT EXISTS idx_60_exhibitions_country ON "60_해외전시회DB" (country);
CREATE INDEX IF NOT EXISTS idx_60_exhibitions_active ON "60_해외전시회DB" (is_active);
CREATE INDEX IF NOT EXISTS idx_60_exhibitions_name_trgm ON "60_해외전시회DB" USING gin (name gin_trgm_ops);

-- 4. updated_at 자동 갱신 트리거
CREATE OR REPLACE FUNCTION update_60_exhibitions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_60_exhibitions_updated_at ON "60_해외전시회DB";
CREATE TRIGGER trg_60_exhibitions_updated_at
    BEFORE UPDATE ON "60_해외전시회DB"
    FOR EACH ROW
    EXECUTE FUNCTION update_60_exhibitions_updated_at();

-- 5. RLS: 활성 전시회는 누구나 조회 가능, 쓰기는 service_role만
ALTER TABLE "60_해외전시회DB" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "60_exhibitions_public_read" ON "60_해외전시회DB";
CREATE POLICY "60_exhibitions_public_read" ON "60_해외전시회DB"
    FOR SELECT
    USING (is_active = TRUE);

-- 6. 시드 데이터 (콘텐츄어 해외전시회 DB 110+개)
INSERT INTO "60_해외전시회DB" (name, country, city, field, venue, start_date, end_date) VALUES
-- ── 일본 ──
('FOODEX JAPAN', '일본', '도쿄', '식품', 'Makuhari Messe', '2026-03-10', '2026-03-13'),
('Nano Tech', '일본', '도쿄', '나노기술', 'Tokyo Big Sight', '2026-01-28', '2026-01-30'),
('H2 & FC EXPO', '일본', '도쿄', '수소·연료전지', 'Tokyo Big Sight', '2026-03-04', '2026-03-06'),
('CEATEC', '일본', '도쿄', 'IT·전자', 'Makuhari Messe', '2026-10-20', '2026-10-23'),
('JIMTOF', '일본', '도쿄', '공작기계', 'Tokyo Big Sight', '2026-11-02', '2026-11-07'),
('Japan IT Week', '일본', '도쿄', 'IT', 'Tokyo Big Sight', '2026-04-22', '2026-04-24'),
('InterBEE', '일본', '도쿄', '방송·미디어', 'Makuhari Messe', '2026-11-18', '2026-11-20'),
('SEMICON Japan', '일본', '도쿄', '반도체', 'Tokyo Big Sight', '2026-12-16', '2026-12-18'),
('Smart Energy Week', '일본', '도쿄', '에너지', 'Tokyo Big Sight', '2026-03-04', '2026-03-06'),
('COSME Tokyo', '일본', '도쿄', '화장품', 'Tokyo Big Sight', '2026-01-21', '2026-01-23'),
('JAPAN PACK', '일본', '도쿄', '포장', 'Makuhari Messe', NULL, NULL),
('ifia JAPAN', '일본', '도쿄', '식품소재', 'Tokyo Big Sight', NULL, NULL),
('JASIS', '일본', '도쿄', '분석기기', 'Makuhari Messe', NULL, NULL),
-- ── 중국 ──
('Canton Fair', '중국', '광저우', '종합무역', 'Canton Fair Complex', '2026-04-15', '2026-05-05'),
('CIIE', '중국', '상하이', '수입박람회', 'NECC Shanghai', '2026-11-05', '2026-11-10'),
('CHINACOAT', '중국', '상하이', '도료·코팅', 'SNIEC', NULL, NULL),
('China Beauty Expo', '중국', '상하이', '뷰티', 'SNIEC', '2026-05-12', '2026-05-14'),
('SIAL China', '중국', '상하이', '식품', 'SNIEC', '2026-05-18', '2026-05-20'),
('Automechanika Shanghai', '중국', '상하이', '자동차부품', 'NECC Shanghai', '2026-12-01', '2026-12-04'),
('CHINAPLAS', '중국', '선전', '플라스틱·고무', 'Shenzhen World Exhibition Center', '2026-04-21', '2026-04-24'),
('CBME China', '중국', '상하이', '유아용품', 'NECC Shanghai', NULL, NULL),
('CMEF', '중국', '상하이', '의료기기', 'NECC Shanghai', '2026-04-09', '2026-04-12'),
-- ── 독일 ──
('MEDICA', '독일', '뒤셀도르프', '의료기기', 'Messe Düsseldorf', '2026-11-16', '2026-11-19'),
('Hannover Messe', '독일', '하노버', '산업기술', 'Hannover Fairground', '2026-04-20', '2026-04-24'),
('ANUGA', '독일', '쾰른', '식품', 'Koelnmesse', '2027-10-09', '2027-10-13'),
('IFA Berlin', '독일', '베를린', '가전·IT', 'Messe Berlin', '2026-09-04', '2026-09-09'),
('Automechanika Frankfurt', '독일', '프랑크푸르트', '자동차부품', 'Messe Frankfurt', '2026-09-08', '2026-09-12'),
('K Show', '독일', '뒤셀도르프', '플라스틱·고무', 'Messe Düsseldorf', '2028-10-18', '2028-10-25'),
('FIBO', '독일', '쾰른', '피트니스', 'Koelnmesse', '2026-04-02', '2026-04-05'),
('DRUPA', '독일', '뒤셀도르프', '인쇄', 'Messe Düsseldorf', '2028-05-09', '2028-05-17'),
('ProSweets', '독일', '쾰른', '제과', 'Koelnmesse', '2026-02-01', '2026-02-04'),
('SCHWEISSEN & SCHNEIDEN', '독일', '에센', '용접·절단장비', 'Messe Essen', NULL, NULL),
('EUROSHOP', '독일', '뒤셀도르프', '점포설비·유통', 'Messe Düsseldorf', NULL, NULL),
('Drinktec', '독일', '뮌헨', '식음료·포장기술', 'Messe München', NULL, NULL),
('IFFA', '독일', '프랑크푸르트', '육류가공', 'Messe Frankfurt', NULL, NULL),
('analytica', '독일', '뮌헨', '분석기기·바이오', 'Messe München', NULL, NULL),
('BAUMA', '독일', '뮌헨', '건설·광산기계', 'Messe München', NULL, NULL),
('ISM Cologne', '독일', '쾰른', '과자·스낵', 'Koelnmesse', '2026-02-01', '2026-02-04'),
('INTERZUM', '독일', '쾰른', '가구부자재', 'Koelnmesse', NULL, NULL),
('EuroTier', '독일', '하노버', '축산', 'Hannover Fairground', NULL, NULL),
('embedded world', '독일', '뉘른베르크', '임베디드시스템', 'NürnbergMesse', '2026-03-10', '2026-03-12'),
('LASER World of PHOTONICS', '독일', '뮌헨', '레이저·광학', 'Messe München', '2027-06-21', '2027-06-24'),
('ACHEMA', '독일', '프랑크푸르트', '화학공학', 'Messe Frankfurt', '2027-06-14', '2027-06-18'),
-- ── 베트남 ──
('VIETNAM EXPO', '베트남', '호치민', '종합무역', 'SECC', '2026-04-08', '2026-04-11'),
('Vietnam Manufacturing Expo', '베트남', '호치민', '제조업', 'SECC', NULL, NULL),
('Vietfood & Beverage', '베트남', '호치민', '식품', 'SECC', NULL, NULL),
('Vietnam Medipharm Expo', '베트남', '호치민', '의약품', 'SECC', NULL, NULL),
('ILDEX Vietnam', '베트남', '호치민', '축산', 'SECC', NULL, NULL),
('VIETBUILD', '베트남', '호치민', '건축·건설', 'SECC', NULL, NULL),
-- ── 미국 ──
('CES', '미국', '라스베이거스', 'IT·가전', 'Las Vegas Convention Center', '2026-01-06', '2026-01-09'),
('NAB Show', '미국', '라스베이거스', '방송·미디어', 'Las Vegas Convention Center', '2026-04-18', '2026-04-22'),
('KBIS', '미국', '라스베이거스', '주방·욕실', 'Las Vegas Convention Center', NULL, NULL),
('Natural Products Expo West', '미국', 'LA', '건강식품', 'Anaheim Convention Center', '2026-03-03', '2026-03-07'),
('IFT FIRST', '미국', '시카고', '식품기술', 'McCormick Place', NULL, NULL),
('PACK EXPO', '미국', '시카고', '포장', 'McCormick Place', NULL, NULL),
('MD&M West', '미국', 'LA', '의료기기', 'Anaheim Convention Center', NULL, NULL),
('AAPEX', '미국', '라스베이거스', '자동차부품', 'Venetian Expo', '2026-11-03', '2026-11-05'),
('CONEXPO-CON/AGG', '미국', '라스베이거스', '건설기계', 'Las Vegas Convention Center', NULL, NULL),
('SEMA Show', '미국', '라스베이거스', '자동차애프터마켓', 'Las Vegas Convention Center', '2026-11-03', '2026-11-06'),
('Cosmoprof North America', '미국', '라스베이거스', '뷰티', 'Las Vegas Convention Center', NULL, NULL),
('HIMSS', '미국', '올랜도', '헬스케어IT', 'Orange County Convention Center', NULL, NULL),
('IMTS', '미국', '시카고', '제조기술', 'McCormick Place', NULL, NULL),
('FABTECH', '미국', '라스베이거스', '금속성형·용접', 'Las Vegas Convention Center', NULL, NULL),
-- ── UAE ──
('GITEX', 'UAE', '두바이', 'IT', 'Dubai World Trade Centre', '2026-10-12', '2026-10-16'),
('Arab Health', 'UAE', '두바이', '의료', 'Dubai World Trade Centre', '2026-01-26', '2026-01-29'),
('Gulfood', 'UAE', '두바이', '식품', 'Dubai World Trade Centre', '2026-02-17', '2026-02-21'),
('ADIPEC', 'UAE', '아부다비', '에너지', 'ADNEC', '2026-11-09', '2026-11-12'),
('Beautyworld Middle East', 'UAE', '두바이', '뷰티', 'Dubai World Trade Centre', NULL, NULL),
('The Big 5', 'UAE', '두바이', '건설', 'Dubai World Trade Centre', NULL, NULL),
-- ── 태국 ──
('THAIFEX', '태국', '방콕', '식품', 'IMPACT', '2026-05-26', '2026-05-30'),
('Manufacturing Expo Thailand', '태국', '방콕', '제조', 'BITEC', NULL, NULL),
('Medical Fair Thailand', '태국', '방콕', '의료', 'QSNCC', NULL, NULL),
('VICTAM Asia', '태국', '방콕', '사료·곡물', 'IMPACT', NULL, NULL),
('ProPak Asia', '태국', '방콕', '포장·가공', 'BITEC', NULL, NULL),
('Metalex', '태국', '방콕', '금속가공', 'BITEC', NULL, NULL),
-- ── 이탈리아 ──
('Cosmoprof Worldwide Bologna', '이탈리아', '볼로냐', '뷰티', 'BolognaFiere', '2026-03-19', '2026-03-23'),
('IPACK-IMA', '이탈리아', '밀라노', '포장·제조공정', 'Fiera Milano', NULL, NULL),
('EICMA', '이탈리아', '밀라노', '이륜차', 'Fiera Milano', NULL, NULL),
('HOST Milano', '이탈리아', '밀라노', '호텔·요식업', 'Fiera Milano', NULL, NULL),
('Salone del Mobile', '이탈리아', '밀라노', '가구·디자인', 'Fiera Milano', '2026-04-21', '2026-04-26'),
-- ── 스페인 ──
('MWC (Mobile World Congress)', '스페인', '바르셀로나', '모바일·통신', 'Fira Barcelona', '2026-03-02', '2026-03-05'),
('ALIMENTARIA', '스페인', '바르셀로나', '식품', 'Fira Barcelona', NULL, NULL),
('Smart City Expo', '스페인', '바르셀로나', '스마트시티', 'Fira Barcelona', NULL, NULL),
-- ── 프랑스 ──
('SIAL Paris', '프랑스', '파리', '식품', 'Paris Nord Villepinte', '2026-10-17', '2026-10-21'),
('Maison & Objet', '프랑스', '파리', '인테리어·디자인', 'Paris Nord Villepinte', '2026-01-22', '2026-01-26'),
('JEC World', '프랑스', '파리', '복합소재', 'Paris Nord Villepinte', NULL, NULL),
('EUROSATORY', '프랑스', '파리', '방위산업', 'Paris Nord Villepinte', NULL, NULL),
('VIVA Technology', '프랑스', '파리', 'IT·스타트업', 'Paris Expo Porte de Versailles', '2026-06-17', '2026-06-20'),
-- ── 기타 ──
('INTERTRAFFIC', '네덜란드', '암스테르담', '교통설비', 'RAI Amsterdam', NULL, NULL),
('IBC', '네덜란드', '암스테르담', '방송·미디어', 'RAI Amsterdam', NULL, NULL),
('CPHI Worldwide', '유럽', '변동', '제약', NULL, NULL, NULL),
('COMPUTEX', '대만', '타이페이', 'IT·컴퓨터', 'Taipei Nangang Exhibition Center', '2026-06-02', '2026-06-05'),
('Taipei AMPA', '대만', '타이페이', '자동차부품', 'Taipei Nangang Exhibition Center', NULL, NULL),
('OSEA', '싱가포르', '싱가포르', '해양·석유가스', 'Marina Bay Sands', NULL, NULL),
('FHA', '싱가포르', '싱가포르', '식품·호텔', 'Singapore Expo', NULL, NULL),
('Africa Food Expo', '남아공', '요하네스버그', '식품', 'Gallagher Convention Centre', NULL, NULL);

-- 7. 확인
SELECT country, COUNT(*) AS cnt FROM "60_해외전시회DB" GROUP BY country ORDER BY cnt DESC;
