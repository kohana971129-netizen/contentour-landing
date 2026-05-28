// 통합 라우터: submit-inquiry / submit-application / upload-application-file / notify-admins
// vercel.json rewrites가 옛 URL을 _route 쿼리로 매핑

const { createClient } = require('@supabase/supabase-js');
const { checkRateLimit, clientIp } = require('../lib/rate-limit');

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
    if (!await checkRateLimit(sb, 'inquiry:' + clientIp(req), 10, 60)) {
        return res.status(429).json({ error: '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.' });
    }

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
    if (!await checkRateLimit(sb, 'apply:' + clientIp(req), 5, 60)) {
        return res.status(429).json({ error: '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.' });
    }

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
// 확장자 ↔ MIME 일치 검증 — 위장 업로드 차단
const EXT_TO_MIME = {
    'pdf':  ['application/pdf'],
    'doc':  ['application/msword'],
    'docx': ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
    'jpg':  ['image/jpeg', 'image/jpg'],
    'jpeg': ['image/jpeg', 'image/jpg'],
    'png':  ['image/png'],
    'gif':  ['image/gif'],
    'webp': ['image/webp']
};

async function handleUploadFile(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    if (!await checkRateLimit(sb, 'upload:' + clientIp(req), 30, 60)) {
        return res.status(429).json({ error: '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.' });
    }

    const b = req.body || {};
    const filename = String(b.filename || '').trim();
    const contentType = String(b.contentType || '').trim().toLowerCase();
    const kind = String(b.kind || 'resume').trim();

    if (!filename) return res.status(400).json({ error: 'filename이 필요합니다.' });

    const ext = filename.includes('.')
        ? filename.split('.').pop().toLowerCase().slice(0, 8).replace(/[^a-z0-9]/g, '')
        : '';
    if (!ext || !ALLOWED_EXTS.includes(ext)) return res.status(400).json({ error: '허용되지 않는 파일 형식입니다.' });
    // MIME 타입이 제공된 경우 화이트리스트 + 확장자와 일치 여부 검증 (위장 업로드 차단)
    // MIME이 비어있으면(브라우저가 못 알아낸 경우) ext 기반으로 통과 — Storage RLS·버킷 정책이 최종 방어선
    if (contentType) {
        if (!ALLOWED_TYPES.includes(contentType)) {
            return res.status(400).json({ error: '허용되지 않는 MIME 형식입니다.' });
        }
        const allowedMimesForExt = EXT_TO_MIME[ext] || [];
        if (!allowedMimesForExt.includes(contentType)) {
            return res.status(400).json({ error: '파일 확장자와 MIME 타입이 일치하지 않습니다.' });
        }
    }

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

// ────────────────────────── submit-showcase-posting ──────────────────────────
// 로그인 고객사가 통역사 구인 현황 페이지에서 직접 공고 등록.
// source_type='direct_posting', review_status='pending' 으로 INSERT → admin 검토 큐.
async function handleShowcasePosting(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const authHeader = req.headers.authorization || '';
    const token = authHeader.replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: '로그인이 필요합니다.' });

    const { data: { user }, error: authErr } = await sbAuth.auth.getUser(token);
    if (authErr || !user) return res.status(401).json({ error: '인증 실패' });

    const { data: profile, error: profErr } = await sb
        .from('01_회원')
        .select('role, name, phone, company_name')
        .eq('id', user.id)
        .single();
    if (profErr || !profile) return res.status(403).json({ error: '회원 정보를 찾을 수 없습니다.' });
    if (profile.role !== 'customer') {
        return res.status(403).json({ error: '고객사 계정만 공고를 등록할 수 있습니다.' });
    }

    var b = req.body || {};
    var exhibition_name        = s(b.exhibition_name, 300);
    var location               = s(b.location, 200);
    var venue                  = s(b.venue, 200);
    var start_date             = s(b.start_date, 20);
    var end_date               = s(b.end_date, 20);
    var language_pair          = s(b.language_pair, 200);
    var showcase_industry      = s(b.showcase_industry, 100);
    var showcase_country_code  = s(b.showcase_country_code, 2);
    var showcase_label         = s(b.showcase_label, 100);
    var message                = s(b.message, 5000);
    var company_name_disclosure = b.company_name_disclosure === true;
    var headcount = parseInt(b.headcount);
    if (!Number.isFinite(headcount) || headcount < 1) headcount = 1;
    if (headcount > 99) headcount = 99;

    if (!exhibition_name || !location || !start_date || !end_date || !language_pair || !showcase_industry || !showcase_country_code) {
        return res.status(400).json({ error: '필수 항목이 누락되었습니다.' });
    }
    if (start_date > end_date) {
        return res.status(400).json({ error: '종료일은 시작일 이후로 입력해주세요.' });
    }
    // 과거 날짜 공고 차단 (오늘 포함 미래만 허용)
    var __today = new Date();
    var __todayStr = __today.getFullYear() + '-' + String(__today.getMonth() + 1).padStart(2, '0') + '-' + String(__today.getDate()).padStart(2, '0');
    if (end_date < __todayStr) {
        return res.status(400).json({ error: '종료일이 이미 지난 공고는 등록할 수 없습니다.' });
    }
    if (!/^[A-Z]{2}$/.test(showcase_country_code)) {
        return res.status(400).json({ error: '국가 코드 형식이 올바르지 않습니다.' });
    }

    // 익명 게재(기본): showcase_label은 사용자가 정한 익명 라벨
    // 실명 공개: showcase_label = 회사명 (4F에서 viewer 역할별로 가림)
    if (!showcase_label) {
        showcase_label = '한국 ' + showcase_industry + ' 기업';
    }

    // 46_ITQ견적문의는 견적의뢰·통역사 모집 공고 둘 다 INSERT.
    // NOT NULL 제약이 다양하게 걸려 있을 수 있어, 누락 시 INSERT 실패 → 신규 고객사 진입 막힘.
    // payload의 nullable 필드는 의미 있는 기본값(빈 문자열·기본 enum)으로 안전하게 채움.
    var payload = {
        source_type: 'direct_posting',
        review_status: 'pending',
        posted_by_user_id: user.id,
        user_id: user.id,
        company: profile.company_name || profile.name || '직접 등록 고객사',
        contact_name: profile.name || user.email || '직접 등록 고객사',
        email: user.email || '',
        phone: profile.phone || '',
        exhibition_name,
        location,
        venue: venue || '',
        start_date,
        end_date,
        language_pair,
        headcount,
        message: message || '',
        // 통역사 모집 공고는 견적의뢰 폼의 service_type/working_hours/keywords를 받지 않으므로
        // DB NOT NULL 제약 충족용 안전 기본값 명시 (handleInquiry payload와 페어리티 맞춤)
        service_type: 'OTHER',
        working_hours: '',
        keywords: '',
        showcase_consent: true,
        showcase_industry,
        showcase_country_code,
        showcase_label,
        company_name_disclosure,
        status: '접수',
        consent: true
    };

    try {
        var { data, error } = await sb
            .from('46_ITQ견적문의')
            .insert(payload)
            .select('id')
            .single();
        if (error) {
            console.error('직접 등록 공고 저장 실패:', error);
            return res.status(500).json({ error: '저장 실패. 잠시 후 다시 시도해주세요.' });
        }

        // admin 알림 + 등록 고객사 본인 확인 알림 (실패해도 본 응답엔 영향 없음)
        try {
            const companyDisplay = profile.company_name || profile.name || '고객사';
            const rows = [];

            const { data: admins } = await sb.from('01_회원').select('id').eq('role', 'admin');
            if (admins && admins.length > 0) {
                admins.forEach(a => rows.push({
                    user_id: a.id,
                    notification_type: 'service',
                    title: '📋 직접 등록 공고 검토 요청',
                    message: companyDisplay + '이 "' + exhibition_name + '" 통역사 모집 공고를 등록했습니다. 검토 대기 중입니다.',
                    link: 'admin-showcase-review.html',
                    is_read: false
                }));
            }

            // 등록 고객사 본인 — "등록 완료 + 검토 대기" 안내
            rows.push({
                user_id: user.id,
                notification_type: 'service',
                title: '✅ 통역사 구인 공고 등록 완료',
                message: '"' + exhibition_name + '" 공고가 접수되었습니다. 콘텐츄어 관리자 검토 후 게재됩니다 (영업일 기준 1~2일).',
                is_read: false
            });

            if (rows.length > 0) await sb.from('24_알림').insert(rows);
        } catch (notifErr) {
            console.warn('공고 등록 알림 실패 (무시):', notifErr);
        }

        return res.status(200).json({ ok: true, postingId: data.id });
    } catch (e) {
        console.error('Submit showcase posting error:', e);
        return res.status(500).json({ error: '서버 오류가 발생했습니다.' });
    }
}

// ────────────────────────── submit-showcase-apply ──────────────────────────
// 통역사가 /interpreter-jobs 카드에서 "지원하기" 클릭 시 호출.
// 70_구인공고지원 INSERT + interest_count 증가 + admin·고객사 알림.
async function handleShowcaseApply(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const authHeader = req.headers.authorization || '';
    const token = authHeader.replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: '로그인이 필요합니다.' });

    const { data: { user }, error: authErr } = await sbAuth.auth.getUser(token);
    if (authErr || !user) return res.status(401).json({ error: '인증 실패' });

    // 활성 통역사만 지원 가능
    const { data: profile } = await sb
        .from('01_회원')
        .select('role, name')
        .eq('id', user.id)
        .single();
    if (!profile || profile.role !== 'interpreter') {
        return res.status(403).json({ error: '통역사 계정만 지원할 수 있습니다.' });
    }
    const { data: interpProfile } = await sb
        .from('40_통역사프로필')
        .select('display_name, is_active')
        .eq('user_id', user.id)
        .single();
    if (!interpProfile || !interpProfile.is_active) {
        return res.status(403).json({ error: '승인된 통역사만 지원할 수 있습니다. 검수 대기 중이면 잠시 후 다시 시도해주세요.' });
    }

    const postingId = req.body && req.body.posting_id ? String(req.body.posting_id).trim() : '';
    if (!postingId) return res.status(400).json({ error: 'posting_id 필수' });

    // 공고 유효성 확인 (direct_posting + approved + 매칭 전)
    const { data: posting, error: pErr } = await sb
        .from('46_ITQ견적문의')
        .select('id, source_type, review_status, contract_id, exhibition_name, posted_by_user_id, interest_count')
        .eq('id', postingId)
        .single();
    if (pErr || !posting) return res.status(404).json({ error: '공고를 찾을 수 없습니다.' });
    if (posting.source_type !== 'direct_posting' || posting.review_status !== 'approved') {
        return res.status(400).json({ error: '지원할 수 없는 공고입니다.' });
    }
    if (posting.contract_id) {
        return res.status(409).json({ error: '이미 매칭 완료된 공고입니다.' });
    }
    if (posting.posted_by_user_id && posting.posted_by_user_id === user.id) {
        return res.status(403).json({ error: '본인이 등록한 공고에는 지원할 수 없습니다.' });
    }

    // INSERT — UNIQUE 위반은 409
    try {
        const { error: insErr } = await sb
            .from('70_구인공고지원')
            .insert({
                posting_id: postingId,
                interpreter_id: user.id,
                status: 'pending'
            });
        if (insErr) {
            if (/duplicate|unique/i.test(insErr.message || '')) {
                // 기존 지원 상태에 따라 메시지 분기 (pending / matched / declined)
                let dupMsg = '이미 지원하신 공고입니다.';
                try {
                    const { data: prev } = await sb
                        .from('70_구인공고지원')
                        .select('status')
                        .eq('posting_id', postingId)
                        .eq('interpreter_id', user.id)
                        .single();
                    if (prev && prev.status === 'declined') {
                        dupMsg = '이 공고는 이미 매칭이 다른 통역사에게 확정되어 재지원할 수 없습니다.';
                    } else if (prev && prev.status === 'matched') {
                        dupMsg = '이미 이 공고에 매칭 확정된 상태입니다.';
                    } else {
                        dupMsg = '이미 지원하신 공고입니다. 관리자 검토 중입니다.';
                    }
                } catch (e) { /* fallback msg 사용 */ }
                return res.status(409).json({ error: dupMsg });
            }
            throw insErr;
        }

        // interest_count +1 (best-effort)
        try {
            await sb.from('46_ITQ견적문의')
                .update({ interest_count: (posting.interest_count || 0) + 1 })
                .eq('id', postingId);
        } catch (e) { /* 무시 */ }

        // admin 전체 + 고객사에게 알림
        try {
            const interpName = interpProfile.display_name || profile.name || '통역사';
            const exName = posting.exhibition_name || '공고';

            const { data: admins } = await sb.from('01_회원').select('id').eq('role', 'admin');
            const adminRows = (admins || []).map(a => ({
                user_id: a.id,
                notification_type: 'service',
                title: '👥 구인공고 신규 지원',
                message: interpName + '님이 "' + exName + '" 공고에 지원했습니다.',
                link: 'admin-showcase-review.html',
                is_read: false
            }));
            if (posting.posted_by_user_id) {
                adminRows.push({
                    user_id: posting.posted_by_user_id,
                    notification_type: 'service',
                    title: '👥 공고에 통역사 지원',
                    message: '"' + exName + '" 공고에 통역사가 지원했습니다. 콘텐츄어 관리자가 검토 후 매칭 제안을 드립니다.',
                    is_read: false
                });
            }
            if (adminRows.length > 0) await sb.from('24_알림').insert(adminRows);
        } catch (e) { console.warn('지원 알림 실패:', e); }

        return res.status(200).json({ ok: true });
    } catch (e) {
        console.error('Showcase apply error:', e);
        return res.status(500).json({ error: '서버 오류가 발생했습니다.' });
    }
}

// ────────────────────────── cancel-inquiry ──────────────────────────
// 고객사가 본인이 등록한 견적 문의를 취소 (status='접수' / '검토중'만 허용)
// '견적발송' 이후 단계는 별도 흐름(견적 거절 / 계약 취소) 사용.
async function handleCancelInquiry(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const authHeader = req.headers.authorization || '';
    const token = authHeader.replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: '로그인이 필요합니다.' });

    const { data: { user }, error: authErr } = await sbAuth.auth.getUser(token);
    if (authErr || !user) return res.status(401).json({ error: '인증 실패' });

    const inquiryId = req.body && req.body.inquiry_id ? String(req.body.inquiry_id).trim() : '';
    if (!inquiryId) return res.status(400).json({ error: 'inquiry_id 필수' });

    // 본인 소유 + 취소 가능 상태 확인
    const { data: inq, error: qErr } = await sb
        .from('46_ITQ견적문의')
        .select('id, user_id, status, exhibition_name')
        .eq('id', inquiryId)
        .single();
    if (qErr || !inq) return res.status(404).json({ error: '문의를 찾을 수 없습니다.' });
    if (inq.user_id !== user.id) return res.status(403).json({ error: '본인 문의만 취소할 수 있습니다.' });
    if (inq.status !== '접수' && inq.status !== '검토중') {
        return res.status(409).json({ error: '이미 진행 중인 문의는 직접 취소할 수 없습니다. 관리자에게 문의해주세요.' });
    }

    const { error: updErr } = await sb
        .from('46_ITQ견적문의')
        .update({ status: '취소됨' })
        .eq('id', inquiryId);
    if (updErr) {
        console.error('Inquiry cancel error:', updErr);
        return res.status(500).json({ error: '취소 처리 실패. 잠시 후 다시 시도해주세요.' });
    }

    // admin 알림 (best-effort)
    try {
        const { data: admins } = await sb.from('01_회원').select('id').eq('role', 'admin');
        if (admins && admins.length > 0) {
            const rows = admins.map(a => ({
                user_id: a.id,
                notification_type: 'service',
                title: '🗑 견적 문의 취소',
                message: '"' + (inq.exhibition_name || '문의') + '" 견적 문의가 고객사 요청으로 취소되었습니다.',
                is_read: false
            }));
            await sb.from('24_알림').insert(rows);
        }
    } catch (e) { console.warn('취소 알림 실패:', e); }

    return res.status(200).json({ ok: true });
}

// ────────────────────────── update-showcase-posting ──────────────────────────
// 고객사 본인이 등록한 공고를 수정. review_status='pending' 상태에서만 허용.
// admin 검토가 시작된(approved/rejected) 공고는 수정 불가 — 새 공고를 등록하거나 admin에게 문의.
async function handleUpdateShowcasePosting(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const authHeader = req.headers.authorization || '';
    const token = authHeader.replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: '로그인이 필요합니다.' });

    const { data: { user }, error: authErr } = await sbAuth.auth.getUser(token);
    if (authErr || !user) return res.status(401).json({ error: '인증 실패' });

    const postingId = req.body && req.body.posting_id ? String(req.body.posting_id).trim() : '';
    if (!postingId) return res.status(400).json({ error: 'posting_id 필수' });

    // 본인 소유 + pending 상태 확인
    const { data: existing, error: qErr } = await sb
        .from('46_ITQ견적문의')
        .select('id, posted_by_user_id, source_type, review_status, exhibition_name')
        .eq('id', postingId)
        .single();
    if (qErr || !existing) return res.status(404).json({ error: '공고를 찾을 수 없습니다.' });
    if (existing.posted_by_user_id !== user.id) return res.status(403).json({ error: '본인이 등록한 공고만 수정할 수 있습니다.' });
    if (existing.source_type !== 'direct_posting') return res.status(400).json({ error: '직접 등록 공고만 수정 가능합니다.' });
    if (existing.review_status !== 'pending') {
        return res.status(409).json({ error: '관리자 검토가 시작된 공고는 수정할 수 없습니다. 관리자에게 문의해주세요.' });
    }

    var b = req.body || {};
    var exhibition_name        = s(b.exhibition_name, 300);
    var location               = s(b.location, 200);
    var venue                  = s(b.venue, 200);
    var start_date             = s(b.start_date, 20);
    var end_date               = s(b.end_date, 20);
    var language_pair          = s(b.language_pair, 200);
    var showcase_industry      = s(b.showcase_industry, 100);
    var showcase_country_code  = s(b.showcase_country_code, 2);
    var showcase_label         = s(b.showcase_label, 100);
    var message                = s(b.message, 5000);
    var company_name_disclosure = b.company_name_disclosure === true;
    var headcount = parseInt(b.headcount);
    if (!Number.isFinite(headcount) || headcount < 1) headcount = 1;
    if (headcount > 99) headcount = 99;

    if (!exhibition_name || !location || !start_date || !end_date || !language_pair || !showcase_industry || !showcase_country_code) {
        return res.status(400).json({ error: '필수 항목이 누락되었습니다.' });
    }
    if (start_date > end_date) {
        return res.status(400).json({ error: '종료일은 시작일 이후로 입력해주세요.' });
    }
    var __today = new Date();
    var __todayStr = __today.getFullYear() + '-' + String(__today.getMonth() + 1).padStart(2, '0') + '-' + String(__today.getDate()).padStart(2, '0');
    if (end_date < __todayStr) {
        return res.status(400).json({ error: '종료일이 이미 지난 공고는 등록할 수 없습니다.' });
    }
    if (!/^[A-Z]{2}$/.test(showcase_country_code)) {
        return res.status(400).json({ error: '국가 코드 형식이 올바르지 않습니다.' });
    }
    if (!showcase_label) {
        showcase_label = '한국 ' + showcase_industry + ' 기업';
    }

    const updates = {
        exhibition_name,
        location,
        venue: venue || '',
        start_date,
        end_date,
        language_pair,
        headcount,
        message: message || '',
        showcase_industry,
        showcase_country_code,
        showcase_label,
        company_name_disclosure,
        updated_at: new Date().toISOString()
    };

    const { error: updErr } = await sb.from('46_ITQ견적문의').update(updates).eq('id', postingId);
    if (updErr) {
        console.error('공고 수정 실패:', updErr);
        return res.status(500).json({ error: '수정 실패. 잠시 후 다시 시도해주세요.' });
    }

    return res.status(200).json({ ok: true });
}

// ────────────────────────── cancel-showcase-posting ──────────────────────────
// 고객사 본인이 등록한 공고 취소.
//   - review_status='pending' → 그냥 review_status='cancelled' (admin 검토 큐에서 제거)
//   - review_status='approved' (게재 중) → review_status='cancelled' + showcase_published_at=null (목록에서 제거)
//   - 매칭 완료된 공고는 취소 불가 (계약 취소 흐름으로 안내)
async function handleCancelShowcasePosting(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const authHeader = req.headers.authorization || '';
    const token = authHeader.replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: '로그인이 필요합니다.' });

    const { data: { user }, error: authErr } = await sbAuth.auth.getUser(token);
    if (authErr || !user) return res.status(401).json({ error: '인증 실패' });

    const postingId = req.body && req.body.posting_id ? String(req.body.posting_id).trim() : '';
    if (!postingId) return res.status(400).json({ error: 'posting_id 필수' });

    const { data: existing, error: qErr } = await sb
        .from('46_ITQ견적문의')
        .select('id, posted_by_user_id, source_type, review_status, contract_id, exhibition_name')
        .eq('id', postingId)
        .single();
    if (qErr || !existing) return res.status(404).json({ error: '공고를 찾을 수 없습니다.' });
    if (existing.posted_by_user_id !== user.id) return res.status(403).json({ error: '본인이 등록한 공고만 취소할 수 있습니다.' });
    if (existing.source_type !== 'direct_posting') return res.status(400).json({ error: '직접 등록 공고만 취소 가능합니다.' });
    if (existing.contract_id) {
        return res.status(409).json({ error: '매칭이 확정된 공고는 직접 취소할 수 없습니다. 계약 취소 흐름을 이용해주세요.' });
    }
    if (existing.review_status === 'cancelled') {
        return res.status(409).json({ error: '이미 취소된 공고입니다.' });
    }

    const wasApproved = existing.review_status === 'approved';
    const { error: updErr } = await sb.from('46_ITQ견적문의').update({
        review_status: 'cancelled',
        showcase_published_at: null,
        updated_at: new Date().toISOString()
    }).eq('id', postingId);
    if (updErr) {
        console.error('공고 취소 실패:', updErr);
        return res.status(500).json({ error: '취소 처리 실패. 잠시 후 다시 시도해주세요.' });
    }

    // 게재 중이던 공고가 취소되면 대기 중 지원자들에게 알림 + admin 알림
    try {
        if (wasApproved) {
            const { data: pending } = await sb.from('70_구인공고지원')
                .select('interpreter_id')
                .eq('posting_id', postingId)
                .eq('status', 'pending');
            const rows = [];
            (pending || []).forEach(p => {
                rows.push({
                    user_id: p.interpreter_id,
                    notification_type: 'service',
                    title: '안내: 지원 공고 취소',
                    message: '"' + (existing.exhibition_name || '공고') + '" 공고가 고객사 요청으로 취소되었습니다.',
                    is_read: false
                });
            });
            // 대기 중 지원자 status도 declined로 정리
            if (pending && pending.length > 0) {
                await sb.from('70_구인공고지원').update({ status: 'declined' }).eq('posting_id', postingId).eq('status', 'pending');
            }
            const { data: admins } = await sb.from('01_회원').select('id').eq('role', 'admin');
            (admins || []).forEach(a => {
                rows.push({
                    user_id: a.id,
                    notification_type: 'service',
                    title: '🗑 통역사 모집 공고 취소',
                    message: '게재 중이던 "' + (existing.exhibition_name || '공고') + '" 공고가 고객사 요청으로 취소되었습니다.',
                    is_read: false
                });
            });
            if (rows.length > 0) await sb.from('24_알림').insert(rows);
        }
    } catch (e) { console.warn('공고 취소 알림 실패:', e); }

    return res.status(200).json({ ok: true });
}

// ────────────────────────── customer-select-applicant ──────────────────────────
// 고객사가 본인 공고 지원자 중 1명을 직접 선택 → status='selected' (admin 확정 대기).
// 같은 공고의 기존 'selected'는 'pending'으로 되돌려 선택 변경 허용. 계약 생성은 admin 확정 단계에서.
async function handleCustomerSelectApplicant(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const authHeader = req.headers.authorization || '';
    const token = authHeader.replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: '로그인이 필요합니다.' });
    const { data: { user }, error: authErr } = await sbAuth.auth.getUser(token);
    if (authErr || !user) return res.status(401).json({ error: '인증 실패' });

    const { data: profile } = await sb.from('01_회원').select('role, company_name, name').eq('id', user.id).single();
    if (!profile || profile.role !== 'customer') {
        return res.status(403).json({ error: '고객사 계정만 선택할 수 있습니다.' });
    }

    const postingId = req.body && req.body.posting_id ? String(req.body.posting_id).trim() : '';
    const interpreterId = req.body && req.body.interpreter_id ? String(req.body.interpreter_id).trim() : '';
    if (!postingId || !interpreterId) return res.status(400).json({ error: 'posting_id, interpreter_id 필수' });

    // 공고 소유권 + 상태 확인
    const { data: posting } = await sb
        .from('46_ITQ견적문의')
        .select('id, posted_by_user_id, source_type, review_status, contract_id, exhibition_name')
        .eq('id', postingId).single();
    if (!posting) return res.status(404).json({ error: '공고를 찾을 수 없습니다.' });
    if (posting.posted_by_user_id !== user.id || posting.source_type !== 'direct_posting') {
        return res.status(403).json({ error: '본인이 등록한 공고만 선택할 수 있습니다.' });
    }
    if (posting.review_status !== 'approved') return res.status(400).json({ error: '게재 승인된 공고에서만 선택할 수 있습니다.' });
    if (posting.contract_id) return res.status(409).json({ error: '이미 매칭이 확정된 공고입니다.' });

    // 지원자 존재 + 선택 가능 상태 확인
    const { data: appRow } = await sb
        .from('70_구인공고지원')
        .select('id, status')
        .eq('posting_id', postingId)
        .eq('interpreter_id', interpreterId)
        .single();
    if (!appRow) return res.status(404).json({ error: '해당 통역사의 지원 내역이 없습니다.' });
    if (appRow.status === 'matched') return res.status(409).json({ error: '이미 확정된 통역사입니다.' });
    if (appRow.status === 'declined') return res.status(409).json({ error: '선택할 수 없는 지원자입니다.' });

    try {
        // 같은 공고의 기존 'selected'는 pending으로 되돌림 (선택 변경 허용)
        await sb.from('70_구인공고지원')
            .update({ status: 'pending' })
            .eq('posting_id', postingId)
            .eq('status', 'selected')
            .neq('interpreter_id', interpreterId);

        // 선택 통역사 → selected
        const { error: selErr } = await sb.from('70_구인공고지원')
            .update({ status: 'selected' })
            .eq('id', appRow.id);
        if (selErr) {
            // 마이그레이션(selected CHECK 허용) 미적용 시 여기서 막힘
            console.error('customer-select 상태 변경 실패:', selErr);
            return res.status(500).json({ error: '선택 처리 실패. 잠시 후 다시 시도해주세요.' });
        }

        // admin + 고객 본인 알림 (best-effort)
        try {
            const { data: itp } = await sb.from('40_통역사프로필').select('display_name').eq('user_id', interpreterId).single();
            const itpName = (itp && itp.display_name) || '통역사';
            const companyDisplay = profile.company_name || profile.name || '고객사';
            const exName = posting.exhibition_name || '공고';

            const { data: admins } = await sb.from('01_회원').select('id').eq('role', 'admin');
            const rows = (admins || []).map(a => ({
                user_id: a.id,
                notification_type: 'service',
                title: '🎯 고객사 통역사 선택 — 확정 검토 요청',
                message: companyDisplay + '이(가) "' + exName + '" 공고에서 ' + itpName + ' 통역사를 선택했습니다. 매칭 확정을 검토해주세요.',
                link: 'admin-showcase-review.html',
                is_read: false
            }));
            rows.push({
                user_id: user.id,
                notification_type: 'service',
                title: '✅ 통역사 선택 완료',
                message: '"' + exName + '" 공고에서 ' + itpName + ' 통역사를 선택했습니다. 콘텐츄어 관리자 확정 후 계약이 생성됩니다.',
                is_read: false
            });
            if (rows.length > 0) await sb.from('24_알림').insert(rows);
        } catch (notifErr) { console.warn('선택 알림 실패 (무시):', notifErr); }

        return res.status(200).json({ ok: true });
    } catch (e) {
        console.error('Customer select applicant error:', e);
        return res.status(500).json({ error: '서버 오류가 발생했습니다.' });
    }
}

// ────────────────────────── 디스패처 ──────────────────────────
module.exports = async function handler(req, res) {
    if (!SERVICE_KEY) return res.status(500).json({ error: '서버 설정 오류(SERVICE_KEY 누락).' });

    const route = req.query._route || '';
    switch (route) {
        case 'submit-inquiry': return handleInquiry(req, res);
        case 'submit-application': return handleApplication(req, res);
        case 'submit-showcase-posting': return handleShowcasePosting(req, res);
        case 'submit-showcase-apply': return handleShowcaseApply(req, res);
        case 'update-showcase-posting': return handleUpdateShowcasePosting(req, res);
        case 'cancel-showcase-posting': return handleCancelShowcasePosting(req, res);
        case 'customer-select-applicant': return handleCustomerSelectApplicant(req, res);
        case 'cancel-inquiry': return handleCancelInquiry(req, res);
        case 'upload-application-file': return handleUploadFile(req, res);
        case 'notify-admins': return handleNotifyAdmins(req, res);
        default: return res.status(404).json({ error: 'Unknown route: ' + route });
    }
};
