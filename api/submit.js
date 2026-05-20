// 통합 라우터: submit-inquiry / submit-application / upload-application-file / notify-admins
// vercel.json rewrites가 옛 URL을 _route 쿼리로 매핑

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://jgeqbdrfpekzuumaklvx.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpnZXFiZHJmcGVrenV1bWFrbHZ4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ4MzgwMzQsImV4cCI6MjA5MDQxNDAzNH0.C2y3UiPtHIF2s4nPvbGycN927HOG4YpO86FfgZAelUw';

const sb = createClient(SUPABASE_URL, SERVICE_KEY);
const sbAuth = createClient(SUPABASE_URL, ANON_KEY);

function s(v, max) {
    if (v == null) return null;
    var str = String(v).trim();
    if (!str) return null;
    return str.length > max ? str.slice(0, max) : str;
}

function arr(v, maxItems, maxItemLen) {
    if (!Array.isArray(v)) return [];
    return v.slice(0, maxItems).map(function (it) {
        if (typeof it === 'string') return it.slice(0, maxItemLen);
        if (it && typeof it === 'object') {
            var out = {};
            Object.keys(it).slice(0, 20).forEach(function (k) {
                var val = it[k];
                if (val == null) { out[k] = null; return; }
                if (typeof val === 'string') out[k] = val.slice(0, maxItemLen);
                else if (typeof val === 'number' || typeof val === 'boolean') out[k] = val;
                else out[k] = String(val).slice(0, maxItemLen);
            });
            return out;
        }
        return null;
    }).filter(function (x) { return x != null; });
}

function isEmail(v) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v || '').trim());
}

// ────────────────────────── submit-inquiry ──────────────────────────
async function handleInquiry(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    var b = req.body || {};
    var company = s(b.company, 200);
    var contact_name = s(b.contact_name, 100);
    var email = s(b.email, 200);
    var phone = s(b.phone, 50);
    var exhibition_name = s(b.exhibition_name, 300);
    var location = s(b.location, 200);
    var venue = s(b.venue, 200);
    var start_date = s(b.start_date, 20);
    var end_date = s(b.end_date, 20);
    var language_pair = s(b.language_pair, 200);
    var service_type = s(b.service_type, 100);
    var working_hours = s(b.working_hours, 100);
    var keywords = s(b.keywords, 500);
    var message = s(b.message, 5000);
    var headcount = parseInt(b.headcount);
    if (!Number.isFinite(headcount) || headcount < 1) headcount = 1;
    if (headcount > 999) headcount = 999;
    var consent = b.consent === true;

    if (!company || !contact_name || !email || !phone || !exhibition_name) {
        return res.status(400).json({ error: '필수 항목이 누락되었습니다.' });
    }
    if (!isEmail(email)) return res.status(400).json({ error: '이메일 형식이 올바르지 않습니다.' });
    if (!consent) return res.status(400).json({ error: '개인정보 수집·이용 동의가 필요합니다.' });
    if (start_date && end_date && start_date > end_date) {
        return res.status(400).json({ error: '종료일은 시작일 이후로 입력해주세요.' });
    }

    try {
        var user_id = null;
        try {
            var { data: existing } = await sb.from('01_회원').select('id').eq('email', email).maybeSingle();
            if (existing && existing.id) user_id = existing.id;
        } catch (e) { /* 매칭 실패해도 진행 */ }

        var { data, error } = await sb
            .from('46_ITQ견적문의')
            .insert({
                user_id: user_id, company, contact_name, email, phone,
                exhibition_name, location, venue, start_date, end_date,
                language_pair, service_type, headcount, working_hours,
                keywords, message, consent, status: '접수'
            })
            .select('id').single();

        if (error) {
            console.error('견적문의 저장 실패:', error);
            return res.status(500).json({ error: '저장 실패. 잠시 후 다시 시도해주세요.' });
        }
        return res.status(200).json({ ok: true, inquiryId: data.id });
    } catch (e) {
        console.error('Submit inquiry error:', e);
        return res.status(500).json({ error: '서버 오류가 발생했습니다.' });
    }
}

// ────────────────────────── submit-application ──────────────────────────
// B안: 지원자가 본인 비밀번호 직접 입력 → 즉시 Auth 계정 생성 + 01_회원 role='interpreter' 활성화
//      + 48_통역사지원서.status='pending'. 승인 전엔 검수 대기 페이지만 접근 가능.
async function handleApplication(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    var b = req.body || {};
    var name_ko = s(b.name_ko, 100);
    var email = s(b.email, 200);
    var phone = s(b.phone, 50);
    var password = b.password ? String(b.password) : '';

    if (!name_ko || !email || !phone) return res.status(400).json({ error: '필수 항목이 누락되었습니다.' });
    if (!isEmail(email)) return res.status(400).json({ error: '이메일 형식이 올바르지 않습니다.' });
    if (b.privacy_consent !== true) return res.status(400).json({ error: '개인정보 수집·이용 동의가 필요합니다.' });

    // 비밀번호 정책: 8자 이상 + 대문자·소문자·숫자 모두 포함
    if (!password || password.length < 8) return res.status(400).json({ error: '비밀번호는 8자 이상이어야 합니다.' });
    if (!/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password)) {
        return res.status(400).json({ error: '비밀번호는 대문자·소문자·숫자를 모두 포함해야 합니다.' });
    }

    var payload = {
        name_ko, name_en: s(b.name_en, 100), email, phone,
        nationality: s(b.nationality, 100),
        birth_date: s(b.birth_date, 20),
        gender: s(b.gender, 20),
        city: s(b.city, 100),
        intro: s(b.intro, 5000),
        language_pairs: arr(b.language_pairs, 20, 200),
        specialties: arr(b.specialties, 30, 100),
        interpretation_types: arr(b.interpretation_types, 20, 100),
        preferred_regions: arr(b.preferred_regions, 30, 100),
        careers: arr(b.careers, 50, 500),
        total_experience: s(b.total_experience, 100),
        certifications: arr(b.certifications, 30, 500),
        school: s(b.school, 200),
        major: s(b.major, 200),
        resume_file_url: s(b.resume_file_url, 500),
        resume_file_name: s(b.resume_file_name, 300),
        portfolio_url: s(b.portfolio_url, 500),
        motivation: s(b.motivation, 5000),
        privacy_consent: true,
        privacy_consent_at: new Date().toISOString(),
        status: 'pending'
    };

    try {
        // 1) 기존 회원 이메일 중복 체크 — 단, role='interpreter'에 status='rejected' 이력이 있으면 재지원 허용
        var { data: existing } = await sb.from('01_회원').select('id, role').eq('email', email).maybeSingle();
        var userId = null;
        var reapplying = false;

        if (existing && existing.id) {
            // 기존 통역사가 재지원 케이스 확인
            if (existing.role === 'interpreter') {
                var { data: lastApp } = await sb.from('48_통역사지원서')
                    .select('id, status').eq('created_user_id', existing.id)
                    .order('created_at', { ascending: false }).limit(1).maybeSingle();
                if (lastApp && lastApp.status === 'rejected') {
                    // 재지원 허용 (계정 유지)
                    userId = existing.id;
                    reapplying = true;
                } else {
                    return res.status(409).json({ error: '이미 지원이 진행 중이거나 승인된 계정입니다. 로그인 후 진행해주세요.' });
                }
            } else {
                return res.status(409).json({ error: '이미 가입된 이메일입니다. 다른 이메일로 지원해주세요.' });
            }
        }

        // 2) 신규 가입자: Supabase Auth 계정 생성
        if (!userId) {
            var { data: authData, error: authErr } = await sb.auth.admin.createUser({
                email: email,
                password: password,
                email_confirm: true,
                user_metadata: { name: name_ko, role: 'interpreter' }
            });
            if (authErr || !authData || !authData.user) {
                console.error('Auth 계정 생성 실패:', authErr);
                if (authErr && /already/i.test(authErr.message || '')) {
                    return res.status(409).json({ error: '이미 가입된 이메일입니다.' });
                }
                return res.status(500).json({ error: '계정 생성 실패. 잠시 후 다시 시도해주세요.' });
            }
            userId = authData.user.id;

            // 3) 01_회원 row UPDATE (Auth 트리거가 생성한 row를 통역사용으로 갱신)
            await sb.from('01_회원').update({
                role: 'interpreter',
                name: name_ko,
                phone: phone
            }).eq('id', userId);

            // 4) 40_통역사프로필 INSERT (검수 전이므로 is_active=false)
            var langList = (payload.language_pairs || []).map(function(l) { return l && l.to ? l.to : null; })
                .filter(function(v) { return !!v; });
            langList = langList.filter(function(v, i, a) { return a.indexOf(v) === i; });
            try {
                await sb.from('40_통역사프로필').insert({
                    user_id: userId,
                    display_name: name_ko,
                    phone: phone,
                    languages: langList.length > 0 ? langList : ['기타'],
                    specialties: (payload.specialties || []).map(function(sp) { return String(sp).replace(/^[^\s]+\s/, ''); }),
                    experience_years: parseInt(payload.total_experience) || 0,
                    intro: payload.intro || '',
                    certifications: (payload.certifications || []).map(function(c) { return c && c.name ? c.name : (typeof c === 'string' ? c : ''); }).filter(Boolean),
                    is_active: false
                });
            } catch (pErr) {
                console.error('통역사 프로필 INSERT 실패 (계속 진행):', pErr);
            }
        } else if (reapplying) {
            // 재지원: 비밀번호 재설정 (사용자가 새 비밀번호를 입력했으므로)
            try {
                await sb.auth.admin.updateUserById(userId, { password: password });
            } catch (pwErr) {
                console.error('재지원 비밀번호 갱신 실패 (무시):', pwErr);
            }
        }

        // 5) 48_통역사지원서 INSERT (status=pending, created_user_id 연결)
        payload.created_user_id = userId;
        var { data, error } = await sb.from('48_통역사지원서').insert(payload).select('id').single();
        if (error) {
            console.error('지원서 저장 실패:', error);
            return res.status(500).json({ error: '저장 실패. 잠시 후 다시 시도해주세요.' });
        }

        return res.status(200).json({
            ok: true,
            applicationId: data.id,
            userId: userId,
            reapplying: reapplying
        });
    } catch (e) {
        console.error('Submit application error:', e);
        return res.status(500).json({ error: '서버 오류가 발생했습니다.' });
    }
}

// ────────────────────────── upload-application-file ──────────────────────────
const ALLOWED_TYPES = [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'
];
const ALLOWED_EXTS = ['pdf', 'doc', 'docx', 'jpg', 'jpeg', 'png', 'gif', 'webp'];

async function handleUploadFile(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const b = req.body || {};
    const filename = String(b.filename || '').trim();
    const contentType = String(b.contentType || '').trim().toLowerCase();
    const kind = String(b.kind || 'resume').trim();

    if (!filename) return res.status(400).json({ error: 'filename이 필요합니다.' });

    const ext = filename.includes('.')
        ? filename.split('.').pop().toLowerCase().slice(0, 8).replace(/[^a-z0-9]/g, '')
        : '';
    if (!ext || !ALLOWED_EXTS.includes(ext)) return res.status(400).json({ error: '허용되지 않는 파일 형식입니다.' });
    if (contentType && !ALLOWED_TYPES.includes(contentType)) return res.status(400).json({ error: '허용되지 않는 MIME 형식입니다.' });

    const prefix = kind === 'certification' ? 'certifications' : 'applications';
    const rand = Math.random().toString(36).slice(2);
    const path = `${prefix}/${Date.now()}_${rand}.${ext}`;

    try {
        const { data, error } = await sb.storage.from('interpreter-docs').createSignedUploadUrl(path);
        if (error) throw error;
        return res.status(200).json({ ok: true, signedUrl: data.signedUrl, token: data.token, path });
    } catch (e) {
        console.error('signed upload url 생성 실패:', e);
        return res.status(500).json({ error: '업로드 URL 생성 실패' });
    }
}

// ────────────────────────── notify-admins ──────────────────────────
async function handleNotifyAdmins(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

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

    if (!title || !message) return res.status(400).json({ error: 'title과 message가 필요합니다.' });

    try {
        const { data: admins, error: aErr } = await sb.from('01_회원').select('id').eq('role', 'admin');
        if (aErr) throw aErr;
        if (!admins || admins.length === 0) return res.status(200).json({ ok: true, notified: 0 });

        const rows = admins.map(a => ({
            user_id: a.id, notification_type, title, message, link, is_read: false
        }));

        const { error: iErr } = await sb.from('24_알림').insert(rows);
        if (iErr) throw iErr;

        return res.status(200).json({ ok: true, notified: rows.length });
    } catch (e) {
        console.error('notify-admins error:', e);
        return res.status(500).json({ error: '알림 발송 실패' });
    }
}

// ────────────────────────── 디스패처 ──────────────────────────
module.exports = async function handler(req, res) {
    if (!SERVICE_KEY) return res.status(500).json({ error: '서버 설정 오류(SERVICE_KEY 누락).' });

    const route = req.query._route || '';
    switch (route) {
        case 'submit-inquiry': return handleInquiry(req, res);
        case 'submit-application': return handleApplication(req, res);
        case 'upload-application-file': return handleUploadFile(req, res);
        case 'notify-admins': return handleNotifyAdmins(req, res);
        default: return res.status(404).json({ error: 'Unknown route: ' + route });
    }
};
