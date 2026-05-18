const { createClient } = require('@supabase/supabase-js');
const { Resend } = require('resend');
const emailTemplates = require('../lib/email-templates');
const { emailContractCancelled } = emailTemplates;

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

        } else if (action === 'testEmail') {
            // [임시] 본인 이메일로 6종 템플릿 일괄 발송 — 검증 완료 후 제거 예정
            const { targetEmail } = req.body;
            if (!targetEmail) return res.status(400).json({ error: 'targetEmail 필수' });
            if (!process.env.RESEND_API_KEY) return res.status(500).json({ error: 'RESEND_API_KEY 미설정' });

            const dummy = {
                expo: 'KOREA AUTO EXPO 2026 (테스트)',
                startDate: '2026-06-15',
                endDate: '2026-06-17',
                customerName: '홍길동',
                customerCompany: '테스트 주식회사',
                interpreterName: '김통역',
                cancelReason: '일정 변경으로 부득이하게 취소 요청드립니다.'
            };

            // 병렬 발송 — Hobby 10초 timeout 회피
            const ops = {
                assigned_customer: emailTemplates.emailContractAssignedToCustomer({
                    customerEmail: targetEmail, customerName: dummy.customerName,
                    interpreterName: dummy.interpreterName, expo: dummy.expo,
                    startDate: dummy.startDate, endDate: dummy.endDate, totalAmount: 750000
                }),
                assigned_interpreter: emailTemplates.emailContractAssignedToInterpreter({
                    interpreterEmail: targetEmail, interpreterName: dummy.interpreterName,
                    expo: dummy.expo, customerCompany: dummy.customerCompany,
                    startDate: dummy.startDate, endDate: dummy.endDate
                }),
                payment_deposit_customer: emailTemplates.emailPaymentCompleteToCustomer({
                    customerEmail: targetEmail, customerName: dummy.customerName,
                    expo: dummy.expo, paymentType: 'deposit', amount: 75000, totalAmount: 750000
                }),
                payment_balance_interpreter: emailTemplates.emailPaymentCompleteToInterpreter({
                    interpreterEmail: targetEmail, interpreterName: dummy.interpreterName,
                    expo: dummy.expo, paymentType: 'balance', customerCompany: dummy.customerCompany
                }),
                cancel_approved_customer: emailContractCancelled({
                    recipientEmail: targetEmail, recipientName: dummy.customerName, recipientRole: 'customer',
                    expo: dummy.expo, cancelReason: dummy.cancelReason,
                    cancelledByLabel: '관리자', action: 'approved'
                }),
                cancel_rejected_interpreter: emailContractCancelled({
                    recipientEmail: targetEmail, recipientName: dummy.interpreterName, recipientRole: 'interpreter',
                    expo: dummy.expo, cancelReason: dummy.cancelReason,
                    cancelledByLabel: '고객사', action: 'rejected'
                }),
                dday_reminder: emailTemplates.emailDdayReminderToInterpreter({
                    interpreterEmail: targetEmail, interpreterName: dummy.interpreterName,
                    expo: dummy.expo, startDate: dummy.startDate, daysLeft: 2
                })
            };

            const keys = Object.keys(ops);
            const settled = await Promise.all(keys.map(k => ops[k]));
            const results = {};
            keys.forEach((k, i) => { results[k] = settled[i]; });

            const total = keys.length;
            const okCount = settled.filter(r => r && r.success).length;
            return res.status(200).json({
                success: true,
                target: targetEmail,
                sent: okCount + '/' + total,
                results
            });

        } else if (action === 'notifyCancellation') {
            // 클라이언트(admin-dashboard)가 취소 승인/거절 처리 후 호출
            // body: { contractId, decision: 'approved'|'rejected', cancelReason, cancelledByRole }
            const { contractId, decision, cancelReason, cancelledByRole } = req.body;
            if (!contractId || !decision) return res.status(400).json({ error: 'contractId/decision 필수' });

            const { data: ct } = await supabase
                .from('42_통역계약')
                .select('exhibition_name, customer_id, interpreter_id')
                .eq('id', contractId).single();
            if (!ct) return res.status(404).json({ error: '계약을 찾을 수 없습니다.' });

            const cancelledByLabel = cancelledByRole === 'customer' ? '고객사' : (cancelledByRole === 'interpreter' ? '통역사' : '관리자');

            // 양쪽 회원 정보 조회
            const ids = [ct.customer_id, ct.interpreter_id].filter(Boolean);
            const { data: users } = await supabase.from('01_회원').select('id, email, name, role').in('id', ids);
            const userMap = {};
            (users || []).forEach(u => { userMap[u.id] = u; });

            const sendOps = [];
            if (ct.customer_id && userMap[ct.customer_id] && userMap[ct.customer_id].email) {
                sendOps.push(emailContractCancelled({
                    recipientEmail: userMap[ct.customer_id].email,
                    recipientName: userMap[ct.customer_id].name,
                    recipientRole: 'customer',
                    expo: ct.exhibition_name,
                    cancelReason, cancelledByLabel, action: decision
                }));
            }
            if (ct.interpreter_id && userMap[ct.interpreter_id] && userMap[ct.interpreter_id].email) {
                sendOps.push(emailContractCancelled({
                    recipientEmail: userMap[ct.interpreter_id].email,
                    recipientName: userMap[ct.interpreter_id].name,
                    recipientRole: 'interpreter',
                    expo: ct.exhibition_name,
                    cancelReason, cancelledByLabel, action: decision
                }));
            }
            const results = await Promise.all(sendOps);
            return res.status(200).json({ success: true, sent: results.filter(r => r.success).length });

        } else if (action === 'directInquiryRenotify') {
            const { inquiryId } = req.body;
            if (!inquiryId) return res.status(400).json({ error: 'inquiryId 필수' });
            // 견적문의 + admin_note 조회
            const { data: inquiry, error: fetchErr } = await supabase
                .from('46_ITQ견적문의')
                .select('id, exhibition_name, company, admin_note')
                .eq('id', inquiryId)
                .single();
            if (fetchErr || !inquiry) throw new Error('견적문의를 찾을 수 없습니다.');
            let note = {};
            try { note = typeof inquiry.admin_note === 'string' ? JSON.parse(inquiry.admin_note) : (inquiry.admin_note || {}); } catch (e) {}
            const interpreterId = note.requested_interpreter_id;
            if (!interpreterId) throw new Error('지정 통역사 ID가 없습니다.');
            // 알림 재발송
            await supabase.from('24_알림').insert({
                user_id: interpreterId,
                notification_type: 'service',
                title: '🔔 [재알림] 견적 의뢰 응답 요청',
                message: `${inquiry.company || '고객사'}의 "${inquiry.exhibition_name || '전시회'}" 직접 의뢰가 응답을 기다리고 있습니다. 견적 요청 탭에서 확인해주세요.`,
                is_read: false
            });
            return res.status(200).json({ success: true });

        } else if (action === 'profileToggle') {
            const { userId, isActive } = req.body;
            if (!userId) return res.status(400).json({ error: 'userId 필수' });
            const { error } = await supabase
                .from('40_통역사프로필')
                .update({ is_active: isActive })
                .eq('user_id', userId);
            if (error) throw error;
            return res.status(200).json({ success: true });

        } else if (action === 'exhibitionList') {
            const { data, error } = await supabase
                .from('60_해외전시회DB')
                .select('id, name, country, city, venue, field, start_date, end_date, is_active, updated_at')
                .order('country', { ascending: true })
                .order('name', { ascending: true });
            if (error) throw error;
            return res.status(200).json({ success: true, data: data || [] });

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
