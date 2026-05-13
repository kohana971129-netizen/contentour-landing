// 통합 라우터: cases / reviews
// vercel.json rewrites가 옛 URL을 _route 쿼리로 매핑

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    'https://jgeqbdrfpekzuumaklvx.supabase.co',
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

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

// ────────────────────────── 디스패처 ──────────────────────────
module.exports = async function handler(req, res) {
    const route = req.query._route || '';
    switch (route) {
        case 'cases': return handleCases(req, res);
        case 'reviews': return handleReviews(req, res);
        default: return res.status(404).json({ error: 'Unknown route: ' + route });
    }
};
