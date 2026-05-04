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
