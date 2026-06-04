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

    // 고객(customer) 회원만 직접 견적 요청 가능
    const { data: reqProfile } = await sb.from('01_회원').select('role').eq('id', user.id).single();
    if (!reqProfile || reqProfile.role !== 'customer') {
        return res.status(403).json({ error: '고객 회원만 직접 견적을 요청할 수 있습니다.' });
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

    // 입력 검증 (길이 제한 · 이메일 형식)
    const _t = (v, n) => String(v == null ? '' : v).trim().slice(0, n);
    const company_ = _t(company, 200);
    const contactName_ = _t(contactName, 100);
    const email_ = _t(email, 200);
    const phone_ = _t(phone, 50);
    const exhibitionName_ = _t(exhibitionName, 200);
    const location_ = _t(location, 200);
    const period_ = _t(period, 100);
    const message_ = _t(message, 2000);
    const interpreterName_ = _t(interpreterName, 100);
    const interpreterLang_ = _t(interpreterLang, 100);
    const interpreterField_ = _t(interpreterField, 100);

    if (!company_ || !contactName_ || !email_ || !phone_ || !exhibitionName_ || !message_) {
        return res.status(400).json({ error: '필수 항목이 누락되었습니다.' });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email_)) {
        return res.status(400).json({ error: '올바른 이메일 형식이 아닙니다.' });
    }

    try {
        // 기간 텍스트에서 날짜 파싱 (예: "2026.05.01 ~ 05.03", "2026.11.17~11.20")
        let startDate = new Date().toISOString().slice(0, 10);
        let endDate = startDate;
        if (period_) {
            const cleaned = period_.replace(/\s/g, '');
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
                company: company_,
                contact_name: contactName_,
                email: email_,
                phone: phone_,
                exhibition_name: exhibitionName_,
                location: location_ || null,
                start_date: startDate,
                end_date: endDate,
                language_pair: interpreterLang_ || null,
                service_type: serviceType || null,
                message: message_,
                consent: true,
                status: '접수',
                admin_note: JSON.stringify({
                    inquiry_type: 'direct',
                    customer_user_id: user.id,
                    requested_interpreter_id: interpreterId || null,
                    interpreter_name: interpreterName_,
                    interpreter_lang: interpreterLang_,
                    interpreter_field: interpreterField_,
                    period: period_
                })
            })
            .select()
            .single();

        if (insertErr) {
            console.error('견적문의 저장 실패:', insertErr);
            return res.status(500).json({ error: '견적 저장에 실패했습니다. 잠시 후 다시 시도해주세요.' });
        }

        // 2. 통역사 user_id 검증·조회 (임의 user_id로 알림 발송 방지)
        let interpreterUserId = null;

        if (interpreterId) {
            const { data: byId } = await sb
                .from('40_통역사프로필')
                .select('user_id')
                .eq('user_id', interpreterId)
                .eq('is_active', true)
                .limit(1)
                .single();
            if (byId) interpreterUserId = byId.user_id;
        }

        if (!interpreterUserId && interpreterName_) {
            const { data: interpProfile } = await sb
                .from('40_통역사프로필')
                .select('user_id')
                .eq('display_name', interpreterName_)
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
                message: `${company_}에서 "${exhibitionName_}" 건으로 직접 견적을 의뢰했습니다. 견적 요청 탭에서 확인해주세요.`,
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
        return res.status(500).json({ error: '요청 처리 중 오류가 발생했습니다.' });
    }
};
