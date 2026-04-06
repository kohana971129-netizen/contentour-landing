const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    'https://jgeqbdrfpekzuumaklvx.supabase.co',
    process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpnZXFiZHJmcGVrenV1bWFrbHZ4Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDgzODAzNCwiZXhwIjoyMDkwNDE0MDM0fQ.ODEPG-6DGVizArFl5pOHguhGbgTniBaHyA_W81ta9YA'
);

module.exports = async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        // 리뷰 조회
        const { data: reviews, error: revErr } = await supabase
            .from('49_통역사리뷰')
            .select('customer_id, interpreter_id, exhibition_name, rating_expertise, rating_manner, rating_communication, rating_overall, review_text, created_at')
            .not('review_text', 'is', null)
            .order('created_at', { ascending: false })
            .limit(8);

        if (revErr) throw revErr;
        if (!reviews || reviews.length === 0) {
            return res.status(200).json([]);
        }

        // 고객 정보 매핑
        const custIds = reviews.map(r => r.customer_id).filter(Boolean);
        let custMap = {};

        if (custIds.length > 0) {
            const { data: customers } = await supabase
                .from('01_회원')
                .select('id, name')
                .in('id', custIds);

            if (customers) {
                customers.forEach(c => { custMap[c.id] = c; });
            }
        }

        // 고객사 정보 조회 (02_국내기업에서 이메일로 매칭)
        const customerEmails = [];
        for (const cid of custIds) {
            const { data: member } = await supabase
                .from('01_회원')
                .select('email')
                .eq('id', cid)
                .single();
            if (member) customerEmails.push({ id: cid, email: member.email });
        }

        let companyMap = {};
        for (const ce of customerEmails) {
            const { data: company } = await supabase
                .from('02_국내기업')
                .select('name')
                .eq('contact_email', ce.email)
                .single();
            if (company) companyMap[ce.id] = company.name;
        }

        // 통역사 정보 매핑
        const interpIds = reviews.map(r => r.interpreter_id).filter(Boolean);
        let interpMap = {};
        if (interpIds.length > 0) {
            const { data: interps } = await supabase
                .from('40_통역사프로필')
                .select('user_id, display_name')
                .in('user_id', interpIds);
            if (interps) interps.forEach(p => { interpMap[p.user_id] = p.display_name; });
        }

        // 응답 구성
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
};
