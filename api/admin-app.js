const { createClient } = require('@supabase/supabase-js');
const { Resend } = require('resend');

const SUPABASE_URL = 'https://jgeqbdrfpekzuumaklvx.supabase.co';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpnZXFiZHJmcGVrenV1bWFrbHZ4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ4MzgwMzQsImV4cCI6MjA5MDQxNDAzNH0.C2y3UiPtHIF2s4nPvbGycN927HOG4YpO86FfgZAelUw';

const supabase = createClient(SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const sbAuth = createClient(SUPABASE_URL, ANON_KEY);

async function verifyAdmin(token) {
    if (!token) return null;
    const { data: { user }, error } = await sbAuth.auth.getUser(token);
    if (error || !user) return null;
    const { data: profile } = await supabase.from('01_회원').select('role').eq('id', user.id).single();
    if (!profile || profile.role !== 'admin') return null;
    return user;
}

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

async function sendApprovalEmail(email, name, tempPw) {
    if (!resend) {
        console.log('RESEND_API_KEY 미설정 — 이메일 발송 생략');
        return { success: false, reason: 'no_api_key' };
    }

    try {
        const { data, error } = await resend.emails.send({
            from: '콘텐츄어 <noreply@contentour.co.kr>',
            to: email,
            subject: '[콘텐츄어] 통역사 계정이 승인되었습니다',
            html: `
                <div style="max-width:600px;margin:0 auto;font-family:'Noto Sans KR',sans-serif;color:#1a2a4a;">
                    <div style="background:linear-gradient(135deg,#0a2a5e,#1565c0);padding:32px;text-align:center;border-radius:16px 16px 0 0;">
                        <h1 style="color:#fff;font-size:1.4rem;margin:0;">CONTENTOUR</h1>
                        <p style="color:rgba(255,255,255,0.7);font-size:0.85rem;margin-top:6px;">통역사 계정 승인 안내</p>
                    </div>
                    <div style="background:#fff;padding:32px;border:1px solid #e5eaf2;border-top:none;">
                        <p style="font-size:1rem;margin-bottom:20px;">${name}님, 안녕하세요!</p>
                        <p style="font-size:0.92rem;line-height:1.8;color:#4a5a75;">
                            콘텐츄어 통역사 지원이 <strong style="color:#2e7d32;">승인</strong>되었습니다.<br>
                            아래 계정 정보로 통역사 대시보드에 로그인하실 수 있습니다.
                        </p>
                        <div style="background:#f0f5ff;border:1.5px solid #dce6f5;border-radius:12px;padding:20px;margin:24px 0;">
                            <table style="width:100%;font-size:0.9rem;">
                                <tr>
                                    <td style="padding:8px 0;color:#666;width:100px;">이메일</td>
                                    <td style="padding:8px 0;font-weight:700;color:#1a2a4a;">${email}</td>
                                </tr>
                                <tr>
                                    <td style="padding:8px 0;color:#666;">임시 비밀번호</td>
                                    <td style="padding:8px 0;font-weight:700;color:#1565c0;font-family:monospace;font-size:1rem;">${tempPw}</td>
                                </tr>
                            </table>
                        </div>
                        <p style="font-size:0.82rem;color:#e65100;margin-bottom:20px;">⚠️ 보안을 위해 첫 로그인 후 반드시 비밀번호를 변경해주세요.</p>
                        <a href="https://contentour-landing.vercel.app/client-auth.html"
                           style="display:inline-block;background:linear-gradient(135deg,#1565c0,#0d47a1);color:#fff;padding:14px 32px;border-radius:10px;text-decoration:none;font-weight:700;font-size:0.92rem;">
                            통역사 대시보드 로그인 →
                        </a>
                    </div>
                    <div style="background:#f8fafc;padding:20px 32px;border:1px solid #e5eaf2;border-top:none;border-radius:0 0 16px 16px;">
                        <p style="font-size:0.75rem;color:#999;margin:0;">
                            콘텐츄어 | 서울시 구로구 디지털로26길 43, 대륭포스트타워 8차 L동 204호<br>
                            문의: info@contentour.co.kr | 02-868-1522
                        </p>
                    </div>
                </div>
            `
        });

        if (error) throw error;
        return { success: true, id: data?.id };
    } catch (err) {
        console.error('이메일 발송 실패:', err);
        return { success: false, reason: err.message };
    }
}

module.exports = async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const authHeader = req.headers.authorization || '';
    const token = authHeader.replace('Bearer ', '');
    const admin = await verifyAdmin(token);
    if (!admin) {
        return res.status(403).json({ error: '관리자 권한이 필요합니다.' });
    }

    const { action, id, status, reason, appData } = req.body;

    try {
        if (action === 'updateStatus') {
            const { data, error } = await supabase
                .from('48_통역사지원서')
                .update({ status: status, updated_at: new Date().toISOString() })
                .eq('id', id)
                .select();
            if (error) throw error;
            return res.status(200).json({ success: true, data });

        } else if (action === 'reject') {
            const { data, error } = await supabase
                .from('48_통역사지원서')
                .update({
                    status: 'rejected',
                    rejection_reason: reason,
                    reviewed_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                })
                .eq('id', id)
                .select();
            if (error) throw error;
            return res.status(200).json({ success: true, data });

        } else if (action === 'approve') {
            const { email, name_ko, phone, language_pairs, specialties, total_experience, intro, certifications } = appData;

            // 1. 임시 비밀번호
            const tempPw = 'Ct' + Math.random().toString(36).slice(2, 8) + '!';

            // 2. Auth 계정 생성
            const { data: authData, error: authError } = await supabase.auth.admin.createUser({
                email: email,
                password: tempPw,
                email_confirm: true,
                user_metadata: { name: name_ko, role: 'interpreter' }
            });
            if (authError) throw authError;
            if (!authData.user) throw new Error('계정 생성 실패');

            const userId = authData.user.id;

            // 3. 회원 테이블 업데이트
            await supabase.from('01_회원').update({
                role: 'interpreter',
                name: name_ko,
                phone: phone
            }).eq('id', userId);

            // 4. 통역사 프로필 생성
            const langList = (language_pairs || []).map(l => l.to)
                .filter((v, i, arr) => arr.indexOf(v) === i);

            const { error: profileErr } = await supabase.from('40_통역사프로필').insert({
                user_id: userId,
                display_name: name_ko,
                phone: phone,
                languages: langList.length > 0 ? langList : ['기타'],
                specialties: (specialties || []).map(s => s.replace(/^[^\s]+\s/, '')),
                experience_years: parseInt(total_experience) || 0,
                intro: intro || '',
                certifications: (certifications || []).map(c => c.name || c),
                is_active: true
            });
            if (profileErr) throw profileErr;

            // 5. 지원서 상태 업데이트
            await supabase.from('48_통역사지원서').update({
                status: 'approved',
                created_user_id: userId,
                reviewed_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            }).eq('id', id);

            // 6. 승인 이메일 발송
            const emailResult = await sendApprovalEmail(email, name_ko, tempPw);

            return res.status(200).json({
                success: true,
                userId: userId,
                tempPw: tempPw,
                name: name_ko,
                email: email,
                emailSent: emailResult.success
            });

        } else if (action === 'exhibitionCreate') {
            const { name: exName, country, city, venue, field, start_date, end_date, is_active } = req.body;
            if (!exName || !country) return res.status(400).json({ error: 'name과 country는 필수입니다.' });
            const { data, error } = await supabase
                .from('60_해외전시회DB')
                .insert({
                    name: exName,
                    country,
                    city: city || null,
                    venue: venue || null,
                    field: field || null,
                    start_date: start_date || null,
                    end_date: end_date || null,
                    is_active: is_active !== false
                })
                .select()
                .single();
            if (error) throw error;
            return res.status(200).json({ success: true, data });

        } else if (action === 'exhibitionUpdate') {
            const { exhibitionId, name: exName, country, city, venue, field, start_date, end_date, is_active } = req.body;
            if (!exhibitionId) return res.status(400).json({ error: 'exhibitionId 필수' });
            const patch = {};
            if (exName !== undefined) patch.name = exName;
            if (country !== undefined) patch.country = country;
            if (city !== undefined) patch.city = city || null;
            if (venue !== undefined) patch.venue = venue || null;
            if (field !== undefined) patch.field = field || null;
            if (start_date !== undefined) patch.start_date = start_date || null;
            if (end_date !== undefined) patch.end_date = end_date || null;
            if (is_active !== undefined) patch.is_active = is_active;
            const { data, error } = await supabase
                .from('60_해외전시회DB')
                .update(patch)
                .eq('id', exhibitionId)
                .select()
                .single();
            if (error) throw error;
            return res.status(200).json({ success: true, data });

        } else if (action === 'exhibitionDelete') {
            const { exhibitionId } = req.body;
            if (!exhibitionId) return res.status(400).json({ error: 'exhibitionId 필수' });
            const { error } = await supabase
                .from('60_해외전시회DB')
                .delete()
                .eq('id', exhibitionId);
            if (error) throw error;
            return res.status(200).json({ success: true });

        } else {
            return res.status(400).json({ error: 'Unknown action' });
        }
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
};
