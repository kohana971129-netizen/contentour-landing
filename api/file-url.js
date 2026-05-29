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

    // 관리자 인증 확인
    const authHeader = req.headers.authorization || '';
    const token = authHeader.replace('Bearer ', '');
    if (!token) return res.status(403).json({ error: '인증이 필요합니다.' });

    const { data: { user }, error: authErr } = await sbAuth.auth.getUser(token);
    if (authErr || !user) return res.status(403).json({ error: '인증 실패' });

    const { data: profile } = await sb.from('01_회원').select('role').eq('id', user.id).single();
    if (!profile || profile.role !== 'admin') return res.status(403).json({ error: '관리자 권한이 필요합니다.' });

    // 파일 경로 파라미터
    const filePath = req.query.path;
    const bucket = req.query.bucket || 'interpreter-docs';
    if (!filePath) return res.status(400).json({ error: 'path 파라미터가 필요합니다.' });

    // 버킷 화이트리스트 — 임의 비공개 버킷 접근 차단
    const ALLOWED_BUCKETS = ['interpreter-docs', 'business-registrations'];
    if (!ALLOWED_BUCKETS.includes(bucket)) {
        return res.status(400).json({ error: '허용되지 않은 버킷입니다.' });
    }
    // 경로 탈출 차단
    if (filePath.includes('..') || filePath.startsWith('/')) {
        return res.status(400).json({ error: '잘못된 경로입니다.' });
    }

    try {
        const { data, error } = await sb.storage.from(bucket).createSignedUrl(filePath, 300); // 5분 유효
        if (error) throw error;
        return res.status(200).json({ url: data.signedUrl });
    } catch (e) {
        console.error('Signed URL 생성 실패:', e);
        return res.status(500).json({ error: e.message });
    }
};
