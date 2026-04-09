const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://jgeqbdrfpekzuumaklvx.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpnZXFiZHJmcGVrenV1bWFrbHZ4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ4MzgwMzQsImV4cCI6MjA5MDQxNDAzNH0.C2y3UiPtHIF2s4nPvbGycN927HOG4YpO86FfgZAelUw';

const sb = createClient(SUPABASE_URL, SERVICE_KEY);
const sbAuth = createClient(SUPABASE_URL, ANON_KEY);

module.exports = async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    // 통역사 인증 확인
    const authHeader = req.headers.authorization || '';
    const token = authHeader.replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: '인증이 필요합니다.' });

    const { data: { user }, error: authErr } = await sbAuth.auth.getUser(token);
    if (authErr || !user) return res.status(401).json({ error: '인증 실패' });

    // 통역사 프로필 확인
    const { data: profile } = await sb
        .from('01_회원')
        .select('role, name')
        .eq('id', user.id)
        .single();

    if (!profile || (profile.role !== 'interpreter' && profile.role !== 'admin')) {
        return res.status(403).json({ error: '통역사 권한이 필요합니다.' });
    }

    // 통역사 display_name 조회
    const { data: interpProfile } = await sb
        .from('40_통역사프로필')
        .select('display_name')
        .eq('user_id', user.id)
        .single();

    const displayName = interpProfile?.display_name || profile.name || '';

    try {
        // 직접 의뢰 조회 (admin_note에 inquiry_type: direct 포함)
        const { data, error } = await sb
            .from('46_ITQ견적문의')
            .select('*')
            .like('admin_note', '%"inquiry_type":"direct"%')
            .order('created_at', { ascending: false });

        if (error) throw error;

        // 이 통역사에게 온 요청만 필터
        const filtered = (data || []).filter(d => {
            try {
                const note = typeof d.admin_note === 'string' ? JSON.parse(d.admin_note) : d.admin_note;
                if (!note || note.inquiry_type !== 'direct') return false;
                return note.requested_interpreter_id === user.id || note.interpreter_name === displayName;
            } catch (e) { return false; }
        });

        return res.status(200).json(filtered);
    } catch (e) {
        console.error('My inquiries error:', e);
        return res.status(500).json({ error: e.message });
    }
};
