// ══════════════ 프로덕션 console.log silencer ══════════════
// 운영 도메인에서만 console.log 무력화 (warn/error는 유지하여 진단성 보존)
(function() {
    var host = location.hostname;
    var isProd = host === 'contentour-landing.vercel.app' || host === 'contentour.co.kr' || host.endsWith('.contentour.co.kr');
    if (isProd) {
        console.log = function() {};
    }
})();

// ══════════════ 비밀번호 보기 토글 (모든 password input에 자동 적용) ══════════════
// 페이지 로드 시 type="password" input마다 우측에 👁 버튼을 자동으로 붙임.
// 동적으로 추가되는 input에는 window.attachPwToggle(el)을 직접 호출하면 됨.
// 비활성화하려면 input에 data-no-pw-toggle 속성 추가.
// Heroicons Solid (MIT License, Tailwind Labs) — 상업용 무료, 콘텐츄어 디자인 톤(filled)에 맞춤
var __PW_ICON_EYE = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="18" height="18" aria-hidden="true"><path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"/><path fill-rule="evenodd" d="M1.323 11.447C2.811 6.976 7.028 3.75 12.001 3.75c4.97 0 9.185 3.223 10.675 7.69.12.362.12.752 0 1.113-1.487 4.471-5.705 7.697-10.677 7.697-4.97 0-9.186-3.223-10.675-7.69a1.762 1.762 0 0 1 0-1.113ZM17.25 12a5.25 5.25 0 1 1-10.5 0 5.25 5.25 0 0 1 10.5 0Z" clip-rule="evenodd"/></svg>';
var __PW_ICON_EYE_OFF = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="18" height="18" aria-hidden="true"><path d="M3.53 2.47a.75.75 0 0 0-1.06 1.06l18 18a.75.75 0 1 0 1.06-1.06l-18-18ZM22.676 12.553a11.249 11.249 0 0 1-2.631 4.31l-3.099-3.099a5.25 5.25 0 0 0-6.71-6.71L7.759 4.577a11.217 11.217 0 0 1 4.242-.827c4.97 0 9.185 3.223 10.675 7.69.12.362.12.752 0 1.113Z"/><path d="M15.75 12c0 .18-.013.357-.037.53l-4.244-4.243A3.75 3.75 0 0 1 15.75 12ZM12.53 15.713l-4.243-4.244a3.75 3.75 0 0 0 4.244 4.243Z"/><path d="M6.75 12c0-.619.107-1.213.304-1.764l-3.1-3.1a11.25 11.25 0 0 0-2.63 4.31c-.12.362-.12.752 0 1.114 1.489 4.467 5.704 7.69 10.675 7.69 1.5 0 2.933-.294 4.242-.827l-2.477-2.477A5.25 5.25 0 0 1 6.75 12Z"/></svg>';

window.attachPwToggle = function(input) {
    if (!input || input.type !== 'password' || input.dataset.pwToggle === '1') return;
    if (input.hasAttribute('data-no-pw-toggle')) return;
    input.dataset.pwToggle = '1';

    var parent = input.parentElement;
    if (!parent) return;
    if (getComputedStyle(parent).position === 'static') parent.style.position = 'relative';

    // 입력칸 우측에 버튼 공간 확보
    var curPad = parseInt(getComputedStyle(input).paddingRight) || 0;
    if (curPad < 40) input.style.paddingRight = '40px';

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.innerHTML = __PW_ICON_EYE;
    btn.setAttribute('aria-label', '비밀번호 보기/숨기기');
    btn.tabIndex = -1;
    btn.style.cssText = 'position:absolute;right:6px;top:50%;transform:translateY(-50%);background:none;border:none;cursor:pointer;color:#8a95a8;padding:6px;line-height:0;z-index:2;display:inline-flex;align-items:center;justify-content:center;border-radius:8px;transition:color .15s,background .15s;';
    btn.onmouseenter = function() { btn.style.color = '#1565c0'; btn.style.background = 'rgba(21,101,192,0.08)'; };
    btn.onmouseleave = function() { btn.style.color = '#8a95a8'; btn.style.background = 'none'; };
    btn.onclick = function() {
        if (input.type === 'password') { input.type = 'text'; btn.innerHTML = __PW_ICON_EYE_OFF; }
        else { input.type = 'password'; btn.innerHTML = __PW_ICON_EYE; }
    };
    parent.appendChild(btn);
};

// 기존에 HTML에 직접 박힌 .pw-toggle 버튼(이모지 사용)도 SVG로 갈아끼움
window.upgradeExistingPwToggle = function(btn) {
    if (!btn || btn.dataset.pwToggleUpgraded === '1') return;
    var input = btn.parentElement && btn.parentElement.querySelector('input[type="password"], input[type="text"]');
    if (!input) {
        var m = (btn.getAttribute('onclick') || '').match(/togglePw\s*\(\s*['"]([^'"]+)['"]/);
        if (m) input = document.getElementById(m[1]);
    }
    if (!input) return;
    btn.innerHTML = __PW_ICON_EYE;
    btn.removeAttribute('onclick');
    btn.onclick = function() {
        if (input.type === 'password') { input.type = 'text'; btn.innerHTML = __PW_ICON_EYE_OFF; }
        else { input.type = 'password'; btn.innerHTML = __PW_ICON_EYE; }
    };
    btn.dataset.pwToggleUpgraded = '1';
    input.dataset.pwToggle = '1'; // 자동 부착이 중복 안 하도록 마킹
};

document.addEventListener('DOMContentLoaded', function() {
    // 1. 기존 수동 토글(.pw-toggle) 먼저 SVG로 업그레이드
    document.querySelectorAll('button.pw-toggle').forEach(function(btn) {
        try { window.upgradeExistingPwToggle(btn); } catch(e) {}
    });
    // 2. 토글이 없는 password input에 자동 부착
    document.querySelectorAll('input[type="password"]').forEach(function(input) {
        try { window.attachPwToggle(input); } catch(e) {}
    });
});

// ══════════════ 공용 토스트 (alert 대체) ══════════════
// 페이지에 #__toastRoot이 없으면 자동 생성. type: 'info' | 'success' | 'error'
window.showToast = window.showToast || function(message, type) {
    try {
        var root = document.getElementById('__toastRoot');
        if (!root) {
            root = document.createElement('div');
            root.id = '__toastRoot';
            root.style.cssText = 'position:fixed;left:50%;bottom:32px;transform:translateX(-50%);z-index:99999;display:flex;flex-direction:column;gap:8px;align-items:center;pointer-events:none;';
            document.body.appendChild(root);
        }
        var bg = type === 'error' ? '#c62828' : (type === 'success' ? '#2e7d32' : '#333');
        var t = document.createElement('div');
        t.textContent = message;
        t.style.cssText = 'background:' + bg + ';color:#fff;padding:12px 18px;border-radius:10px;font-size:0.9rem;font-weight:600;box-shadow:0 4px 16px rgba(0,0,0,0.18);max-width:90vw;white-space:pre-line;text-align:center;opacity:0;transform:translateY(8px);transition:opacity .25s,transform .25s;font-family:"Noto Sans KR",sans-serif;';
        root.appendChild(t);
        requestAnimationFrame(function() { t.style.opacity = '1'; t.style.transform = 'translateY(0)'; });
        setTimeout(function() {
            t.style.opacity = '0';
            t.style.transform = 'translateY(8px)';
            setTimeout(function() { if (t.parentNode) t.parentNode.removeChild(t); }, 300);
        }, 2800);
    } catch (e) {}
};

// ══════════════ Supabase 설정 ══════════════
(function () {
    var SUPABASE_URL = 'https://jgeqbdrfpekzuumaklvx.supabase.co';
    var SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpnZXFiZHJmcGVrenV1bWFrbHZ4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ4MzgwMzQsImV4cCI6MjA5MDQxNDAzNH0.C2y3UiPtHIF2s4nPvbGycN927HOG4YpO86FfgZAelUw';

    // Supabase 클라이언트 초기화 (SDK의 window.supabase와 충돌 방지)
    var sb = window.supabase
        ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
        : null;

    // 전역에 등록
    window.sbClient = sb;

    // ══════════════ 인증 유틸리티 ══════════════
    window.ContentourAuth = {

        // 현재 로그인된 사용자 가져오기
        async getCurrentUser() {
            if (!sb) return null;
            const { data: { user } } = await sb.auth.getUser();
            return user;
        },

        // 사용자 프로필 (role 포함) 가져오기
        async getUserProfile() {
            const user = await this.getCurrentUser();
            if (!user) return null;

            const { data, error } = await sb
                .from('01_회원')
                .select('*')
                .eq('id', user.id)
                .single();

            if (error) return null;
            return { ...data, auth: user };
        },

        // 이메일/비밀번호 로그인
        async login(email, password) {
            if (!sb) return { error: { message: 'Supabase가 초기화되지 않았습니다.' } };

            const { data, error } = await sb.auth.signInWithPassword({
                email: email,
                password: password
            });

            if (error) return { data: null, error };

            // 회원 테이블에서 역할 조회
            const { data: profile, error: profileError } = await sb
                .from('01_회원')
                .select('role, name')
                .eq('id', data.user.id)
                .single();

            if (profileError) return { data: null, error: { message: '회원 정보를 찾을 수 없습니다.' } };

            return {
                data: {
                    user: data.user,
                    session: data.session,
                    role: profile.role,
                    name: profile.name
                },
                error: null
            };
        },

        // 회원가입 (고객사)
        async registerCustomer({ email, password, name, phone, company, brn, position, brnFile }) {
            if (!sb) return { error: { message: 'Supabase가 초기화되지 않았습니다.' } };

            const { data: authData, error: authError } = await sb.auth.signUp({
                email: email,
                password: password,
                options: {
                    data: { name: name, role: 'customer', phone: phone }
                }
            });

            if (authError) return { data: null, error: authError };

            // 01_회원은 DB 트리거(handle_new_user)가 role, phone 포함 자동 생성
            // 가입 직후 세션이 있으면 파일 업로드 + 회사정보 저장
            const userId = authData && authData.user ? authData.user.id : null;
            let warningMsg = '';

            // 사업자등록증 파일 업로드
            let brnFileUrl = null;
            if (brnFile && userId) {
                try {
                    const ts = Date.now();
                    const safeName = brnFile.name.replace(/[^a-zA-Z0-9._-]/g, '_');
                    const path = userId + '/' + ts + '_' + safeName;
                    const { error: upErr } = await sb.storage
                        .from('business-registrations')
                        .upload(path, brnFile, { upsert: false, contentType: brnFile.type });
                    if (upErr) {
                        console.warn('사업자등록증 파일 업로드 실패:', upErr.message);
                        warningMsg = '가입은 완료되었으나 사업자등록증 업로드에 실패했습니다. 마이페이지에서 다시 업로드해주세요.';
                    } else {
                        brnFileUrl = path;
                    }
                } catch (e) {
                    console.warn('사업자등록증 업로드 예외:', e);
                    warningMsg = '가입은 완료되었으나 사업자등록증 업로드에 실패했습니다. 마이페이지에서 다시 업로드해주세요.';
                }
            }

            // 01_회원에 회사명·사업자번호·등록증 정보 저장
            if (userId) {
                const updateFields = {};
                if (company) updateFields.company_name = company;
                if (brn) updateFields.business_number = brn;
                if (brnFileUrl) {
                    updateFields.business_registration_url = brnFileUrl;
                    updateFields.business_registration_status = 'pending';
                    updateFields.business_registration_uploaded_at = new Date().toISOString();
                }
                if (Object.keys(updateFields).length > 0) {
                    const { error: updErr } = await sb
                        .from('01_회원')
                        .update(updateFields)
                        .eq('id', userId);
                    if (updErr) {
                        console.warn('회원 정보 업데이트 실패:', updErr.message);
                        if (!warningMsg) warningMsg = '가입은 완료되었으나 기업 정보 저장에 실패했습니다. 마이페이지에서 다시 입력해주세요.';
                    }
                }
            }

            return { data: authData, error: null, warning: warningMsg || undefined };
        },

        // 회원가입 (통역사)
        async registerInterpreter({ email, password, name, language }) {
            if (!sb) return { error: { message: 'Supabase가 초기화되지 않았습니다.' } };

            const { data: authData, error: authError } = await sb.auth.signUp({
                email: email,
                password: password,
                options: {
                    data: { name: name, role: 'interpreter' }
                }
            });

            if (authError) return { data: null, error: authError };

            // 01_회원은 DB 트리거(handle_new_user)가 자동 생성하므로 별도 insert 불필요

            const langMap = { en: '영어', jp: '일본어', zh: '중국어' };
            const langName = langMap[language] || language;

            const { error: profileError } = await sb
                .from('40_통역사프로필')
                .insert({
                    user_id: authData.user.id,
                    display_name: name,
                    languages: [langName],
                    is_active: false
                });

            if (profileError) {
                console.warn('통역사 프로필 생성 실패:', profileError.message);
            }

            return { data: authData, error: profileError };
        },

        // 로그아웃
        async logout() {
            if (!sb) return;
            // signOut 전에 모든 realtime 구독 해제 (메모리·연결 누수 방지)
            try {
                if (window.ChatData) {
                    if (typeof window.ChatData.unsubscribeChat === 'function') window.ChatData.unsubscribeChat();
                    if (typeof window.ChatData.unsubscribeNotifications === 'function') window.ChatData.unsubscribeNotifications();
                }
                if (window.InterpreterApp && typeof window.InterpreterApp.unsubscribeRealtime === 'function') {
                    window.InterpreterApp.unsubscribeRealtime();
                }
                if (typeof window.unsubscribeCustomerRealtime === 'function') {
                    window.unsubscribeCustomerRealtime();
                }
                if (typeof window.unsubscribeAdminRealtime === 'function') {
                    window.unsubscribeAdminRealtime();
                }
            } catch (e) { console.warn('Realtime 해제 중 오류:', e); }
            await sb.auth.signOut();
            sessionStorage.removeItem('isAdminLoggedIn');
            sessionStorage.removeItem('adminUsername');
            sessionStorage.removeItem('demoMode');
            sessionStorage.removeItem('demoToken');
        },

        // 역할별 대시보드 URL 반환
        getDashboardUrl(role) {
            switch (role) {
                case 'admin': return 'admin-dashboard.html';
                case 'customer': return 'customer-dashboard.html';
                case 'interpreter': return 'interpreter-dashboard.html';
                default: return 'index.html';
            }
        },

        // 페이지 접근 제어
        async requireAuth(allowedRoles) {
            const profile = await this.getUserProfile();

            if (!profile) {
                window.location.href = 'client-auth.html';
                return null;
            }

            if (allowedRoles && !allowedRoles.includes(profile.role)) {
                window.location.href = this.getDashboardUrl(profile.role);
                return null;
            }

            return profile;
        },

        // 비밀번호 재설정 이메일 발송
        async resetPassword(email) {
            if (!sb) return { error: { message: 'Supabase가 초기화되지 않았습니다.' } };

            const { data, error } = await sb.auth.resetPasswordForEmail(email, {
                redirectTo: window.location.origin + '/client-auth.html?mode=reset'
            });

            return { data, error };
        },

        // 새 비밀번호 설정 (재설정 링크 클릭 후)
        async updatePassword(newPassword) {
            if (!sb) return { error: { message: 'Supabase가 초기화되지 않았습니다.' } };

            const { data, error } = await sb.auth.updateUser({
                password: newPassword
            });

            return { data, error };
        },

        // Google OAuth 로그인
        async loginWithGoogle() {
            if (!sb) return { error: { message: 'Supabase가 초기화되지 않았습니다.' } };

            const { data, error } = await sb.auth.signInWithOAuth({
                provider: 'google',
                options: {
                    redirectTo: window.location.origin + '/client-auth.html'
                }
            });

            return { data, error };
        }
    };
})();
