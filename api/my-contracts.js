const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://jgeqbdrfpekzuumaklvx.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpnZXFiZHJmcGVrenV1bWFrbHZ4Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDgzODAzNCwiZXhwIjoyMDkwNDE0MDM0fQ.ODEPG-6DGVizArFl5pOHguhGbgTniBaHyA_W81ta9YA';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpnZXFiZHJmcGVrenV1bWFrbHZ4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ4MzgwMzQsImV4cCI6MjA5MDQxNDAzNH0.C2y3UiPtHIF2s4nPvbGycN927HOG4YpO86FfgZAelUw';

const sb = createClient(SUPABASE_URL, SERVICE_KEY);
const sbAuth = createClient(SUPABASE_URL, ANON_KEY);

module.exports = async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    // 사용자 인증 확인
    const authHeader = req.headers.authorization || '';
    const token = authHeader.replace('Bearer ', '');
    if (!token) {
        return res.status(401).json({ error: '로그인이 필요합니다.' });
    }

    const { data: { user }, error: authErr } = await sbAuth.auth.getUser(token);
    if (authErr || !user) {
        return res.status(401).json({ error: '인증이 만료되었습니다.' });
    }

    // 역할 조회
    const { data: profile } = await sb.from('01_회원').select('role, name').eq('id', user.id).single();
    if (!profile) {
        return res.status(404).json({ error: '회원 정보를 찾을 수 없습니다.' });
    }

    try {
        let query = sb.from('42_통역계약').select('*');

        if (profile.role === 'customer') {
            query = query.eq('customer_id', user.id);
        } else if (profile.role === 'interpreter') {
            query = query.eq('interpreter_id', user.id);
        } else if (profile.role === 'admin') {
            // admin은 모든 계약 조회 가능
        } else {
            return res.status(403).json({ error: '접근 권한이 없습니다.' });
        }

        const { data: contracts, error } = await query.order('created_at', { ascending: false });

        if (error) throw error;

        // 통역사/고객 이름 매핑
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

        // 통역사 프로필 정보
        const interpIds = contracts.map(c => c.interpreter_id).filter(Boolean);
        let interpMap = {};
        if (interpIds.length > 0) {
            const { data: profiles } = await sb.from('40_통역사프로필').select('user_id, display_name, languages, profile_image_url').in('user_id', interpIds);
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
};
