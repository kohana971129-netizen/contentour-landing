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

    // 고객 인증 확인 (필수)
    const authHeader = req.headers.authorization || '';
    const token = authHeader.replace('Bearer ', '');
    if (!token) {
        return res.status(401).json({ error: '로그인이 필요합니다.' });
    }

    const { data: { user }, error: authErr } = await sbAuth.auth.getUser(token);
    if (authErr || !user) {
        return res.status(401).json({ error: '인증 실패. 다시 로그인해주세요.' });
    }

    const {
        interpreterName,
        interpreterId,
        interpreterLang,
        interpreterField,
        company,
        contactName,
        email,
        phone,
        exhibitionName,
        location,
        period,
        serviceType,
        message
    } = req.body;

    if (!company || !contactName || !email || !phone || !exhibitionName || !message) {
        return res.status(400).json({ error: '필수 항목이 누락되었습니다.' });
    }

    try {
        // 기간 텍스트에서 날짜 파싱 (예: "2026.05.01 ~ 05.03", "2026.11.17~11.20")
        let startDate = new Date().toISOString().slice(0, 10);
        let endDate = startDate;
        if (period) {
            const cleaned = period.replace(/\s/g, '');
            const parts = cleaned.split('~');
            if (parts.length === 2) {
                const p1 = parts[0].replace(/\./g, '-');
                const p2 = parts[1].replace(/\./g, '-');
                const yearMatch = p1.match(/^(\d{4})/);
                const year = yearMatch ? yearMatch[1] : new Date().getFullYear().toString();
                if (p1.match(/^\d{4}-/)) startDate = p1;
                if (p2.match(/^\d{4}-/)) endDate = p2;
                else if (p2.match(/^\d{2}-\d{2}$/)) endDate = year + '-' + p2;
            }
        }

        // 1. 견적문의 테이블에 저장 (고객 user_id 포함)
        const { data: inquiry, error: insertErr } = await sb
            .from('46_ITQ견적문의')
            .insert({
                user_id: user.id,
                company,
                contact_name: contactName,
                email,
                phone,
                exhibition_name: exhibitionName,
                location: location || null,
                start_date: startDate,
                end_date: endDate,
                language_pair: interpreterLang || null,
                service_type: serviceType || null,
                message,
                consent: true,
                status: '접수',
                admin_note: JSON.stringify({
                    inquiry_type: 'direct',
                    customer_user_id: user.id,
                    requested_interpreter_id: interpreterId || null,
                    interpreter_name: interpreterName || '',
                    interpreter_lang: interpreterLang || '',
                    interpreter_field: interpreterField || '',
                    period: period || ''
                })
            })
            .select()
            .single();

        if (insertErr) {
            console.error('견적문의 저장 실패:', insertErr);
            return res.status(500).json({ error: '저장 실패: ' + insertErr.message });
        }

        // 2. 통역사 user_id 조회 (DB 등록 통역사인 경우)
        let interpreterUserId = interpreterId || null;

        if (!interpreterUserId && interpreterName) {
            const { data: interpProfile } = await sb
                .from('40_통역사프로필')
                .select('user_id')
                .eq('display_name', interpreterName)
                .eq('is_active', true)
                .limit(1)
                .single();

            if (interpProfile) {
                interpreterUserId = interpProfile.user_id;
            }
        }

        // 3. 통역사에게 알림 발송
        if (interpreterUserId) {
            await sb.from('24_알림').insert({
                user_id: interpreterUserId,
                notification_type: 'service',
                title: '📩 새로운 직접 견적 의뢰',
                message: `${company}에서 "${exhibitionName}" 건으로 직접 견적을 의뢰했습니다. 견적 요청 탭에서 확인해주세요.`,
                is_read: false
            });
        }

        return res.status(200).json({
            ok: true,
            inquiryId: inquiry.id,
            notified: !!interpreterUserId
        });

    } catch (e) {
        console.error('Direct inquiry error:', e);
        return res.status(500).json({ error: e.message });
    }
};
