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

// admin + is_super_admin=true 인 경우만 통과. Phase 1 권한 분리.
async function verifySuperAdmin(token) {
    if (!token) return null;
    const { data: { user }, error } = await sbAuth.auth.getUser(token);
    if (error || !user) return null;
    const { data: profile } = await supabase.from('01_회원').select('role, is_super_admin').eq('id', user.id).single();
    if (!profile || profile.role !== 'admin' || !profile.is_super_admin) return null;
    return user;
}

// ────────────────────────── 감사로그 헬퍼 ──────────────────────────
// 99_감사로그에 관리자 중요 액션 1줄 기록. 실패해도 본 액션은 영향 없음 (best-effort).
// 테이블 미적용 환경에서도 호출이 깨지지 않도록 try/catch로 감싼다.
// 계약 양 당사자(고객사·통역사)에게 in-app 알림 — service role이라 RLS 무관, best-effort
async function notifyContractParties(contractId, title, messageSuffix) {
    if (!contractId) return;
    try {
        const { data: ct } = await supabase.from('42_통역계약')
            .select('customer_id, interpreter_id, exhibition_name').eq('id', contractId).single();
        if (!ct) return;
        const targets = [ct.customer_id, ct.interpreter_id].filter(Boolean);
        if (!targets.length) return;
        const message = '"' + (ct.exhibition_name || '') + '" ' + messageSuffix;
        await supabase.from('24_알림').insert(targets.map(uid => ({
            user_id: uid, notification_type: 'service', title, message, is_read: false
        })));
    } catch (e) { console.warn('[notifyContractParties] 알림 발송 실패:', e); }
}

async function recordAudit(req, actor, payload) {
    try {
        if (!actor || !actor.id) return;
        const row = {
            actor_user_id: actor.id,
            actor_role: 'admin',
            actor_email: actor.email || null,
            action: payload.action,
            target_table: payload.target_table || null,
            target_id: payload.target_id ? String(payload.target_id) : null,
            before_data: payload.before || null,
            after_data: payload.after || null,
            note: payload.note || null,
            ip_address: (req && (req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || (req.socket && req.socket.remoteAddress))) || null,
            user_agent: (req && req.headers['user-agent']) || null
        };
        const { error } = await supabase.from('99_감사로그').insert(row);
        if (error) console.warn('[audit] insert 실패 (무시):', error.message);
    } catch (e) {
        console.warn('[audit] 예외 (무시):', e && e.message);
    }
}

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

async function sendApprovalEmail(email, name, tempPw) {
    if (!resend) {
        console.log('RESEND_API_KEY 미설정 — 이메일 발송 생략');
        return { success: false, reason: 'no_api_key' };
    }

    try {
        const { data, error } = await resend.emails.send({
            // ⚠️ contentour.co.kr 도메인 인증 완료 전 임시 우회 (인증 후 noreply@contentour.co.kr로 환원)
            from: '콘텐츄어 <onboarding@resend.dev>',
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
                            주식회사 콘텐츄어 | 서울시 구로구 디지털로26길 43, 대륭포스트타워 8차 L동 2층 204호<br>
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
            await recordAudit(req, admin, {
                action: 'interpreter_reject',
                target_table: '48_통역사지원서',
                target_id: id,
                after: { status: 'rejected' },
                note: reason || null
            });
            return res.status(200).json({ success: true, data });

        } else if (action === 'approve') {
            // B안: Auth 계정·프로필은 지원 시점에 이미 생성됨.
            // 승인 흐름은 지원서 status='approved' + 프로필 is_active=true 만으로 단순화.
            const { data: app, error: appErr } = await supabase
                .from('48_통역사지원서')
                .select('id, created_user_id, name_ko, email')
                .eq('id', id)
                .single();
            if (appErr || !app) throw new Error('지원서를 찾을 수 없습니다.');

            const userId = app.created_user_id;
            if (!userId) throw new Error('지원서에 연결된 사용자 정보가 없습니다. (구버전 지원서일 수 있음)');

            // 1) 지원서 status='approved'
            await supabase.from('48_통역사지원서').update({
                status: 'approved',
                reviewed_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            }).eq('id', id);

            // 2) 통역사 프로필 is_active=true (지원 시 생성된 행 활성화)
            await supabase.from('40_통역사프로필').update({
                is_active: true
            }).eq('user_id', userId);

            // 3) 인앱 알림 (이메일 안 보냄)
            try {
                await supabase.from('24_알림').insert({
                    user_id: userId,
                    notification_type: 'service',
                    title: '🎉 통역사 계정이 승인되었습니다',
                    message: '콘텐츄어 통역사 대시보드의 모든 기능을 사용하실 수 있습니다.',
                    is_read: false
                });
            } catch (e) { /* 알림 실패는 무시 */ }

            await recordAudit(req, admin, {
                action: 'interpreter_approve',
                target_table: '48_통역사지원서',
                target_id: id,
                after: { status: 'approved', user_id: userId, name: app.name_ko, email: app.email }
            });

            return res.status(200).json({
                success: true,
                userId: userId,
                name: app.name_ko,
                email: app.email
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

        } else if (action === 'showcaseReviewList') {
            // Phase 4C — direct_posting 검토 대기·검토 완료 목록
            const { filter } = req.body; // 'pending' (default) | 'approved' | 'rejected' | 'all'
            let q = supabase
                .from('46_ITQ견적문의')
                .select('id, posted_by_user_id, company, contact_name, email, phone, exhibition_name, location, venue, start_date, end_date, language_pair, headcount, message, showcase_label, showcase_industry, showcase_country_code, company_name_disclosure, review_status, review_note, reviewed_at, reviewed_by, created_at, contract_id')
                .eq('source_type', 'direct_posting')
                .order('created_at', { ascending: false })
                .limit(200);
            if (!filter || filter === 'pending') q = q.eq('review_status', 'pending');
            else if (filter === 'approved') q = q.eq('review_status', 'approved');
            else if (filter === 'rejected') q = q.eq('review_status', 'rejected');
            const { data, error } = await q;
            if (error) throw error;
            return res.status(200).json({ success: true, data: data || [] });

        } else if (action === 'showcaseApprove') {
            // Phase 4C — 공고 승인. label/industry/country_code 수정도 함께 가능.
            const { id: pid, patch } = req.body;
            if (!pid) return res.status(400).json({ error: 'id 필수' });
            const update = {
                review_status: 'approved',
                review_note: null,
                reviewed_at: new Date().toISOString(),
                reviewed_by: admin.id,
                showcase_published_at: new Date().toISOString()
            };
            if (patch && typeof patch === 'object') {
                if (typeof patch.showcase_label === 'string') update.showcase_label = patch.showcase_label.slice(0, 100);
                if (typeof patch.showcase_industry === 'string') update.showcase_industry = patch.showcase_industry.slice(0, 100);
                if (typeof patch.showcase_country_code === 'string' && /^[A-Z]{2}$/.test(patch.showcase_country_code)) {
                    update.showcase_country_code = patch.showcase_country_code;
                }
                if (typeof patch.company_name_disclosure === 'boolean') update.company_name_disclosure = patch.company_name_disclosure;
            }
            const { data, error } = await supabase
                .from('46_ITQ견적문의')
                .update(update)
                .eq('id', pid)
                .eq('source_type', 'direct_posting')
                .select('id, posted_by_user_id, exhibition_name')
                .single();
            if (error) throw error;

            // 고객사에게 알림
            if (data && data.posted_by_user_id) {
                try {
                    await supabase.from('24_알림').insert({
                        user_id: data.posted_by_user_id,
                        notification_type: 'service',
                        title: '✅ 통역사 모집 공고 게재 승인',
                        message: '"' + (data.exhibition_name || '공고') + '" 공고가 승인되어 통역사 구인 현황에 게재되었습니다.',
                        link: 'interpreter-jobs.html',
                        is_read: false
                    });
                } catch (e) { console.warn('승인 알림 실패:', e); }
            }
            await recordAudit(req, admin, {
                action: 'showcase_approve',
                target_table: '46_ITQ견적문의',
                target_id: pid,
                after: { review_status: 'approved', exhibition_name: data && data.exhibition_name }
            });
            return res.status(200).json({ success: true, data });

        } else if (action === 'showcaseApplicantsList') {
            // Phase 4E — 공고 지원자 풀 조회
            const { postingId } = req.body;
            if (!postingId) return res.status(400).json({ error: 'postingId 필수' });

            const { data: apps, error: aErr } = await supabase
                .from('70_구인공고지원')
                .select('id, interpreter_id, status, applied_at, admin_note, contract_id')
                .eq('posting_id', postingId)
                .order('applied_at', { ascending: false });
            if (aErr) throw aErr;
            if (!apps || apps.length === 0) return res.status(200).json({ success: true, data: [] });

            const ids = apps.map(a => a.interpreter_id);
            const [usersRes, profsRes] = await Promise.all([
                supabase.from('01_회원').select('id, name, email').in('id', ids),
                supabase.from('40_통역사프로필').select('user_id, display_name, languages, specialties, experience_years, base_rate, intro').in('user_id', ids)
            ]);
            const userMap = {}; (usersRes.data || []).forEach(u => { userMap[u.id] = u; });
            const profMap = {}; (profsRes.data || []).forEach(p => { profMap[p.user_id] = p; });

            const result = apps.map(a => {
                const u = userMap[a.interpreter_id] || {};
                const p = profMap[a.interpreter_id] || {};
                return {
                    id: a.id,
                    interpreter_id: a.interpreter_id,
                    status: a.status,
                    applied_at: a.applied_at,
                    admin_note: a.admin_note,
                    contract_id: a.contract_id,
                    name: u.name || '',
                    email: u.email || '',
                    display_name: p.display_name || '',
                    languages: p.languages || [],
                    specialties: p.specialties || [],
                    experience_years: p.experience_years || 0,
                    base_rate: p.base_rate || null,
                    intro: p.intro || ''
                };
            });
            return res.status(200).json({ success: true, data: result });

        } else if (action === 'showcaseAssign') {
            // Phase 4E — 매칭 확정: 42_통역계약 INSERT + 70_구인공고지원 상태 갱신 + 알림
            const { postingId, interpreterId, dailyRate, memo } = req.body;
            if (!postingId || !interpreterId) return res.status(400).json({ error: 'postingId, interpreterId 필수' });

            const { data: posting, error: pErr } = await supabase
                .from('46_ITQ견적문의')
                .select('*')
                .eq('id', postingId)
                .single();
            if (pErr || !posting) return res.status(404).json({ error: '공고를 찾을 수 없습니다.' });
            if (posting.contract_id) return res.status(409).json({ error: '이미 매칭된 공고입니다.' });
            if (posting.source_type !== 'direct_posting' || posting.review_status !== 'approved') {
                return res.status(400).json({ error: '매칭할 수 없는 공고입니다.' });
            }

            const { data: appRow } = await supabase
                .from('70_구인공고지원')
                .select('id')
                .eq('posting_id', postingId)
                .eq('interpreter_id', interpreterId)
                .single();
            if (!appRow) return res.status(400).json({ error: '해당 통역사가 지원자 목록에 없습니다.' });

            const { data: interpUser } = await supabase.from('01_회원').select('name, email').eq('id', interpreterId).single();
            const { data: interpProf } = await supabase.from('40_통역사프로필').select('display_name, base_rate').eq('user_id', interpreterId).single();
            const interpDisplay = (interpProf && interpProf.display_name) || (interpUser && interpUser.name) || '통역사';

            let days = 1;
            if (posting.start_date && posting.end_date) {
                const diffMs = new Date(posting.end_date) - new Date(posting.start_date);
                days = Math.max(1, Math.round(diffMs / 86400000) + 1);
            }
            const rate = Number(dailyRate) || (interpProf && interpProf.base_rate) || 250000;
            // 부가세 별도 모델: 일당=공급가 → 총액 = 공급가 + 부가세(10%)
            const netAmount = rate * days;
            const taxAmount = Math.round(netAmount * 0.1);
            const totalAmount = netAmount + taxAmount;
            const customerId = posting.posted_by_user_id || posting.user_id || null;

            // ── 원자적 매칭 확정 ──
            // 1순위: RPC 함수(showcase_assign_atomic) — 단일 트랜잭션, 부분 실패 시 전체 롤백
            // 2순위: 단계별 fallback — RPC 미적용/실패 시. 트랜잭션 보호 없음(기존 동작과 동일).
            let newContractId = null;
            try {
                const { data: rpcResult, error: rpcErr } = await supabase.rpc('showcase_assign_atomic', {
                    p_posting_id: postingId,
                    p_interpreter_id: interpreterId,
                    p_daily_rate: rate,
                    p_memo: memo || null,
                    p_interpreter_display: interpDisplay
                });
                if (rpcErr) throw rpcErr;
                newContractId = rpcResult;
            } catch (rpcErr) {
                console.warn('[showcase_assign] RPC 미적용 또는 실패, 단계별 fallback 사용:', (rpcErr && rpcErr.message) || rpcErr);

                const { data: newContract, error: cErr } = await supabase.from('42_통역계약').insert({
                    order_id: postingId,
                    customer_id: customerId,
                    interpreter_id: interpreterId,
                    exhibition_name: posting.exhibition_name || '',
                    client_company: posting.company || '',
                    venue: posting.venue || posting.location || '',
                    start_date: posting.start_date,
                    end_date: posting.end_date,
                    working_days: days,
                    language_pair: posting.language_pair || '',
                    service_type: 'OTHER',
                    daily_rate: rate,
                    total_amount: totalAmount,
                    tax_amount: taxAmount,
                    net_amount: netAmount,
                    deposit_amount: totalAmount,
                    balance_amount: 0,
                    balance_status: 'paid',
                    status: 'pending'
                }).select('id').single();
                if (cErr) {
                    console.error('계약 생성 실패:', cErr);
                    console.error('계약 생성 실패:', cErr); return res.status(500).json({ error: '계약 생성에 실패했습니다.' });
                }
                newContractId = newContract.id;

                await supabase.from('46_ITQ견적문의').update({
                    contract_id: newContractId,
                    status: '계약진행',
                    admin_note: JSON.stringify({ interpreter: interpDisplay, interpreterId, memo: memo || '' })
                }).eq('id', postingId);

                await supabase.from('70_구인공고지원')
                    .update({ status: 'matched', contract_id: newContractId })
                    .eq('posting_id', postingId)
                    .eq('interpreter_id', interpreterId);

                await supabase.from('70_구인공고지원')
                    .update({ status: 'declined' })
                    .eq('posting_id', postingId)
                    .neq('interpreter_id', interpreterId)
                    .in('status', ['pending', 'forwarded']);
            }

            // 알림 (best-effort)
            try {
                const notifs = [];
                notifs.push({
                    user_id: interpreterId,
                    notification_type: 'assignment',
                    title: '🎉 구인공고 매칭 확정',
                    message: '"' + (posting.exhibition_name || '공고') + '" 매칭이 확정되었습니다. 계약 탭에서 확인해주세요.',
                    is_read: false
                });
                if (customerId) {
                    notifs.push({
                        user_id: customerId,
                        notification_type: 'assignment',
                        title: '🤝 통역사 매칭 확정',
                        message: '"' + (posting.exhibition_name || '공고') + '"에 ' + interpDisplay + ' 통역사가 배정되었습니다. 계약·결제 탭을 확인해주세요.',
                        is_read: false
                    });
                }
                const { data: declined } = await supabase
                    .from('70_구인공고지원')
                    .select('interpreter_id')
                    .eq('posting_id', postingId)
                    .eq('status', 'declined');
                (declined || []).forEach(d => {
                    notifs.push({
                        user_id: d.interpreter_id,
                        notification_type: 'service',
                        title: '안내: 구인공고 매칭 완료',
                        message: '"' + (posting.exhibition_name || '공고') + '" 공고의 매칭이 완료되었습니다. 다음 기회에 다시 만나뵙길 바랍니다.',
                        is_read: false
                    });
                });
                if (notifs.length > 0) await supabase.from('24_알림').insert(notifs);
            } catch (e) { console.warn('매칭 알림 실패:', e); }

            await recordAudit(req, admin, {
                action: 'showcase_assign',
                target_table: '42_통역계약',
                target_id: newContractId,
                after: {
                    posting_id: postingId,
                    interpreter_id: interpreterId,
                    interpreter_name: interpDisplay,
                    daily_rate: rate,
                    total_amount: totalAmount,
                    customer_id: customerId
                },
                note: memo || null
            });

            return res.status(200).json({ success: true, contractId: newContractId });

        } else if (action === 'showcaseReject') {
            // Phase 4C — 공고 거부. review_note 필수.
            const { id: pid, note } = req.body;
            if (!pid) return res.status(400).json({ error: 'id 필수' });
            const trimmed = String(note || '').trim().slice(0, 1000);
            if (!trimmed) return res.status(400).json({ error: '거부 사유(note) 필수' });
            const { data, error } = await supabase
                .from('46_ITQ견적문의')
                .update({
                    review_status: 'rejected',
                    review_note: trimmed,
                    reviewed_at: new Date().toISOString(),
                    reviewed_by: admin.id,
                    showcase_published_at: null
                })
                .eq('id', pid)
                .eq('source_type', 'direct_posting')
                .select('id, posted_by_user_id, exhibition_name')
                .single();
            if (error) throw error;

            // 고객사에게 알림
            if (data && data.posted_by_user_id) {
                try {
                    await supabase.from('24_알림').insert({
                        user_id: data.posted_by_user_id,
                        notification_type: 'service',
                        title: '🚫 통역사 모집 공고 게재 거부',
                        message: '"' + (data.exhibition_name || '공고') + '" 공고가 게재 거부되었습니다. 사유: ' + trimmed,
                        is_read: false
                    });
                } catch (e) { console.warn('거부 알림 실패:', e); }
            }
            await recordAudit(req, admin, {
                action: 'showcase_reject',
                target_table: '46_ITQ견적문의',
                target_id: pid,
                after: { review_status: 'rejected' },
                note: trimmed
            });
            return res.status(200).json({ success: true, data });

        } else if (action === 'cancelApprove') {
            // 계약 취소 승인 — super_admin 전용 (되돌릴 수 없는 액션)
            const superAdmin = await verifySuperAdmin(token);
            if (!superAdmin) return res.status(403).json({ error: 'super_admin 권한이 필요합니다.' });

            const { cancelId } = req.body;
            if (!cancelId) return res.status(400).json({ error: 'cancelId 필수' });

            const { data: cancel, error: qErr } = await supabase
                .from('51_취소내역')
                .select('id, contract_id, refund_amount, penalty_amount, status, cancelled_user_id')
                .eq('id', cancelId).single();
            if (qErr || !cancel) return res.status(404).json({ error: '취소내역을 찾을 수 없습니다.' });
            if (cancel.status !== 'pending') return res.status(409).json({ error: '이미 처리된 취소 건입니다.' });

            const { error: updErr } = await supabase.from('51_취소내역').update({
                status: 'approved',
                admin_note: '관리자 승인',
                updated_at: new Date().toISOString()
            }).eq('id', cancelId);
            if (updErr) { console.error('승인 처리 실패:', updErr); return res.status(500).json({ error: '승인 처리에 실패했습니다.' }); }

            await recordAudit(req, superAdmin, {
                action: 'cancel_approve',
                target_table: '51_취소내역',
                target_id: cancelId,
                after: { status: 'approved', contract_id: cancel.contract_id, refund_amount: cancel.refund_amount, penalty_amount: cancel.penalty_amount }
            });
            await notifyContractParties(cancel.contract_id, '🚫 계약 취소 승인', '건의 계약 취소가 승인되었습니다.');
            return res.status(200).json({ success: true, cancel });

        } else if (action === 'refundComplete') {
            // 환불 완료 처리 — super_admin 전용 (환불은 되돌릴 수 없음)
            const superAdmin = await verifySuperAdmin(token);
            if (!superAdmin) return res.status(403).json({ error: 'super_admin 권한이 필요합니다.' });

            const { cancelId } = req.body;
            if (!cancelId) return res.status(400).json({ error: 'cancelId 필수' });

            const { data: cancel, error: qErr } = await supabase
                .from('51_취소내역')
                .select('id, contract_id, refund_amount, status, admin_note')
                .eq('id', cancelId).single();
            if (qErr || !cancel) return res.status(404).json({ error: '취소내역을 찾을 수 없습니다.' });
            if (cancel.status !== 'approved') return res.status(409).json({ error: '승인 상태에서만 환불 완료 처리할 수 있습니다.' });

            const prevNote = cancel.admin_note ? cancel.admin_note + '\n' : '';
            const { error: updErr } = await supabase.from('51_취소내역').update({
                status: 'refunded',
                admin_note: prevNote + '[' + new Date().toISOString().slice(0,10) + '] 환불 완료 처리',
                updated_at: new Date().toISOString()
            }).eq('id', cancelId);
            if (updErr) { console.error('환불 처리 실패:', updErr); return res.status(500).json({ error: '환불 처리에 실패했습니다.' }); }

            // 47_결제기록 동기화 (webhook 미수신 케이스 대비)
            if (cancel.contract_id) {
                try {
                    await supabase.from('47_결제기록')
                        .update({ status: 'refunded', cancelled_at: new Date().toISOString(), updated_at: new Date().toISOString() })
                        .eq('contract_id', cancel.contract_id)
                        .neq('status', 'refunded');
                } catch (e) { console.warn('[refund] 47_결제기록 동기화 실패:', e); }
            }

            await recordAudit(req, superAdmin, {
                action: 'refund_complete',
                target_table: '51_취소내역',
                target_id: cancelId,
                before: { status: 'approved' },
                after: { status: 'refunded', contract_id: cancel.contract_id, refund_amount: cancel.refund_amount },
                note: 'PortOne 외부 환불 완료 후 시스템 반영'
            });
            await notifyContractParties(cancel.contract_id, '💸 환불 완료', '건의 환불이 완료되었습니다.');
            return res.status(200).json({ success: true });

        } else if (action === 'cancelReject') {
            // 취소 거절 — 일반 admin 허용 (계약 복구만 하므로 비파괴적)
            const { cancelId, reason } = req.body;
            if (!cancelId) return res.status(400).json({ error: 'cancelId 필수' });
            const trimmed = String(reason || '').trim().slice(0, 500);
            if (!trimmed) return res.status(400).json({ error: '거절 사유 필수' });

            const { data: cancel, error: qErr } = await supabase
                .from('51_취소내역')
                .select('id, contract_id, status')
                .eq('id', cancelId).single();
            if (qErr || !cancel) return res.status(404).json({ error: '취소내역을 찾을 수 없습니다.' });
            if (cancel.status !== 'pending') return res.status(409).json({ error: '이미 처리된 취소 건입니다.' });

            const { error: updErr } = await supabase.from('51_취소내역').update({
                status: 'rejected',
                admin_note: trimmed,
                updated_at: new Date().toISOString()
            }).eq('id', cancelId);
            if (updErr) { console.error('거절 처리 실패:', updErr); return res.status(500).json({ error: '거절 처리에 실패했습니다.' }); }

            // 계약 상태 복구
            if (cancel.contract_id) {
                try {
                    await supabase.from('42_통역계약').update({
                        status: 'pending',
                        cancelled_by: null,
                        cancel_reason: null,
                        cancelled_at: null
                    }).eq('id', cancel.contract_id);
                } catch (e) { console.warn('[cancelReject] 계약 복구 실패:', e); }
            }

            await recordAudit(req, admin, {
                action: 'cancel_reject',
                target_table: '51_취소내역',
                target_id: cancelId,
                after: { status: 'rejected', contract_id: cancel.contract_id, contract_restored_to: 'pending' },
                note: trimmed
            });
            await notifyContractParties(cancel.contract_id, '↩️ 계약 취소 거절', '취소 요청이 거절되어 계약이 유지됩니다. 사유: ' + trimmed);
            return res.status(200).json({ success: true });

        } else if (action === 'completeContract') {
            // 잔금 확인(서비스 완료): 계약 status='completed' + 정산건 생성(중복 방지). service role이라 트리거/RLS 무관.
            const { contractId } = req.body;
            if (!contractId) return res.status(400).json({ error: 'contractId 필수' });
            const { data: ct, error: ctErr } = await supabase.from('42_통역계약').select('*').eq('id', contractId).single();
            if (ctErr || !ct) return res.status(404).json({ error: '계약을 찾을 수 없습니다.' });
            if (ct.status === 'completed' || ct.status === 'settled') {
                return res.status(409).json({ error: '이미 완료 처리된 계약입니다.' });
            }
            const { error: upErr } = await supabase.from('42_통역계약').update({ status: 'completed' }).eq('id', contractId);
            if (upErr) return res.status(500).json({ error: '계약 완료 처리 실패' });

            // 정산건: 이미 있으면 재사용, 없으면 생성 (43_정산내역.contract_id UNIQUE 권장 — migration-settlement-unique.sql)
            let settlement = null;
            const { data: existing } = await supabase.from('43_정산내역').select('*').eq('contract_id', contractId).maybeSingle();
            if (existing) {
                settlement = existing;
            } else {
                const serviceFee = (ct.daily_rate || 0) * (ct.working_days || 0);
                const platformFeeRate = 0.10;
                const platformFee = Math.round(serviceFee * platformFeeRate);
                const taxAmount = Math.round(serviceFee * 0.033);
                const { data: ins, error: insErr } = await supabase.from('43_정산내역').insert({
                    contract_id: contractId,
                    interpreter_id: ct.interpreter_id,
                    exhibition_name: ct.exhibition_name,
                    client_company: ct.client_company,
                    language_pair: ct.language_pair,
                    start_date: ct.start_date, end_date: ct.end_date,
                    working_days: ct.working_days, daily_rate: ct.daily_rate,
                    gross_amount: serviceFee, tax_amount: taxAmount, net_amount: serviceFee - taxAmount,
                    platform_fee: platformFee, client_total: serviceFee + platformFee,
                    platform_fee_rate: platformFeeRate,
                    status: 'request', requested_at: new Date().toISOString(), journal_submitted: true
                }).select().single();
                if (insErr) {
                    // 동시 처리로 UNIQUE 위반 시 기존 행 재조회 (중복 INSERT 방지)
                    const { data: again } = await supabase.from('43_정산내역').select('*').eq('contract_id', contractId).maybeSingle();
                    if (again) settlement = again;
                    else return res.status(500).json({ error: '정산 생성 실패' });
                } else {
                    settlement = ins;
                }
            }
            await recordAudit(req, admin, { action: 'complete_contract', target_table: '42_통역계약', target_id: contractId, after: { status: 'completed' } });
            return res.status(200).json({ ok: true, settlement });

        } else if (action === 'settleContract') {
            // 입금 완료: 계약 status='settled'. service role.
            const { contractId } = req.body;
            if (!contractId) return res.status(400).json({ error: 'contractId 필수' });
            const { error: upErr } = await supabase.from('42_통역계약').update({ status: 'settled' }).eq('id', contractId);
            if (upErr) return res.status(500).json({ error: '계약 정산완료 처리 실패' });
            await recordAudit(req, admin, { action: 'settle_contract', target_table: '42_통역계약', target_id: contractId, after: { status: 'settled' } });
            return res.status(200).json({ ok: true });

        } else {
            return res.status(400).json({ error: 'Unknown action' });
        }
    } catch (err) {
        console.error('admin-app error:', err);
        return res.status(500).json({ error: '요청 처리 중 오류가 발생했습니다.' });
    }
};
