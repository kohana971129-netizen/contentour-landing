const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://jgeqbdrfpekzuumaklvx.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpnZXFiZHJmcGVrenV1bWFrbHZ4Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDgzODAzNCwiZXhwIjoyMDkwNDE0MDM0fQ.ODEPG-6DGVizArFl5pOHguhGbgTniBaHyA_W81ta9YA';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpnZXFiZHJmcGVrenV1bWFrbHZ4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ4MzgwMzQsImV4cCI6MjA5MDQxNDAzNH0.C2y3UiPtHIF2s4nPvbGycN927HOG4YpO86FfgZAelUw';

const sb = createClient(SUPABASE_URL, SERVICE_KEY);
const sbAuth = createClient(SUPABASE_URL, ANON_KEY);

async function verifyAdmin(token) {
    if (!token) return null;
    const { data: { user }, error } = await sbAuth.auth.getUser(token);
    if (error || !user) return null;
    const { data: profile } = await sb.from('01_회원').select('role').eq('id', user.id).single();
    if (!profile || profile.role !== 'admin') return null;
    return user;
}

module.exports = async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const authHeader = req.headers.authorization || '';
    const token = authHeader.replace('Bearer ', '');
    const admin = await verifyAdmin(token);
    if (!admin) {
        return res.status(403).json({ error: '관리자 권한이 필요합니다.' });
    }

    try {
        const { data, error } = await sb
            .from('46_ITQ견적문의')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) throw error;

        res.setHeader('Cache-Control', 'no-cache');
        return res.status(200).json(data || []);
    } catch (e) {
        console.error('Inquiries query error:', e);
        return res.status(500).json({ error: e.message });
    }
};
