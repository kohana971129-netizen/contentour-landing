// 통합 라우터: cases / reviews
// vercel.json rewrites가 옛 URL을 _route 쿼리로 매핑

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://jgeqbdrfpekzuumaklvx.supabase.co';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpnZXFiZHJmcGVrenV1bWFrbHZ4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ4MzgwMzQsImV4cCI6MjA5MDQxNDAzNH0.C2y3UiPtHIF2s4nPvbGycN927HOG4YpO86FfgZAelUw';

const supabase = createClient(SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const sbAuth = createClient(SUPABASE_URL, ANON_KEY);

// ────────────────────────── cases ──────────────────────────
async function handleCases(req, res) {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    try {
        const { data, error } = await supabase
            .from('52_성과사례')
            .select('*')
            .eq('is_published', true)
            .order('sort_order', { ascending: true });
        if (error) throw error;

        res.setHeader('Cache-Control', 'public, max-age=300, stale-while-revalidate=60');
        return res.status(200).json(data || []);
    } catch (e) {
        console.error('Cases query error:', e);
        return res.status(500).json({ error: 'Failed to load cases' });
    }
}

// ────────────────────────── reviews ──────────────────────────
async function handleReviews(req, res) {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    try {
        const exhibition = req.query.exhibition;

        let query = supabase
            .from('49_통역사리뷰')
            .select('customer_id, interpreter_id, exhibition_name, rating_expertise, rating_manner, rating_communication, rating_overall, review_text, created_at, is_public')
            .eq('is_public', true)
            .order('created_at', { ascending: false });

        if (exhibition) query = query.eq('exhibition_name', exhibition);
        else query = query.not('review_text', 'is', null).limit(8);

        const { data: reviews, error: revErr } = await query;
        if (revErr) throw revErr;
        if (!reviews || reviews.length === 0) return res.status(200).json([]);

        const custIds = reviews.map(r => r.customer_id).filter(Boolean);
        const custMap = {};
        const companyMap = {};

        if (custIds.length > 0) {
            const { data: customers } = await supabase
                .from('01_회원').select('id, name, email').in('id', custIds);

            if (customers && customers.length > 0) {
                customers.forEach(c => { custMap[c.id] = c; });

                const emails = customers.map(c => c.email).filter(Boolean);
                if (emails.length > 0) {
                    const { data: companies } = await supabase
                        .from('02_국내기업').select('name, contact_email').in('contact_email', emails);

                    if (companies && companies.length > 0) {
                        const emailToCompany = {};
                        companies.forEach(co => { emailToCompany[co.contact_email] = co.name; });
                        customers.forEach(c => {
                            if (c.email && emailToCompany[c.email]) companyMap[c.id] = emailToCompany[c.email];
                        });
                    }
                }
            }
        }

        const interpIds = reviews.map(r => r.interpreter_id).filter(Boolean);
        let interpMap = {};
        if (interpIds.length > 0) {
            const { data: interps } = await supabase
                .from('40_통역사프로필').select('user_id, display_name').in('user_id', interpIds);
            if (interps) interps.forEach(p => { interpMap[p.user_id] = p.display_name; });
        }

        const result = reviews.map(r => {
            const cust = custMap[r.customer_id] || {};
            return {
                ...r,
                _customerName: cust.name || '고객',
                _companyName: companyMap[r.customer_id] || '',
                _interpreterName: interpMap[r.interpreter_id] || ''
            };
        });

        res.setHeader('Cache-Control', 'public, max-age=300, stale-while-revalidate=60');
        return res.status(200).json(result);
    } catch (e) {
        console.error('Reviews query error:', e);
        return res.status(500).json({ error: 'Failed to load reviews' });
    }
}

// ────────────────────────── showcase (통역사 구인 현황) ──────────────────────────
// 공개 카드 그리드 데이터. 화이트리스트 컬럼만 반환 — 회사명/연락처/메시지 등 절대 노출 금지.
// 두 종류의 공고를 합쳐서 반환:
//   1) admin_inquiry  → showcase_consent=true AND showcase_published_at IS NOT NULL  (Phase 3 룰)
//   2) direct_posting → review_status='approved'                                       (Phase 4)
// 매칭 상태: contract_id IS NULL → recruiting, 아니면 matched.

const SHOWCASE_COLUMNS = 'id, source_type, exhibition_name, location, venue, start_date, end_date, language_pair, headcount, contract_id, showcase_label, showcase_industry, showcase_country_code, showcase_published_at, reviewed_at, interest_count, company, company_name_disclosure, message, posted_by_user_id';

// Phase 4H — 매칭 후 카드 자동 hidden 기준일. 변경 시 한 줄만 수정.
const SHOWCASE_HIDE_AFTER_DAYS = 14;

function parseLanguages(pair) {
    if (!pair) return [];
    return String(pair).split(/[,/、・·]/).map(s => s.trim()).filter(Boolean).slice(0, 6);
}

function calcDaysLeft(startDate) {
    if (!startDate) return null;
    const start = new Date(startDate + 'T00:00:00');
    if (isNaN(start.getTime())) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const diff = Math.round((start - today) / 86400000);
    return diff >= 0 ? diff : null;
}

// Phase 4F — viewer 역할별로 label 결정
//  · 비로그인 / 통역사 미동의: 익명 라벨 (admin이 만든 showcase_label)
//  · 로그인 통역사 + company_name_disclosure=true: 실제 회사명 노출
// 연락처·이메일은 어떤 경우에도 응답에 포함되지 않음.
// message는 direct_posting(고객사가 통역사를 위해 직접 작성한 노트)에 한해 노출.
function rowToCard(r, viewerIsInterpreter, viewerUserId) {
    const isMatched = !!r.contract_id;
    const isDirectPosting = r.source_type === 'direct_posting';
    const showRealName = viewerIsInterpreter && r.company_name_disclosure && r.company;
    const card = {
        id: r.id,
        sourceType: r.source_type || 'admin_inquiry',
        status: isMatched ? 'matched' : 'recruiting',
        label: showRealName ? r.company : (r.showcase_label || '한국 기업'),
        industry: r.showcase_industry || '',
        isAnonymous: !showRealName,
        countryCode: r.showcase_country_code || '',
        exhibition: r.exhibition_name || '',
        location: r.location || '',
        venue: r.venue || '',
        startDate: r.start_date || '',
        endDate: r.end_date || '',
        languages: parseLanguages(r.language_pair),
        needed: Number.isFinite(r.headcount) ? r.headcount : 1,
        interestCount: r.interest_count || 0
    };
    // direct_posting의 메모만 노출 (admin_inquiry의 message는 customer 사적 요청이라 제외)
    if (isDirectPosting && r.message) {
        card.message = String(r.message).slice(0, 2000);
    }
    // 본인이 올린 공고 식별용 — user_id 노출 없이 boolean만 전달
    if (viewerUserId && r.posted_by_user_id && r.posted_by_user_id === viewerUserId) {
        card.isOwn = true;
    }
    if (isMatched) {
        const d = calcDaysLeft(r.start_date);
        if (d !== null) card.daysLeft = d;
    }
    return card;
}

async function handleShowcase(req, res) {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    try {
        const region = req.query.region ? String(req.query.region).toUpperCase().slice(0, 2) : '';
        const regionValid = region && /^[A-Z]{2}$/.test(region);

        // Phase 4F — viewer 판단 (optional auth header)
        let viewerIsInterpreter = false;
        let viewerUserId = null;
        const authHeader = req.headers.authorization || '';
        const token = authHeader.replace('Bearer ', '');
        if (token) {
            try {
                const { data: { user } } = await sbAuth.auth.getUser(token);
                if (user) {
                    viewerUserId = user.id;
                    const { data: profile } = await supabase.from('01_회원').select('role').eq('id', user.id).single();
                    if (profile && profile.role === 'interpreter') viewerIsInterpreter = true;
                }
            } catch (e) { /* anon 처리 */ }
        }

        // admin_inquiry 쿼리: showcase_consent + showcase_published_at
        let qInquiry = supabase
            .from('46_ITQ견적문의')
            .select(SHOWCASE_COLUMNS)
            .eq('source_type', 'admin_inquiry')
            .eq('showcase_consent', true)
            .not('showcase_published_at', 'is', null)
            .order('showcase_published_at', { ascending: false })
            .limit(60);
        if (regionValid) qInquiry = qInquiry.eq('showcase_country_code', region);

        // direct_posting 쿼리: review_status='approved'
        let qDirect = supabase
            .from('46_ITQ견적문의')
            .select(SHOWCASE_COLUMNS)
            .eq('source_type', 'direct_posting')
            .eq('review_status', 'approved')
            .order('reviewed_at', { ascending: false })
            .limit(60);
        if (regionValid) qDirect = qDirect.eq('showcase_country_code', region);

        const [inq, drc] = await Promise.all([qInquiry, qDirect]);
        if (inq.error) throw inq.error;
        if (drc.error) throw drc.error;

        // Phase 4H — 매칭된 direct_posting 카드 중 매칭 후 N일이 경과한 row는 hidden
        //  매칭 시각: 70_구인공고지원에서 status='matched' row의 updated_at
        const hideSet = new Set();
        const matchedDirectIds = (drc.data || []).filter(r => r.contract_id).map(r => r.id);
        if (matchedDirectIds.length > 0) {
            const cutoff = new Date(Date.now() - SHOWCASE_HIDE_AFTER_DAYS * 86400000);
            const { data: matchedRows } = await supabase
                .from('70_구인공고지원')
                .select('posting_id, updated_at')
                .eq('status', 'matched')
                .in('posting_id', matchedDirectIds);
            (matchedRows || []).forEach(m => {
                if (m.updated_at && new Date(m.updated_at) < cutoff) hideSet.add(m.posting_id);
            });
        }

        // 정렬 키: admin_inquiry는 showcase_published_at, direct_posting은 reviewed_at
        const combined = [...(inq.data || []), ...(drc.data || [])]
            .filter(r => !hideSet.has(r.id))
            .map(r => ({
                row: r,
                sortKey: r.source_type === 'direct_posting' ? r.reviewed_at : r.showcase_published_at
            }))
            .filter(x => x.sortKey)
            .sort((a, b) => new Date(b.sortKey) - new Date(a.sortKey))
            .slice(0, 60)
            .map(x => rowToCard(x.row, viewerIsInterpreter, viewerUserId));

        // viewer별 응답이 달라지므로 로그인 사용자(통역사·고객사)는 비캐시, 비로그인만 공개 캐시
        if (viewerUserId) {
            res.setHeader('Cache-Control', 'no-store');
        } else {
            res.setHeader('Cache-Control', 'public, max-age=60, stale-while-revalidate=30');
        }
        return res.status(200).json(combined);
    } catch (e) {
        console.error('Showcase query error:', e);
        return res.status(500).json({ error: 'Failed to load showcase' });
    }
}

// ────────────────────────── 디스패처 ──────────────────────────
module.exports = async function handler(req, res) {
    const route = req.query._route || '';
    switch (route) {
        case 'cases': return handleCases(req, res);
        case 'reviews': return handleReviews(req, res);
        case 'showcase': return handleShowcase(req, res);
        default: return res.status(404).json({ error: 'Unknown route: ' + route });
    }
};
