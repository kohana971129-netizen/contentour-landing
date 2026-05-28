// 통합 라우터: my-inquiries / my-contracts
// vercel.json rewrites가 옛 URL을 _route 쿼리로 매핑

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://jgeqbdrfpekzuumaklvx.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpnZXFiZHJmcGVrenV1bWFrbHZ4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ4MzgwMzQsImV4cCI6MjA5MDQxNDAzNH0.C2y3UiPtHIF2s4nPvbGycN927HOG4YpO86FfgZAelUw';

const sb = createClient(SUPABASE_URL, SERVICE_KEY);
const sbAuth = createClient(SUPABASE_URL, ANON_KEY);

async function authenticate(req) {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.replace('Bearer ', '');
    if (!token) return { error: '인증이 필요합니다.', status: 401 };
    const { data: { user }, error } = await sbAuth.auth.getUser(token);
    if (error || !user) return { error: '인증 실패', status: 401 };
    return { user };
}

// ────────────────────────── my-inquiries ──────────────────────────
async function handleMyInquiries(req, res) {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
    const auth = await authenticate(req);
    if (auth.error) return res.status(auth.status).json({ error: auth.error });

    const { data: profile } = await sb.from('01_회원').select('role, name').eq('id', auth.user.id).single();
    if (!profile || (profile.role !== 'interpreter' && profile.role !== 'admin')) {
        return res.status(403).json({ error: '통역사 권한이 필요합니다.' });
    }

    try {
        const { data, error } = await sb
            .from('46_ITQ견적문의')
            .select('*')
            .like('admin_note', '%"inquiry_type":"direct"%')
            .order('created_at', { ascending: false });
        if (error) throw error;

        const filtered = (data || []).filter(d => {
            try {
                const note = typeof d.admin_note === 'string' ? JSON.parse(d.admin_note) : d.admin_note;
                if (!note || note.inquiry_type !== 'direct') return false;
                // 본인 user.id로 지정된 의뢰만 (이름 매칭 fallback 제거 — 동명이인 누출 방지)
                return note.requested_interpreter_id === auth.user.id;
            } catch (e) { return false; }
        });

        return res.status(200).json(filtered);
    } catch (e) {
        console.error('My inquiries error:', e);
        return res.status(500).json({ error: e.message });
    }
}

// ────────────────────────── my-contracts ──────────────────────────
async function handleMyContracts(req, res) {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
    const auth = await authenticate(req);
    if (auth.error) return res.status(auth.status).json({ error: auth.error });

    const { data: profile } = await sb.from('01_회원').select('role, name').eq('id', auth.user.id).single();
    if (!profile) return res.status(404).json({ error: '회원 정보를 찾을 수 없습니다.' });

    try {
        let query = sb.from('42_통역계약').select('*');
        if (profile.role === 'customer') query = query.eq('customer_id', auth.user.id);
        else if (profile.role === 'interpreter') query = query.eq('interpreter_id', auth.user.id);
        else if (profile.role !== 'admin') return res.status(403).json({ error: '접근 권한이 없습니다.' });

        const { data: contracts, error } = await query.order('created_at', { ascending: false });
        if (error) throw error;

        const userIds = new Set();
        contracts.forEach(c => {
            if (c.interpreter_id) userIds.add(c.interpreter_id);
            if (c.customer_id) userIds.add(c.customer_id);
        });

        let nameMap = {};
        if (userIds.size > 0) {
            const { data: users } = await sb.from('01_회원').select('id, name, email').in('id', Array.from(userIds));
            if (users) users.forEach(u => { nameMap[u.id] = u; });
        }

        const interpIds = contracts.map(c => c.interpreter_id).filter(Boolean);
        let interpMap = {};
        if (interpIds.length > 0) {
            const { data: profiles } = await sb.from('40_통역사프로필')
                .select('user_id, display_name, languages, profile_image_url').in('user_id', interpIds);
            if (profiles) profiles.forEach(p => { interpMap[p.user_id] = p; });
        }

        const result = contracts.map(c => ({
            ...c,
            _interpreterName: (interpMap[c.interpreter_id] || {}).display_name || (nameMap[c.interpreter_id] || {}).name || '통역사',
            _interpreterPhoto: (interpMap[c.interpreter_id] || {}).profile_image_url || '',
            _interpreterLangs: (interpMap[c.interpreter_id] || {}).languages || [],
            _customerName: (nameMap[c.customer_id] || {}).name || '고객',
            _customerEmail: (nameMap[c.customer_id] || {}).email || ''
        }));

        res.setHeader('Cache-Control', 'no-cache');
        return res.status(200).json(result);
    } catch (e) {
        console.error('Contracts query error:', e);
        return res.status(500).json({ error: e.message });
    }
}

// ────────────────────────── my-showcase-postings ──────────────────────────
// 로그인 고객사 본인이 등록한 통역사 구인공고 목록 + 지원자/매칭 카운트
async function handleMyShowcasePostings(req, res) {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
    const auth = await authenticate(req);
    if (auth.error) return res.status(auth.status).json({ error: auth.error });

    const { data: profile } = await sb.from('01_회원').select('role').eq('id', auth.user.id).single();
    if (!profile || profile.role !== 'customer') {
        return res.status(403).json({ error: '고객사 권한이 필요합니다.' });
    }

    try {
        const { data, error } = await sb
            .from('46_ITQ견적문의')
            .select('id, exhibition_name, location, venue, start_date, end_date, language_pair, headcount, message, showcase_label, showcase_industry, showcase_country_code, company_name_disclosure, review_status, review_note, reviewed_at, contract_id, created_at')
            .eq('source_type', 'direct_posting')
            .eq('posted_by_user_id', auth.user.id)
            .order('created_at', { ascending: false });
        if (error) throw error;

        const postingIds = (data || []).map(d => d.id);
        const countsMap = {};
        if (postingIds.length > 0) {
            const { data: apps } = await sb
                .from('70_구인공고지원')
                .select('posting_id, status')
                .in('posting_id', postingIds);
            (apps || []).forEach(a => {
                if (!countsMap[a.posting_id]) countsMap[a.posting_id] = { total: 0, matched: 0 };
                countsMap[a.posting_id].total += 1;
                if (a.status === 'matched') countsMap[a.posting_id].matched += 1;
            });
        }

        const result = (data || []).map(d => ({
            ...d,
            _applicants_count: countsMap[d.id] ? countsMap[d.id].total : 0,
            _matched_count: countsMap[d.id] ? countsMap[d.id].matched : 0
        }));

        res.setHeader('Cache-Control', 'no-cache');
        return res.status(200).json(result);
    } catch (e) {
        console.error('My showcase postings error:', e);
        return res.status(500).json({ error: e.message });
    }
}

// ────────────────────────── my-showcase-applications ──────────────────────────
// 로그인 통역사 본인이 지원한 구인공고 목록 + 공고 정보 join
async function handleMyShowcaseApplications(req, res) {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
    const auth = await authenticate(req);
    if (auth.error) return res.status(auth.status).json({ error: auth.error });

    const { data: profile } = await sb.from('01_회원').select('role').eq('id', auth.user.id).single();
    if (!profile || profile.role !== 'interpreter') {
        return res.status(403).json({ error: '통역사 권한이 필요합니다.' });
    }

    try {
        const { data: apps, error } = await sb
            .from('70_구인공고지원')
            .select('id, posting_id, status, applied_at, updated_at, contract_id')
            .eq('interpreter_id', auth.user.id)
            .order('applied_at', { ascending: false });
        if (error) throw error;
        if (!apps || apps.length === 0) {
            res.setHeader('Cache-Control', 'no-cache');
            return res.status(200).json([]);
        }

        const postingIds = Array.from(new Set(apps.map(a => a.posting_id)));
        const { data: postings } = await sb
            .from('46_ITQ견적문의')
            .select('id, exhibition_name, location, venue, start_date, end_date, language_pair, headcount, showcase_label, showcase_industry, showcase_country_code, review_status, contract_id, company_name_disclosure, company')
            .in('id', postingIds);
        const postingMap = {};
        (postings || []).forEach(p => { postingMap[p.id] = p; });

        const result = apps.map(a => {
            const p = postingMap[a.posting_id] || {};
            const label = (p.company_name_disclosure && p.company) ? p.company : (p.showcase_label || '한국 기업');
            return {
                id: a.id,
                posting_id: a.posting_id,
                status: a.status,
                applied_at: a.applied_at,
                updated_at: a.updated_at,
                contract_id: a.contract_id,
                label,
                isAnonymous: !(p.company_name_disclosure && p.company),
                exhibition: p.exhibition_name || '',
                location: p.location || '',
                venue: p.venue || '',
                start_date: p.start_date || '',
                end_date: p.end_date || '',
                language_pair: p.language_pair || '',
                headcount: p.headcount || 0,
                industry: p.showcase_industry || '',
                country_code: p.showcase_country_code || '',
                posting_review_status: p.review_status,
                posting_contract_id: p.contract_id
            };
        });

        res.setHeader('Cache-Control', 'no-cache');
        return res.status(200).json(result);
    } catch (e) {
        console.error('My showcase applications error:', e);
        return res.status(500).json({ error: e.message });
    }
}

// ────────────────────────── my-showcase-applicants ──────────────────────────
// 로그인 고객사가 본인 공고의 지원자 목록·프로필 조회. 연락처(이메일·전화)는 제외 — 계약 전 비공개.
async function handleMyShowcaseApplicants(req, res) {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
    const auth = await authenticate(req);
    if (auth.error) return res.status(auth.status).json({ error: auth.error });

    const { data: profile } = await sb.from('01_회원').select('role').eq('id', auth.user.id).single();
    if (!profile || profile.role !== 'customer') {
        return res.status(403).json({ error: '고객사 권한이 필요합니다.' });
    }

    const postingId = req.query.posting_id ? String(req.query.posting_id).trim() : '';
    if (!postingId) return res.status(400).json({ error: 'posting_id 필수' });

    // 본인 소유 공고 확인
    const { data: posting } = await sb
        .from('46_ITQ견적문의')
        .select('id, posted_by_user_id, source_type, review_status, contract_id')
        .eq('id', postingId).single();
    if (!posting || posting.posted_by_user_id !== auth.user.id || posting.source_type !== 'direct_posting') {
        return res.status(403).json({ error: '본인이 등록한 공고만 조회할 수 있습니다.' });
    }

    try {
        const { data: apps, error } = await sb
            .from('70_구인공고지원')
            .select('id, interpreter_id, status, applied_at')
            .eq('posting_id', postingId)
            .order('applied_at', { ascending: false });
        if (error) throw error;

        const result = { posting: { id: posting.id, matched: !!posting.contract_id, review_status: posting.review_status }, applicants: [] };
        if (apps && apps.length > 0) {
            const ids = apps.map(a => a.interpreter_id);
            const { data: profs } = await sb.from('40_통역사프로필')
                .select('user_id, display_name, languages, specialties, experience_years, base_rate, intro, profile_image_url, rating')
                .in('user_id', ids);
            const profMap = {}; (profs || []).forEach(p => { profMap[p.user_id] = p; });
            result.applicants = apps.map(a => {
                const p = profMap[a.interpreter_id] || {};
                return {
                    application_id: a.id,
                    interpreter_id: a.interpreter_id,
                    status: a.status,
                    applied_at: a.applied_at,
                    display_name: p.display_name || '통역사',
                    languages: p.languages || [],
                    specialties: p.specialties || [],
                    experience_years: p.experience_years || 0,
                    base_rate: p.base_rate || null,
                    intro: p.intro || '',
                    profile_image_url: p.profile_image_url || '',
                    rating: p.rating || null
                };
            });
        }
        res.setHeader('Cache-Control', 'no-store');
        return res.status(200).json(result);
    } catch (e) {
        console.error('My showcase applicants error:', e);
        return res.status(500).json({ error: e.message });
    }
}

// ────────────────────────── 디스패처 ──────────────────────────
module.exports = async function handler(req, res) {
    if (!SERVICE_KEY) return res.status(500).json({ error: '서버 설정 오류' });

    const route = req.query._route || '';
    switch (route) {
        case 'my-inquiries': return handleMyInquiries(req, res);
        case 'my-contracts': return handleMyContracts(req, res);
        case 'my-showcase-postings': return handleMyShowcasePostings(req, res);
        case 'my-showcase-applications': return handleMyShowcaseApplications(req, res);
        case 'my-showcase-applicants': return handleMyShowcaseApplicants(req, res);
        default: return res.status(404).json({ error: 'Unknown route: ' + route });
    }
};
