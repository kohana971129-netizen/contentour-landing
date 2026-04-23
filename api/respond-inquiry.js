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

    // 통역사 인증 확인
    const authHeader = req.headers.authorization || '';
    const token = authHeader.replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: '인증이 필요합니다.' });

    const { data: { user }, error: authErr } = await sbAuth.auth.getUser(token);
    if (authErr || !user) return res.status(401).json({ error: '인증 실패' });

    const { inquiryId, responseMessage } = req.body;
    if (!inquiryId || !responseMessage) {
        return res.status(400).json({ error: '필수 항목이 누락되었습니다.' });
    }

    try {
        // 견적문의 조회 (고객 user_id 포함)
        const { data: inquiry, error: fetchErr } = await sb
            .from('46_ITQ견적문의')
            .select('admin_note, user_id, exhibition_name')
            .eq('id', inquiryId)
            .single();

        if (fetchErr || !inquiry) {
            return res.status(404).json({ error: '견적 요청을 찾을 수 없습니다.' });
        }

        // admin_note 업데이트
        let note = {};
        try { note = typeof inquiry.admin_note === 'string' ? JSON.parse(inquiry.admin_note) : (inquiry.admin_note || {}); } catch (e) {}

        note.interpreter_responded = true;
        note.response_message = responseMessage;
        note.responded_at = new Date().toISOString();
        note.responded_by = user.id;

        const { error: updateErr } = await sb
            .from('46_ITQ견적문의')
            .update({
                admin_note: JSON.stringify(note),
                status: '검토중'
            })
            .eq('id', inquiryId);

        if (updateErr) throw updateErr;

        // 고객에게 DB 알림 발송
        const customerUserId = inquiry.user_id || note.customer_user_id;
        if (customerUserId) {
            // 통역사 이름 조회
            const { data: interpProfile } = await sb
                .from('40_통역사프로필')
                .select('display_name')
                .eq('user_id', user.id)
                .single();
            const interpName = interpProfile?.display_name || '통역사';
            const expoName = inquiry.exhibition_name || '전시회';

            await sb.from('24_알림').insert({
                user_id: customerUserId,
                notification_type: 'quote',
                title: '💬 통역사가 견적 의뢰에 응답했습니다',
                message: `"${expoName}" 건에 대해 ${interpName} 통역사가 응답했습니다: "${responseMessage}"`,
                is_read: false
            });
        }

        return res.status(200).json({ ok: true, notifiedCustomer: !!customerUserId });
    } catch (e) {
        console.error('Respond inquiry error:', e);
        return res.status(500).json({ error: e.message });
    }
};
