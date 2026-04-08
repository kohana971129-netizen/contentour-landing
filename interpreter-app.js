// ══════════════ 통역사 대시보드 - Supabase 연동 ══════════════
// interpreter-dashboard.html에서 로드됨
// 의존성: supabase-config.js (전역 supabase 클라이언트, ContentourAuth)

// HTML 이스케이프 (XSS 방지)
function escHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

const InterpreterApp = {
    currentUser: null,   // auth user
    profile: null,       // 01_회원
    interpProfile: null, // 40_통역사프로필
    bankAccount: null,   // 41_계좌정보

    // 캐시된 데이터 (뷰 간 공유)
    _contracts: [],
    _settlements: [],
    _notifications: [],
    _assignments: [],

    // ── 초기화 ──
    async init() {
        try {
            // 1) 인증 확인 (interpreter 역할만 허용)
            // 데모 모드 토큰 제거 (보안 강화)
            sessionStorage.removeItem('demoMode');
            sessionStorage.removeItem('demoToken');

            // Supabase 세션 확인
            let userProfile = null;
            if (window.sbClient) {
                const { data: { session } } = await window.sbClient.auth.getSession();
                if (session) {
                    userProfile = await ContentourAuth.getUserProfile();
                }
            }

            if (userProfile && (userProfile.role === 'interpreter' || userProfile.role === 'admin')) {
                console.log('[InterpreterApp] 로그인 확인:', userProfile.email, userProfile.role);
                this.currentUser = userProfile.auth;
                this.profile = userProfile;

                // 2) 통역사 프로필 로드
                try { await this.loadInterpreterProfile(); } catch (e) { console.warn('[InterpreterApp] 프로필 로드 실패:', e); }

                // 3) UI에 사용자 정보 반영
                this.renderUserInfo();

                // 4) 대시보드 홈 데이터 로드
                console.log('[InterpreterApp] currentUser.id:', this.currentUser?.id);
                await this.loadDashboardHome();
                console.log('[InterpreterApp] 로드 완료 - assignments:', this._assignments?.length, 'contracts:', this._contracts?.length);

                // 5) 뷰 전환 훅 등록
                this.hookViewSwitcher();

                // 6) 실시간 배정 알림 구독
                this.subscribeRealtime();
            } else {
                // 세션 없음 — 로그인 페이지로 이동
                console.warn('[InterpreterApp] 세션 없음 — 로그인 페이지로 이동');
                window.location.href = 'client-auth.html?tab=interpreter';
                return;
            }

        } catch (err) {
            console.error('[InterpreterApp] init error:', err);
        }
    },

    // ── 실시간 배정 알림 구독 ──
    subscribeRealtime() {
        if (!window.sbClient || !this.currentUser) return;
        try {
            window.sbClient
                .channel('interpreter-assignments')
                .on('postgres_changes', {
                    event: 'INSERT',
                    schema: 'public',
                    table: '42_통역계약',
                    filter: 'interpreter_id=eq.' + this.currentUser.id
                }, async (payload) => {
                    console.log('[Realtime] 새 배정 수신:', payload.new);
                    // 배정 데이터 새로고침
                    const assignments = await this.loadPendingAssignments();
                    this._assignments = assignments;
                    this.renderHomeKPI(assignments, this._contracts || [], this._settlements || []);
                    this.renderHomeAssignments(assignments);
                    this.renderWelcomeBanner(assignments, this._contracts || []);
                    // 토스트 알림
                    this.showToast('📋 새로운 배정 요청이 도착했습니다: ' + (payload.new.exhibition_name || ''));
                })
                .on('postgres_changes', {
                    event: 'UPDATE',
                    schema: 'public',
                    table: '42_통역계약',
                    filter: 'interpreter_id=eq.' + this.currentUser.id
                }, async (payload) => {
                    console.log('[Realtime] 계약 업데이트:', payload.new);
                    // 결제 상태 등 변경 시 계약 데이터 새로고침
                    const contracts = await this.loadContracts();
                    this._contracts = contracts;
                    this.updateCalendarEvents(contracts);
                    // 계약 관리 뷰가 열려있으면 자동 갱신
                    if (typeof renderInterpreterContracts === 'function') {
                        await this.loadContractsView();
                    }
                })
                .subscribe();
            console.log('[InterpreterApp] Realtime 구독 시작');
        } catch (e) {
            console.warn('[InterpreterApp] Realtime 구독 실패:', e);
        }
    },

    // ── 뷰 전환 시 데이터 로드 훅 ──
    hookViewSwitcher() {
        const origSwitchView = window.switchView;
        window.switchView = (view, e) => {
            // 기존 switchView 호출
            origSwitchView(view, e);
            // 뷰별 데이터 로드
            this.onViewSwitch(view);
        };
    },

    async onViewSwitch(view) {
        switch (view) {
            case 'assignments':
                await this.loadAssignmentsView();
                break;
            case 'schedule':
                // 캘린더 진입 시 최신 계약 데이터로 일정 갱신
                if (this._contracts) this.updateCalendarEvents(this._contracts);
                break;
            case 'settlement':
                await this.loadSettlementView();
                break;
            case 'contracts':
                await this.loadContractsView();
                break;
            case 'profile':
                this.loadProfileView();
                break;
        }
    },

    // ══════════════ 데이터 로딩 ══════════════

    async loadInterpreterProfile() {
        const { data, error } = await window.sbClient
            .from('40_통역사프로필')
            .select('*')
            .eq('user_id', this.currentUser.id)
            .single();

        if (!error && data) {
            this.interpProfile = data;
        }

        const { data: bank } = await window.sbClient
            .from('41_계좌정보')
            .select('*')
            .eq('user_id', this.currentUser.id)
            .maybeSingle();

        this.bankAccount = bank;
    },

    async loadPendingAssignments() {
        const { data, error } = await window.sbClient
            .from('42_통역계약')
            .select('*')
            .eq('interpreter_id', this.currentUser.id)
            .is('interpreter_accepted', null)
            .eq('status', 'pending')
            .order('created_at', { ascending: false });

        return error ? [] : (data || []);
    },

    async loadAllAssignments() {
        const { data, error } = await window.sbClient
            .from('42_통역계약')
            .select('*')
            .eq('interpreter_id', this.currentUser.id)
            .order('created_at', { ascending: false });

        return error ? [] : (data || []);
    },

    async loadContracts() {
        const { data, error } = await window.sbClient
            .from('42_통역계약')
            .select('*')
            .eq('interpreter_id', this.currentUser.id)
            .order('start_date', { ascending: true });

        return error ? [] : (data || []);
    },

    async loadSettlements() {
        const { data, error } = await window.sbClient
            .from('43_정산내역')
            .select('*')
            .eq('interpreter_id', this.currentUser.id)
            .order('created_at', { ascending: false });

        return error ? [] : (data || []);
    },

    async loadNotifications() {
        const { data, error } = await window.sbClient
            .from('24_알림')
            .select('*')
            .eq('user_id', this.currentUser.id)
            .order('created_at', { ascending: false })
            .limit(20);

        return error ? [] : (data || []);
    },

    async loadJournals(contractId) {
        let query = window.sbClient
            .from('44_상담일지')
            .select('*')
            .eq('interpreter_id', this.currentUser.id)
            .order('consultation_date', { ascending: false });

        if (contractId) query = query.eq('contract_id', contractId);

        const { data, error } = await query;
        return error ? [] : (data || []);
    },

    // ══════════════ 대시보드 홈 ══════════════

    async loadDashboardHome() {
        const results = await Promise.allSettled([
            this.loadPendingAssignments(),
            this.loadContracts(),
            this.loadSettlements(),
            this.loadNotifications(),
            this.loadJournals()
        ]);
        const assignments = results[0].status === 'fulfilled' ? results[0].value : [];
        const contracts = results[1].status === 'fulfilled' ? results[1].value : [];
        const settlements = results[2].status === 'fulfilled' ? results[2].value : [];
        const notifications = results[3].status === 'fulfilled' ? results[3].value : [];
        const journals = results[4].status === 'fulfilled' ? results[4].value : [];
        results.forEach((r, i) => { if (r.status === 'rejected') console.warn('Dashboard data load failed [' + i + ']:', r.reason); });

        this._assignments = assignments;
        this._contracts = contracts;
        this._settlements = settlements;
        this._notifications = notifications;

        this.renderHomeKPI(assignments, contracts, settlements);
        this.renderHomeAssignments(assignments);
        this.renderHomeSchedule(contracts);
        this.renderHomeSettlement(settlements);
        this.renderHomeJournals(journals, contracts);
        this.renderHomeNotifications(notifications);
        this.renderProfileCompletion();

        // 환영 배너 업데이트
        this.renderWelcomeBanner(assignments, contracts);
    },

    renderUserInfo() {
        const name = this.interpProfile?.display_name || this.profile.name || '통역사';
        const nameEl = document.querySelector('.sb-user__name');
        if (nameEl) nameEl.textContent = name;

        const roleEl = document.querySelector('.sb-user__role');
        if (roleEl) {
            const langs = this.interpProfile?.languages || [];
            roleEl.textContent = langs.length > 0 ? langs.join(' / ') + ' 전문 통역사' : '전문 통역사';
        }

        // 탑바 인사말
        const greetEl = document.querySelector('.topbar__greeting strong');
        if (greetEl) greetEl.textContent = name + '님';

        // 환영 배너
        const welcomeEl = document.querySelector('.welcome-banner__title');
        if (welcomeEl) welcomeEl.textContent = '안녕하세요, ' + name + '님';

        // 탑바 사용자 이름
        const userNameEl = document.querySelector('.user-name');
        if (userNameEl) userNameEl.textContent = name;

        // 프로필 뷰 헤더
        const pfName = document.getElementById('pfHeaderName');
        if (pfName) pfName.textContent = name;
        const pfDesc = document.getElementById('pfHeaderDesc');
        if (pfDesc) {
            const langs = this.interpProfile?.languages || [];
            const exp = this.interpProfile?.experience_years || 0;
            pfDesc.textContent = (langs.length > 0 ? langs.join(' · ') : '언어 미설정') + ' | 전시 통역 전문' + (exp > 0 ? ' | 경력 ' + exp + '년' : '');
        }
        const pfRating = document.getElementById('pfHeaderRating');
        if (pfRating) pfRating.textContent = '⭐ ' + (this.interpProfile?.rating || 0) + '/5.0';
        const pfCases = document.getElementById('pfHeaderCases');
        if (pfCases) pfCases.textContent = '📋 통역 ' + (this.interpProfile?.cases_count || 0) + '건 완료';

        // 프로필 이미지
        const imgUrl = this.interpProfile?.profile_image_url;
        if (imgUrl) {
            const avatarEls = document.querySelectorAll('.sb-user__avatar, .topbar__avatar');
            avatarEls.forEach(el => {
                el.style.backgroundImage = `url(${imgUrl})`;
                el.style.backgroundSize = 'cover';
                el.textContent = '';
            });
        }
    },

    renderHomeKPI(assignments, contracts, settlements) {
        const kpiCards = document.querySelectorAll('.kpi-card');
        const now = new Date();
        const thisMonth = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');

        // 신규 배정 요청 수
        if (kpiCards[0]) {
            const numEl = kpiCards[0].querySelector('.kpi-num');
            if (numEl) numEl.textContent = assignments.length;
        }

        // 이번 달 예정 일정
        const monthContracts = contracts.filter(c =>
            c.start_date && c.start_date.startsWith(thisMonth) &&
            ['deposit_paid', 'in_progress'].includes(c.status)
        );
        if (kpiCards[1]) {
            const numEl = kpiCards[1].querySelector('.kpi-num');
            if (numEl) numEl.textContent = monthContracts.length;
        }

        // 이번 달 완료
        const completedThisMonth = contracts.filter(c =>
            c.end_date && c.end_date.startsWith(thisMonth) && c.status === 'completed'
        );
        if (kpiCards[2]) {
            const numEl = kpiCards[2].querySelector('.kpi-num');
            if (numEl) numEl.textContent = completedThisMonth.length;
        }

        // 이번 달 정산
        const monthSettlement = settlements
            .filter(s => s.status === 'paid' && s.paid_at && s.paid_at.startsWith(thisMonth))
            .reduce((sum, s) => sum + (s.net_amount || 0), 0);
        if (kpiCards[3]) {
            const numEl = kpiCards[3].querySelector('.kpi-num');
            if (numEl) numEl.textContent = this.formatMoney(monthSettlement);
        }

        // 사이드바 배정 배지
        const assignBadge = document.getElementById('assignNavBadge');
        if (assignBadge) {
            assignBadge.textContent = assignments.length;
            assignBadge.style.display = assignments.length > 0 ? '' : 'none';
        }
    },

    renderHomeAssignments(assignments) {
        // 배정 요청 카드의 body 컨테이너 찾기
        const cardBody = document.querySelector('#view-home .dashboard-grid .card:first-child .card__body');
        const container = cardBody;
        if (!container) return;

        const badge = document.querySelector('.card__head-badge');
        if (badge) badge.textContent = assignments.length;

        // assignData 전역에 홈 배정 데이터도 등록 (상세보기 모달용)
        if (!window.assignData) window.assignData = {};
        const serviceTypeKo = { 'BOOTH': '부스 상주', 'MEETING': '미팅 동행', 'ONSITE_OPS': '현장 운영', 'OTHER': '기타' };
        assignments.forEach(c => {
            const days = c.working_days || 1;
            const totalPay = c.daily_rate ? (c.daily_rate * days) : c.total_amount;
            const sType = serviceTypeKo[c.service_type] || c.service_type || '-';
            window.assignData[c.id] = {
                title: c.exhibition_name || '', client: c.client_company || '',
                requestDate: this.formatDate(c.created_at), status: 'new',
                date: this.formatDate(c.start_date) + ' ~ ' + this.formatDate(c.end_date),
                time: days + '일간', location: c.venue || '-',
                lang: c.language_pair || '-', field: sType, type: sType,
                pay: this.formatMoney(c.daily_rate) + ' / 일 (총 ' + this.formatMoney(totalPay) + ')',
                note: c.client_company ? '고객사: ' + c.client_company + ' | 파견 ' + days + '일' : '-',
                prep: c.contract_signed ? '고객사 계약서 동의 완료' : '고객사 계약서 확인 대기 중',
                dress: '비즈니스 캐주얼 (현장 확인)'
            };
        });

        if (assignments.length === 0) {
            container.innerHTML = '<div style="padding:24px;text-align:center;color:var(--gray-400);font-size:0.85rem;">새로운 배정 요청이 없습니다.</div>';
            return;
        }

        container.innerHTML = assignments.map(a => `
            <div class="assign-item" data-contract-id="${escHtml(a.id)}">
                <div class="assign-item__top">
                    <span class="assign-item__title">${escHtml(a.exhibition_name) || '전시회'}</span>
                    <span class="assign-item__date">${this.formatDate(a.start_date)} ~ ${this.formatDate(a.end_date)}</span>
                </div>
                <div class="assign-item__meta">
                    <span>${escHtml(a.client_company)}</span>
                    <span>${escHtml(a.language_pair)}</span>
                    <span>${this.formatMoney(a.daily_rate)}/일</span>
                </div>
                <div class="assign-item__actions">
                    <button class="btn-accept" onclick="InterpreterApp.handleHomeAccept('${escHtml(a.id)}', this)">수락</button>
                    <button class="btn-decline" onclick="InterpreterApp.handleHomeDecline('${escHtml(a.id)}', this)">거절</button>
                </div>
            </div>
        `).join('');
    },

    renderHomeSchedule(contracts) {
        const todayStr = new Date().toISOString().slice(0, 10);
        const upcoming = contracts
            .filter(c => c.start_date >= todayStr && c.interpreter_accepted === true)
            .sort((a, b) => a.start_date.localeCompare(b.start_date))
            .slice(0, 3);

        const container = document.querySelector('.schedule-list');
        if (!container) return;

        if (upcoming.length === 0) {
            container.innerHTML = '<div style="padding:24px;text-align:center;color:var(--gray-400);font-size:0.85rem;">예정된 일정이 없습니다.</div>';
            return;
        }

        const statusColorMap = {
            deposit_paid: '#1565c0', in_progress: '#2e7d32',
            completed: '#9daec8', settled: '#9daec8', pending: '#f57c00'
        };
        const statusTextMap = {
            deposit_paid: '파견 확정', in_progress: '진행중',
            completed: '완료', settled: '정산 완료', pending: '대기'
        };

        // 일정 데이터를 assignData에도 등록 (상세 모달용)
        if (!window.assignData) window.assignData = {};
        const serviceTypeKo = { 'BOOTH': '부스 상주', 'MEETING': '미팅 동행', 'ONSITE_OPS': '현장 운영', 'OTHER': '기타' };
        upcoming.forEach(c => {
            const days = c.working_days || 1;
            const totalPay = c.daily_rate ? (c.daily_rate * days) : c.total_amount;
            const sType = serviceTypeKo[c.service_type] || c.service_type || '-';
            window.assignData[c.id] = {
                title: c.exhibition_name || '', client: c.client_company || '',
                requestDate: this.formatDate(c.created_at), status: 'accepted',
                date: this.formatDate(c.start_date) + ' ~ ' + this.formatDate(c.end_date),
                time: days + '일간', location: c.venue || '-',
                lang: c.language_pair || '-', field: sType, type: sType,
                pay: this.formatMoney(c.daily_rate) + ' / 일 (총 ' + this.formatMoney(totalPay) + ')',
                note: c.client_company ? '고객사: ' + c.client_company + ' | 파견 ' + days + '일' : '-',
                prep: c.contract_signed ? '고객사 계약서 동의 완료' : '고객사 계약서 확인 대기 중',
                dress: '비즈니스 캐주얼 (현장 확인)'
            };
        });

        container.innerHTML = upcoming.map(c => {
            const start = new Date(c.start_date + 'T00:00:00');
            const end = new Date(c.end_date + 'T00:00:00');
            const today = new Date(); today.setHours(0, 0, 0, 0);
            const diff = Math.ceil((start - today) / (1000 * 60 * 60 * 24));
            const ddayText = diff === 0 ? 'D-Day' : diff > 0 ? 'D-' + diff : 'D+' + Math.abs(diff);
            const ddayColor = diff <= 3 ? '#e53935' : diff <= 7 ? '#f57c00' : '#1565c0';
            const days = Math.max(1, Math.round((end - start) / 86400000) + 1);
            const color = statusColorMap[c.status] || '#1565c0';
            const stText = statusTextMap[c.status] || '예정';
            const lang = escHtml(c.language_pair || '');
            const sType = c.service_type || '';
            const sTypeKo = { 'BOOTH': '부스 상주', 'MEETING': '미팅 동행', 'ONSITE_OPS': '현장 운영' }[sType] || sType || '';

            return `
                <div onclick="openAssignModal('${escHtml(c.id)}')" class="schedule-list-item">
                    <div class="sch-home-dday">
                        <div class="sch-home-dday__label" style="color:${ddayColor};background:${ddayColor}12;">${ddayText}</div>
                        <div class="sch-home-dday__sub">${days}일</div>
                    </div>
                    <div class="sch-home-info">
                        <div class="sch-home-info__top">
                            <span class="sch-home-info__title">${escHtml(c.exhibition_name)}</span>
                            <span class="sch-home-info__badge" style="color:${color};background:${color}14;">${stText}</span>
                        </div>
                        <div class="sch-home-info__meta">
                            <span>🏢 ${escHtml(c.client_company)}</span>
                            <span>📍 ${escHtml(c.venue) || '-'}</span>
                            <span>📅 ${this.formatDate(c.start_date)} ~ ${this.formatDate(c.end_date)}</span>
                            ${lang ? '<span>🌐 ' + lang + '</span>' : ''}
                            ${sTypeKo ? '<span>🏷️ ' + escHtml(sTypeKo) + '</span>' : ''}
                            <span>💰 ${this.formatMoney(c.daily_rate)}/일</span>
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        this.updateCalendarEvents(contracts);
    },

    renderHomeSettlement(settlements) {
        const container = document.querySelector('#view-home .settle-item')?.parentElement;
        if (!container) return;

        const recent = settlements
            .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))
            .slice(0, 3);

        if (recent.length === 0) {
            container.innerHTML = '<div style="padding:24px;text-align:center;color:var(--gray-400);font-size:0.85rem;">정산 내역이 없습니다.</div>';
            return;
        }

        const statusMap = { request: '승인 대기', approved: '승인 완료', paid: '입금 완료', rejected: '반려' };
        const statusCls = { request: 'settle-pending', approved: 'settle-done', paid: 'settle-done', rejected: 'settle-reject' };

        container.innerHTML = recent.map(s => `
            <div class="settle-item">
                <div class="settle-item__info">
                    <div class="settle-item__title">${escHtml(s.exhibition_name)}</div>
                    <div class="settle-item__meta">${this.formatDate(s.end_date)} | ${escHtml(s.client_company)}</div>
                </div>
                <div class="settle-item__amount">${this.formatMoney(s.net_amount)}</div>
                <span class="settle-item__status ${statusCls[s.status] || ''}">${statusMap[s.status] || escHtml(s.status)}</span>
            </div>
        `).join('');
    },

    renderHomeJournals(journals, contracts) {
        const container = document.querySelector('#view-home .journal-item')?.parentElement;
        if (!container) return;

        // 완료된 계약 중 상담일지가 제출되지 않은 건 찾기
        const todayStr = new Date().toISOString().slice(0, 10);
        const completedContracts = contracts.filter(c =>
            c.end_date < todayStr && c.interpreter_accepted === true
        );
        const submittedContractIds = new Set(journals.map(j => j.contract_id));

        const pending = completedContracts.filter(c => !submittedContractIds.has(c.id));
        const submitted = completedContracts.filter(c => submittedContractIds.has(c.id)).slice(0, 2);

        if (pending.length === 0 && submitted.length === 0) {
            container.innerHTML = '<div style="padding:24px;text-align:center;color:var(--gray-400);font-size:0.85rem;">상담일지 항목이 없습니다.</div>';
            return;
        }

        let html = '';
        pending.forEach(c => {
            html += `
                <div class="journal-item">
                    <div class="journal-item__icon draft">📝</div>
                    <div class="journal-item__info">
                        <div class="journal-item__title">${escHtml(c.exhibition_name)}</div>
                        <div class="journal-item__meta">${this.formatDate(c.end_date)} 완료 | ${escHtml(c.client_company)}</div>
                    </div>
                    <span class="journal-item__status status-draft">미제출</span>
                </div>`;
        });
        submitted.forEach(c => {
            html += `
                <div class="journal-item">
                    <div class="journal-item__icon done">✅</div>
                    <div class="journal-item__info">
                        <div class="journal-item__title">${escHtml(c.exhibition_name)}</div>
                        <div class="journal-item__meta">${this.formatDate(c.end_date)} 완료 | ${escHtml(c.client_company)}</div>
                    </div>
                    <span class="journal-item__status status-submitted">제출 완료</span>
                </div>`;
        });
        container.innerHTML = html;
    },

    renderWelcomeBanner(assignments, contracts) {
        const todayStr = new Date().toISOString().slice(0, 10);
        const todayCount = contracts.filter(c =>
            c.start_date <= todayStr && c.end_date >= todayStr && c.interpreter_accepted === true
        ).length;

        const descEl = document.querySelector('.welcome-banner__desc');
        if (descEl) {
            let parts = [];
            if (todayCount > 0) parts.push(`오늘 예정된 통역 일정 <strong style="color:var(--sky)">${todayCount}건</strong>이 있습니다.`);
            if (assignments.length > 0) parts.push(`새로운 배정 요청 <strong style="color:var(--sky)">${assignments.length}건</strong>을 확인해주세요.`);
            descEl.innerHTML = parts.length > 0 ? parts.join(' ') : '현재 예정된 일정이 없습니다. 편안한 하루 보내세요!';
        }
    },

    renderHomeNotifications(notifications) {
        const container = document.querySelector('.notice-list');
        if (!container) return;

        const recent = notifications.slice(0, 5);

        if (recent.length === 0) {
            container.innerHTML = '<div style="padding:16px;text-align:center;color:var(--gray-400);font-size:0.82rem;">새 알림이 없습니다.</div>';
            return;
        }

        const iconMap = {
            assignment: '📋', settlement: '💰', contract: '📝',
            chat: '💬', system: '🔔', service: '🎯', payment: '💳', matching: '🤝'
        };

        container.innerHTML = recent.map(n => `
            <div class="notice-item ${n.is_read ? '' : 'unread'}" onclick="InterpreterApp.markNotificationRead('${escHtml(n.id)}')">
                <span class="notice-item__icon">${iconMap[n.notification_type] || '🔔'}</span>
                <div class="notice-item__text">${escHtml(n.title)}</div>
                <div class="notice-item__time">${this.timeAgo(n.created_at)}</div>
            </div>
        `).join('');

        // 배정 요청 수 + 읽지 않은 알림 수 합산
        const unreadCount = notifications.filter(n => !n.is_read).length;
        const assignCount = this._assignments ? this._assignments.length : 0;
        const totalBadge = unreadCount + assignCount;

        // topbar 배지 (숫자)
        const bellBadge = document.getElementById('topbarNotifBadge');
        if (bellBadge) {
            bellBadge.textContent = totalBadge;
            bellBadge.style.display = totalBadge > 0 ? 'flex' : 'none';
        }
        // topbar 빨간 점
        const notifDot = document.getElementById('topbarNotifDot');
        if (notifDot) {
            notifDot.style.display = totalBadge > 0 ? '' : 'none';
        }
        // 알림 패널 카운트
        const panelCount = document.getElementById('notifPanelCount');
        if (panelCount) panelCount.textContent = totalBadge;
    },

    renderProfileCompletion() {
        const p = this.interpProfile;
        if (!p) return;

        const checks = [
            { label: '기본 정보', done: !!(p.display_name && p.phone) },
            { label: '언어 설정', done: p.languages && p.languages.length > 0 },
            { label: '전문 분야', done: p.specialties && p.specialties.length > 0 },
            { label: '자격/경력', done: p.experience_years > 0 || (p.certifications && p.certifications.length > 0) },
            { label: '단가 설정', done: p.base_rate > 0 },
            { label: '계좌 등록', done: !!this.bankAccount },
            { label: '자기소개', done: !!p.intro },
            { label: '프로필 사진', done: !!p.profile_image_url }
        ];

        const doneCount = checks.filter(c => c.done).length;
        const percent = Math.round((doneCount / checks.length) * 100);

        const progressBar = document.querySelector('.profile-progress__fill');
        if (progressBar) progressBar.style.width = percent + '%';

        const percentText = document.querySelector('.profile-progress__text');
        if (percentText) percentText.textContent = percent + '%';

        const checkList = document.querySelector('.profile-checklist');
        if (checkList) {
            checkList.innerHTML = checks.map(c =>
                `<span class="profile-check ${c.done ? 'completed' : ''}">
                    ${c.done ? '✅' : '⬜'} ${c.label}
                </span>`
            ).join('');
        }
    },

    // ══════════════ 배정 요청 뷰 (상세) ══════════════

    async loadAssignmentsView() {
        const allContracts = await this.loadAllAssignments();

        // 상태 매핑: DB status → 뷰 status
        const items = allContracts.map(c => {
            let viewStatus = 'new';
            if (c.interpreter_accepted === true) viewStatus = 'accepted';
            else if (c.interpreter_accepted === false) viewStatus = 'declined';
            else if (c.status === 'pending') viewStatus = 'new';
            else if (c.status === 'cancelled') viewStatus = 'declined';
            else viewStatus = 'accepted';
            return { ...c, viewStatus };
        });

        // assignData 전역 갱신 (모달용)
        window.assignData = {};
        const serviceTypeKo = { 'BOOTH': '부스 상주', 'MEETING': '미팅 동행', 'ONSITE_OPS': '현장 운영', 'OTHER': '기타' };
        items.forEach(c => {
            const days = c.working_days || 1;
            const totalPay = c.daily_rate ? (c.daily_rate * days) : c.total_amount;
            const sType = serviceTypeKo[c.service_type] || c.service_type || '-';
            window.assignData[c.id] = {
                title: c.exhibition_name || '',
                client: c.client_company || '',
                requestDate: this.formatDate(c.created_at),
                status: c.viewStatus,
                date: this.formatDate(c.start_date) + ' ~ ' + this.formatDate(c.end_date),
                time: (c.working_days || 1) + '일간',
                location: c.venue || '-',
                lang: c.language_pair || '-',
                field: sType,
                type: sType,
                pay: this.formatMoney(c.daily_rate) + ' / 일 (총 ' + this.formatMoney(totalPay) + ')',
                note: c.client_company ? '고객사: ' + c.client_company + ' | 파견 ' + days + '일' : '-',
                prep: c.contract_signed ? '고객사 계약서 동의 완료' : '고객사 계약서 확인 대기 중',
                dress: '비즈니스 캐주얼 (현장 확인)'
            };
        });

        // 필터 카운트 업데이트
        const counts = { all: items.length, new: 0, accepted: 0, declined: 0 };
        items.forEach(c => { if (counts[c.viewStatus] !== undefined) counts[c.viewStatus]++; });

        const chips = document.querySelectorAll('#view-assignments .filter-chip .chip-count');
        if (chips[0]) chips[0].textContent = counts.all;
        if (chips[1]) chips[1].textContent = counts.new;
        if (chips[2]) chips[2].textContent = counts.accepted;
        if (chips[3]) chips[3].textContent = counts.declined;

        // 카드 리스트 렌더링
        const container = document.getElementById('assignCardList');
        if (!container) return;

        if (items.length === 0) {
            container.innerHTML = '<div style="padding:40px;text-align:center;color:var(--gray-400);font-size:0.88rem;">배정 요청이 없습니다.</div>';
            return;
        }

        const statusBarMap = { new: 'status-bar-new', accepted: 'status-bar-accepted', declined: 'status-bar-declined' };
        const badgeMap = { new: 'asb-new', accepted: 'asb-accepted', declined: 'asb-declined' };
        const badgeTextMap = { new: '신규 요청', accepted: '수락 완료', declined: '거절됨' };

        container.innerHTML = items.map(c => {
            const vs = c.viewStatus;
            const actionBtns = vs === 'new'
                ? `<button class="btn-accept-lg" onclick="InterpreterApp.handleCardAcceptDB('${escHtml(c.id)}', this)">수락하기</button>
                   <button class="btn-decline-lg" onclick="InterpreterApp.handleCardDeclineDB('${escHtml(c.id)}', this)">거절</button>`
                : '';

            return `
                <div class="assign-card" data-status="${vs}" data-id="${escHtml(c.id)}">
                    <div class="assign-card__status-bar ${statusBarMap[vs] || ''}"></div>
                    <div class="assign-card__body">
                        <div class="assign-card__top">
                            <div>
                                <div class="assign-card__title">${escHtml(c.exhibition_name)}</div>
                                <div class="assign-card__company">🏢 ${escHtml(c.client_company)} | 요청일: ${this.formatDate(c.created_at)}</div>
                            </div>
                            <span class="assign-card__status-badge ${badgeMap[vs] || ''}">${badgeTextMap[vs] || ''}</span>
                        </div>
                        <div class="assign-card__details">
                            <div class="assign-card__detail"><span class="assign-card__detail-icon">📅</span> ${this.formatDate(c.start_date)} ~ ${this.formatDate(c.end_date)}</div>
                            <div class="assign-card__detail"><span class="assign-card__detail-icon">📍</span> ${escHtml(c.venue) || '-'}</div>
                            <div class="assign-card__detail"><span class="assign-card__detail-icon">💰</span> ${this.formatMoney(c.daily_rate)} / 일 x ${c.working_days || '-'}일</div>
                        </div>
                        <div class="assign-card__tags">
                            ${c.language_pair ? `<span class="assign-tag tag-lang">${escHtml(c.language_pair)}</span>` : ''}
                            ${c.service_type ? `<span class="assign-tag tag-type">${escHtml(c.service_type)}</span>` : ''}
                        </div>
                        <div class="assign-card__footer" style="margin-top:16px;">
                            <button class="btn-detail" onclick="openAssignModal('${escHtml(c.id)}')">상세 보기</button>
                            ${actionBtns}
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    },

    async handleCardAcceptDB(contractId, btn) {
        btn.disabled = true;
        btn.textContent = '처리 중...';
        const ok = await this.acceptAssignment(contractId);
        if (ok) {
            await this.loadAssignmentsView(); // 뷰 새로고침
        } else {
            btn.disabled = false;
            btn.textContent = '수락하기';
        }
    },

    async handleCardDeclineDB(contractId, btn) {
        const reason = prompt('거절 사유를 입력해주세요 (선택):');
        btn.disabled = true;
        btn.textContent = '처리 중...';
        const ok = await this.declineAssignment(contractId, reason);
        if (ok) {
            await this.loadAssignmentsView();
        } else {
            btn.disabled = false;
            btn.textContent = '거절';
        }
    },

    // ══════════════ 정산 내역 뷰 (상세) ══════════════

    async loadSettlementView() {
        const settlements = await this.loadSettlements();
        this._settlements = settlements;

        // 전역 stlData 교체 (기존 함수들이 참조)
        window.stlData = settlements.map(s => ({
            id: s.id,
            expo: s.exhibition_name || '',
            client: s.client_company || '',
            start: s.start_date || '',
            end: s.end_date || '',
            lang: s.language_pair || '',
            days: s.working_days || 0,
            rate: s.daily_rate || 0,
            amount: s.net_amount || 0,
            tax: s.tax_amount || 0,
            status: s.status,
            statusText: this.settlementStatusText(s.status),
            requestDate: this.formatDate(s.requested_at),
            approvedDate: s.approved_at ? this.formatDate(s.approved_at) : null,
            paidDate: s.paid_at ? this.formatDate(s.paid_at) : null,
            rejectedDate: s.rejected_at ? this.formatDate(s.rejected_at) : null,
            rejectReason: s.reject_reason || '',
            platformFee: s.platform_fee || 0,
            clientTotal: s.client_total || 0,
            timeline: this.buildSettlementTimeline(s)
        }));

        // 기존 stlInit 호출 (summary, counts, list 렌더링)
        if (typeof stlInit === 'function') stlInit();
    },

    settlementStatusText(status) {
        const map = { request: '승인 대기', approved: '승인 완료', paid: '입금 완료', rejected: '반려' };
        return map[status] || status;
    },

    buildSettlementTimeline(s) {
        const timeline = [
            { step: '통역 완료', date: s.end_date ? this.formatDate(s.end_date) : '-', done: true },
            { step: '정산 요청', date: s.requested_at ? this.formatDate(s.requested_at) : '-', done: true }
        ];

        if (s.status === 'rejected') {
            timeline.push({ step: '관리자 반려', date: s.rejected_at ? this.formatDate(s.rejected_at) : '-', done: false, rejected: true });
            timeline.push({ step: '입금', date: '-', done: false });
        } else if (s.status === 'request') {
            timeline.push({ step: '관리자 승인', date: '대기 중', done: false, active: true });
            timeline.push({ step: '입금', date: '-', done: false });
        } else if (s.status === 'approved') {
            timeline.push({ step: '관리자 승인', date: s.approved_at ? this.formatDate(s.approved_at) : '-', done: true });
            timeline.push({ step: '입금', date: '처리 중', done: false, active: true });
        } else if (s.status === 'paid') {
            timeline.push({ step: '관리자 승인', date: s.approved_at ? this.formatDate(s.approved_at) : '-', done: true });
            timeline.push({ step: '입금 완료', date: s.paid_at ? this.formatDate(s.paid_at) : '-', done: true });
        }

        return timeline;
    },

    // ══════════════ 계약 관리 뷰 (상세) ══════════════

    async loadContractsView() {
        const contracts = await this.loadContracts();
        this._contracts = contracts;

        // 전역 interpreterContracts 교체
        window.interpreterContracts = contracts.map(c => {
            const serviceFee = (c.daily_rate || 0) * (c.working_days || 0);
            const platformFee = Math.round(serviceFee * 0.10);
            const tax = Math.round((serviceFee - platformFee) * 0.033);
            const netAmount = serviceFee - platformFee - tax;

            return {
                id: c.id,
                expo: c.exhibition_name || '',
                client: { name: c.client_company || '', company: c.client_company || '' },
                status: c.status,
                statusText: this.contractStatusText(c.status),
                dates: { start: c.start_date || '', end: c.end_date || '' },
                lang: c.language_pair || '',
                dailyRate: c.daily_rate || 0,
                days: c.working_days || 0,
                serviceFee,
                platformFee,
                tax,
                netAmount,
                depositStatus: c.deposit_status || 'pending',
                depositPaidAt: c.deposit_paid_at || null,
                balanceStatus: c.balance_status || 'pending',
                balancePaidAt: c.balance_paid_at || null,
                settlementStatus: c.settlement_status || 'pending',
                contractSigned: c.contract_signed || false,
                customerAgreed: c.contract_signed || false,
                interpreterAgreed: c.interpreter_accepted || false,
                timeline: this.buildContractTimeline(c)
            };
        });

        // 기존 renderInterpreterContracts 호출
        if (typeof renderInterpreterContracts === 'function') renderInterpreterContracts();
    },

    contractStatusText(status) {
        const map = {
            pending: '배정 대기',
            deposit_paid: '계약금 결제 완료',
            in_progress: '서비스 진행중',
            completed: '서비스 완료',
            settled: '정산 완료',
            cancelled: '취소됨'
        };
        return map[status] || status;
    },

    buildContractTimeline(c) {
        const timeline = [];
        timeline.push({ step: '계약 생성', date: this.formatDate(c.created_at), done: true });

        if (c.interpreter_accepted === true) {
            timeline.push({ step: '통역사 수락', date: c.accepted_at ? this.formatDate(c.accepted_at) : '', done: true });
        } else if (c.interpreter_accepted === false) {
            timeline.push({ step: '통역사 거절', date: c.rejected_at ? this.formatDate(c.rejected_at) : '', done: false, rejected: true });
            return timeline;
        } else {
            timeline.push({ step: '통역사 수락 대기', date: '', done: false, active: true });
            return timeline;
        }

        const statusOrder = ['pending', 'deposit_paid', 'in_progress', 'completed', 'settled'];
        const currentIdx = statusOrder.indexOf(c.status);

        // 계약금 결제
        const depositDone = currentIdx >= 1;
        timeline.push({
            step: '고객 계약금 결제',
            date: depositDone && c.deposit_paid_at ? this.formatDate(c.deposit_paid_at) : (depositDone ? this.formatDate(c.updated_at) : ''),
            done: depositDone,
            active: currentIdx === 0
        });

        // 서비스 진행
        const inProgressDone = currentIdx >= 2;
        timeline.push({
            step: '서비스 진행',
            date: inProgressDone ? this.formatDate(c.start_date) : '',
            done: inProgressDone,
            active: currentIdx === 1
        });

        // 서비스 완료
        const completeDone = currentIdx >= 3;
        timeline.push({
            step: '서비스 완료',
            date: completeDone ? this.formatDate(c.updated_at) : '',
            done: completeDone,
            active: currentIdx === 2
        });

        // 고객 잔금 결제
        timeline.push({
            step: '고객 잔금 결제',
            date: c.balance_paid_at ? this.formatDate(c.balance_paid_at) : '',
            done: c.balance_status === 'paid',
            active: completeDone && c.balance_status !== 'paid'
        });

        // 정산 완료
        const settledDone = currentIdx >= 4;
        timeline.push({
            step: '정산 완료',
            date: settledDone ? this.formatDate(c.updated_at) : '',
            done: settledDone,
            active: c.balance_status === 'paid' && !settledDone
        });

        return timeline;
    },

    // ══════════════ 프로필 뷰 (상세) ══════════════

    loadProfileView() {
        const p = this.interpProfile;
        if (!p) return;

        // 기본 정보 채우기
        const setVal = (id, val) => { const el = document.getElementById(id); if (el && val) el.value = val; };

        setVal('pf-name', p.display_name);
        setVal('pf-email', this.profile.email);
        setVal('pf-phone', p.phone);
        setVal('pf-intro', p.intro);

        // 언어 태그 활성화
        if (p.languages && p.languages.length > 0) {
            document.querySelectorAll('#pf-langs .pf-lang-tag').forEach(tag => {
                if (p.languages.includes(tag.textContent.trim())) {
                    tag.classList.add('active');
                }
            });
        }

        // 전문 분야 태그 활성화
        if (p.specialties && p.specialties.length > 0) {
            document.querySelectorAll('#pf-fields .pf-lang-tag').forEach(tag => {
                if (p.specialties.includes(tag.textContent.trim())) {
                    tag.classList.add('active');
                }
            });
        }

        // 단가 정보 (승인된 단가 표시)
        const rates = p.rate_by_type || {};
        setVal('rate-booth', rates.booth);
        setVal('rate-meeting', rates.meeting);
        setVal('rate-conference', rates.conference);
        setVal('rate-operation', rates.operation);

        const langRates = p.rate_by_language || {};
        setVal('lrate-en', langRates.en);
        setVal('lrate-jp', langRates.jp);
        setVal('lrate-cn', langRates.cn);
        setVal('lrate-de', langRates.de);
        setVal('lrate-vn', langRates.vn);
        setVal('lrate-ar', langRates.ar);

        // 프로필 사진 로드
        if (p.profile_image_url) {
            const pfImg = document.getElementById('pfAvatarImg');
            const pfIcon = document.getElementById('pfAvatarIcon');
            if (pfImg) { pfImg.src = p.profile_image_url; pfImg.style.display = 'block'; }
            if (pfIcon) { pfIcon.style.display = 'none'; }
        }

        // 단가 승인 상태 배너 표시
        if (typeof renderRateStatusBanner === 'function') {
            renderRateStatusBanner(p);
        }

        // 계좌 정보
        if (this.bankAccount) {
            setVal('bankName', this.bankAccount.bank_name);
            setVal('bankHolder', this.bankAccount.account_holder);
            setVal('bankAccount', this.bankAccount.account_number);

            const bankBadge = document.getElementById('bankStatusBadge');
            if (bankBadge) {
                bankBadge.style.background = '#e8f5e9';
                bankBadge.style.color = '#2e7d32';
                bankBadge.style.border = '1px solid #c8e6c9';
                bankBadge.textContent = '✅ 등록 완료 — ' + this.bankAccount.bank_name + ' ' + this.bankAccount.account_holder;
            }
        }

        // 단가 미리보기 업데이트
        if (typeof updateRatePreview === 'function') updateRatePreview();
    },

    // ══════════════ 캘린더 이벤트 ══════════════

    updateCalendarEvents(contracts) {
        const statusColorMap = {
            'completed': '#9daec8', 'settled': '#9daec8',
            'in_progress': '#2e7d32', 'deposit_paid': '#1565c0'
        };

        window.schEvents = contracts
            .filter(c => c.interpreter_accepted === true)
            .map(c => ({
                id: c.id,
                title: c.exhibition_name,
                client: c.client_company,
                location: c.venue || '',
                lang: c.language_pair || '',
                time: '',
                start: c.start_date,
                end: c.end_date,
                color: statusColorMap[c.status] || '#1565c0',
                status: c.status === 'completed' || c.status === 'settled' ? 'done' :
                        c.status === 'in_progress' ? 'confirmed' : 'upcoming',
                statusText: c.status === 'completed' || c.status === 'settled' ? '완료' :
                            c.status === 'in_progress' ? '확정' : '예정'
            }));
    },

    // ══════════════ DB 액션 ══════════════

    async acceptAssignment(contractId) {
        const { error } = await window.sbClient
            .from('42_통역계약')
            .update({
                interpreter_accepted: true,
                accepted_at: new Date().toISOString(),
                status: 'deposit_paid'
            })
            .eq('id', contractId)
            .eq('interpreter_id', this.currentUser.id);

        if (error) { this.showToast('배정 수락 실패: ' + error.message); return false; }
        this.showToast('배정을 수락했습니다.');
        return true;
    },

    async declineAssignment(contractId, reason) {
        const { error } = await window.sbClient
            .from('42_통역계약')
            .update({
                interpreter_accepted: false,
                rejected_at: new Date().toISOString(),
                reject_reason: reason || '',
                status: 'cancelled'
            })
            .eq('id', contractId)
            .eq('interpreter_id', this.currentUser.id);

        if (error) { this.showToast('배정 거절 실패: ' + error.message); return false; }
        this.showToast('배정을 거절했습니다.');
        return true;
    },

    async saveInterpreterProfile(profileData) {
        const updateData = {
            display_name: profileData.name,
            phone: profileData.phone,
            intro: profileData.intro,
            languages: profileData.langs || [],
            specialties: profileData.fields || [],
            base_rate: profileData.baseRate || 150000,
            rate_by_type: profileData.rates || {},
            rate_by_language: profileData.langRates || {},
            updated_at: new Date().toISOString()
        };

        const { error } = await window.sbClient
            .from('40_통역사프로필')
            .update(updateData)
            .eq('user_id', this.currentUser.id);

        if (error) { this.showToast('프로필 저장 실패: ' + error.message); return false; }

        await window.sbClient
            .from('01_회원')
            .update({ name: profileData.name, phone: profileData.phone, updated_at: new Date().toISOString() })
            .eq('id', this.currentUser.id);

        this.interpProfile = { ...this.interpProfile, ...updateData };
        this.showToast('프로필이 저장되었습니다.');
        return true;
    },

    async saveBankAccount(bankData) {
        const payload = {
            user_id: this.currentUser.id,
            bank_name: bankData.name,
            account_holder: bankData.holder,
            account_number: bankData.account
        };

        if (this.bankAccount) {
            const { error } = await window.sbClient
                .from('41_계좌정보')
                .update({ ...payload, updated_at: new Date().toISOString() })
                .eq('id', this.bankAccount.id);
            if (error) { this.showToast('계좌 저장 실패: ' + error.message); return false; }
        } else {
            const { data, error } = await window.sbClient
                .from('41_계좌정보')
                .insert(payload)
                .select()
                .single();
            if (error) { this.showToast('계좌 등록 실패: ' + error.message); return false; }
            this.bankAccount = data;
        }

        this.showToast('계좌 정보가 저장되었습니다.');
        return true;
    },

    async saveJournal(journalData) {
        const payload = {
            interpreter_id: this.currentUser.id,
            contract_id: journalData.contractId || null,
            order_id: journalData.orderId || null,
            customer_id: journalData.customerId || null,
            exhibition_name: journalData.expo,
            consultation_date: journalData.date,
            buyer_company: journalData.buyerCompany || null,
            buyer_contact: journalData.buyerContact || null,
            buyer_country: journalData.buyerCountry || null,
            discussion_summary: journalData.summary || null,
            buyer_interest: journalData.buyerInterest || null,
            follow_up_needed: journalData.followUpNeeded || false,
            follow_up_notes: journalData.followUpNotes || null,
            status: journalData.status || 'draft'
        };

        if (journalData.id) {
            const { error } = await window.sbClient
                .from('44_상담일지')
                .update({ ...payload, updated_at: new Date().toISOString() })
                .eq('id', journalData.id)
                .eq('interpreter_id', this.currentUser.id);
            if (error) { this.showToast('상담일지 저장 실패: ' + error.message); return false; }
        } else {
            if (journalData.status === 'submitted') payload.submitted_at = new Date().toISOString();
            const { error } = await window.sbClient.from('44_상담일지').insert(payload);
            if (error) { this.showToast('상담일지 등록 실패: ' + error.message); return false; }
        }

        this.showToast(journalData.status === 'submitted' ? '상담일지가 제출되었습니다.' : '상담일지가 임시 저장되었습니다.');
        return true;
    },

    async markNotificationRead(notifId) {
        await window.sbClient
            .from('24_알림')
            .update({ is_read: true, read_at: new Date().toISOString() })
            .eq('id', notifId)
            .eq('user_id', this.currentUser.id);
    },

    async logout() {
        await ContentourAuth.logout();
        window.location.href = 'client-auth.html';
    },

    // ══════════════ 홈 배정 수락/거절 ══════════════

    async handleHomeAccept(contractId, btn) {
        btn.disabled = true;
        btn.textContent = '처리 중...';
        const ok = await this.acceptAssignment(contractId);
        if (ok) {
            const item = btn.closest('.assign-item');
            if (item) { item.style.opacity = '0.5'; item.style.pointerEvents = 'none'; }
            const badge = document.querySelector('.card__head-badge');
            if (badge) badge.textContent = Math.max(0, parseInt(badge.textContent) - 1);
        } else {
            btn.disabled = false;
            btn.textContent = '수락';
        }
    },

    async handleHomeDecline(contractId, btn) {
        btn.disabled = true;
        btn.textContent = '처리 중...';
        const ok = await this.declineAssignment(contractId);
        if (ok) {
            const item = btn.closest('.assign-item');
            if (item) { item.style.opacity = '0.5'; item.style.pointerEvents = 'none'; }
            const badge = document.querySelector('.card__head-badge');
            if (badge) badge.textContent = Math.max(0, parseInt(badge.textContent) - 1);
        } else {
            btn.disabled = false;
            btn.textContent = '거절';
        }
    },

    // ══════════════ 프로필 저장 오버라이드 ══════════════
    // 기존 saveProfile()을 DB 연동 버전으로 교체
    overrideSaveProfile() {
        window._origSaveProfile = window.saveProfile;
        window.saveProfile = async () => {
            const data = getRateData();

            // 언어/전문분야 수집
            const langs = [];
            document.querySelectorAll('#pf-langs .pf-lang-tag.active').forEach(el => langs.push(el.textContent.trim()));
            const fields = [];
            document.querySelectorAll('#pf-fields .pf-lang-tag.active').forEach(el => fields.push(el.textContent.trim()));

            // DB에 프로필 저장
            await InterpreterApp.saveInterpreterProfile({
                name: data.name,
                phone: data.phone,
                intro: data.intro,
                langs,
                fields,
                baseRate: data.rates.booth || 150000,
                rates: data.rates,
                langRates: data.langRates
            });

            // 계좌 정보 저장
            const bankName = document.getElementById('bankName')?.value;
            const bankHolder = document.getElementById('bankHolder')?.value;
            const bankAccount = document.getElementById('bankAccount')?.value;

            if (bankName && bankHolder && bankAccount) {
                await InterpreterApp.saveBankAccount({ name: bankName, holder: bankHolder, account: bankAccount });

                const bankBadge = document.getElementById('bankStatusBadge');
                if (bankBadge) {
                    bankBadge.style.background = '#e8f5e9';
                    bankBadge.style.color = '#2e7d32';
                    bankBadge.style.border = '1px solid #c8e6c9';
                    bankBadge.textContent = '✅ 등록 완료 — ' + bankName + ' ' + bankHolder;
                }
            }

            // localStorage도 호환성을 위해 유지
            if (window._origSaveProfile) window._origSaveProfile();

            InterpreterApp.renderProfileCompletion();
        };
    },

    // ══════════════ 계좌 확인 오버라이드 ══════════════
    overrideBankCheck() {
        window._origIsBankRegistered = window.isBankAccountRegistered;
        window.isBankAccountRegistered = () => {
            return !!InterpreterApp.bankAccount;
        };
    },

    // ══════════════ 유틸리티 ══════════════

    formatDate(dateStr) {
        if (!dateStr) return '-';
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return dateStr;
        return d.getFullYear() + '.' + String(d.getMonth() + 1).padStart(2, '0') + '.' + String(d.getDate()).padStart(2, '0');
    },

    formatMoney(amount) {
        if (!amount) return '₩0';
        return '₩' + Number(amount).toLocaleString();
    },

    timeAgo(dateStr) {
        if (!dateStr) return '';
        const diff = Date.now() - new Date(dateStr).getTime();
        const min = Math.floor(diff / 60000);
        if (min < 1) return '방금';
        if (min < 60) return min + '분 전';
        const hr = Math.floor(min / 60);
        if (hr < 24) return hr + '시간 전';
        const day = Math.floor(hr / 24);
        if (day < 7) return day + '일 전';
        return this.formatDate(dateStr);
    },

    showToast(msg) {
        if (typeof showToast === 'function') {
            showToast(msg);
        } else {
            const toast = document.getElementById('toast');
            if (toast) {
                toast.textContent = msg;
                toast.classList.add('show');
                setTimeout(() => toast.classList.remove('show'), 3000);
            }
        }
    }
};

// 페이지 로드 시 초기화 (DOMContentLoaded가 이미 발생한 경우도 대응)
function _startInterpreterApp() {
    InterpreterApp.init().then(() => {
        InterpreterApp.overrideSaveProfile();
        InterpreterApp.overrideBankCheck();
        // 해시 라우팅: URL 해시에 따라 초기 뷰 전환
        var hash = window.location.hash.replace('#', '');
        if (hash && hash !== 'home' && typeof switchView === 'function') {
            switchView(hash);
        }
        window.addEventListener('hashchange', function() {
            var h = window.location.hash.replace('#', '');
            if (h && typeof switchView === 'function') switchView(h);
        });
    }).catch(err => console.error('[InterpreterApp] init failed:', err));
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _startInterpreterApp);
} else {
    _startInterpreterApp();
}
