const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://jgeqbdrfpekzuumaklvx.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpnZXFiZHJmcGVrenV1bWFrbHZ4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ4MzgwMzQsImV4cCI6MjA5MDQxNDAzNH0.C2y3UiPtHIF2s4nPvbGycN927HOG4YpO86FfgZAelUw';

const sb = createClient(SUPABASE_URL, SERVICE_KEY);
const sbAuth = createClient(SUPABASE_URL, ANON_KEY);

module.exports = async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }
    if (!SERVICE_KEY) {
        return res.status(500).json({ error: '서버 설정 오류' });
    }

    const authHeader = req.headers.authorization || '';
    const token = authHeader.replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: '인증이 필요합니다.' });

    const { data: { user }, error: authErr } = await sbAuth.auth.getUser(token);
    if (authErr || !user) return res.status(401).json({ error: '인증 실패' });

    const b = req.body || {};
    const title = String(b.title || '').trim().slice(0, 200);
    const message = String(b.message || '').trim().slice(0, 2000);
    const notification_type = String(b.notification_type || 'service').trim().slice(0, 50);
    const link = b.link ? String(b.link).trim().slice(0, 500) : null;

    if (!title || !message) {
        return res.status(400).json({ error: 'title과 message가 필요합니다.' });
    }

    try {
        const { data: admins, error: aErr } = await sb
            .from('01_회원')
            .select('id')
            .eq('role', 'admin');
        if (aErr) throw aErr;
        if (!admins || admins.length === 0) {
            return res.status(200).json({ ok: true, notified: 0 });
        }

        const rows = admins.map(function (a) {
            return {
                user_id: a.id,
                notification_type: notification_type,
                title: title,
                message: message,
                link: link,
                is_read: false
            };
        });

        const { error: iErr } = await sb.from('24_알림').insert(rows);
        if (iErr) throw iErr;

        return res.status(200).json({ ok: true, notified: rows.length });
    } catch (e) {
        console.error('notify-admins error:', e);
        return res.status(500).json({ error: '알림 발송 실패' });
    }
};
