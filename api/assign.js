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
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    // 관리자 인증 확인
    const authHeader = req.headers.authorization || '';
    const token = authHeader.replace('Bearer ', '');
    const admin = await verifyAdmin(token);
    if (!admin) {
        return res.status(403).json({ error: '관리자 권한이 필요합니다.' });
    }

    const {
        inquiryId,
        interpreterId,
        interpreterName,
        status,
        memo,
        expo,
        company,
        venue,
        location,
        startDate,
        endDate,
        lang,
        type,
        email
    } = req.body;

    if (!inquiryId || !interpreterId) {
        return res.status(400).json({ error: '필수 정보가 누락되었습니다.' });
    }

    try {
        // 1. 견적문의 상태 업데이트
        const dbStatusMap = { '검토중': '검토중', '매칭완료': '견적발송', '파견확정': '계약진행', '완료': '완료' };
        const dbStatus = dbStatusMap[status] || '검토중';

        await sb.from('46_ITQ견적문의').update({
            status: dbStatus,
            admin_note: JSON.stringify({
                interpreter: interpreterName,
                interpreterId: interpreterId,
                memo: memo || ''
            })
        }).eq('id', inquiryId);

        // 2. 근무일수 / 단가 계산
        let days = 1;
        if (startDate && endDate) {
            const diffMs = new Date(endDate) - new Date(startDate);
            days = Math.max(1, Math.round(diffMs / 86400000) + 1);
        }

        const langMap = { '영어': 'KO-EN', '일본어': 'KO-JA', '중국어': 'KO-ZH', '독일어': 'KO-DE', '베트남어': 'KO-VI', '아랍어': 'KO-AR', '태국어': 'KO-TH' };
        const langPair = langMap[lang] || lang || '';
        const serviceMap = { '부스 상주': 'BOOTH', '미팅 동행': 'MEETING', '현장 운영': 'ONSITE_OPS' };
        const serviceType = serviceMap[type] || 'OTHER';

        let dailyRate = 250000;
        const { data: interpProfile } = await sb.from('40_통역사프로필').select('base_rate').eq('user_id', interpreterId).single();
        if (interpProfile && interpProfile.base_rate) dailyRate = interpProfile.base_rate;

        const totalAmount = dailyRate * days;

        // 3. 고객 user_id 조회
        let customerId = null;
        if (email) {
            const { data: custUser } = await sb.from('01_회원').select('id').eq('email', email).single();
            if (custUser) customerId = custUser.id;
        }

        // 4. 중복 방지 후 계약 생성
        const { data: existing } = await sb.from('42_통역계약')
            .select('id')
            .eq('interpreter_id', interpreterId)
            .eq('exhibition_name', expo || '')
            .eq('start_date', startDate)
            .limit(1);

        let contractId = existing && existing.length > 0 ? existing[0].id : null;

        if (!contractId) {
            const { data: newContract, error: cErr } = await sb.from('42_통역계약').insert({
                order_id: inquiryId,
                customer_id: customerId,
                interpreter_id: interpreterId,
                exhibition_name: expo || '',
                client_company: company || '',
                venue: venue || location || '',
                start_date: startDate,
                end_date: endDate,
                working_days: days,
                language_pair: langPair,
                service_type: serviceType,
                daily_rate: dailyRate,
                total_amount: totalAmount,
                tax_amount: Math.round(totalAmount * 0.1),
                net_amount: totalAmount,
                status: 'pending'
            }).select().single();

            if (cErr) {
                console.error('계약 생성 실패:', cErr);
                return res.status(500).json({ error: '계약 생성 실패: ' + cErr.message });
            }
            contractId = newContract.id;

            // 견적문의에 계약 ID 연결
            await sb.from('46_ITQ견적문의').update({ contract_id: contractId }).eq('id', inquiryId);
        }

        // 5. 고객사 알림 발송
        if (customerId) {
            await sb.from('24_알림').insert({
                user_id: customerId,
                notification_type: 'service',
                title: '🤝 통역사가 배정되었습니다',
                message: '"' + (expo || '') + '" 건에 ' + interpreterName + ' 통역사가 배정되었습니다. 계약·결제 탭에서 확인해주세요.',
                is_read: false
            });
        }

        return res.status(200).json({ ok: true, contractId });
    } catch (e) {
        console.error('Assign error:', e);
        return res.status(500).json({ error: e.message });
    }
};
