// ══════════════ 통역사 대시보드 - Supabase 데이터 레이어 ══════════════

const InterpreterData = {

    _userId: null,

    // 현재 로그인된 통역사 ID 가져오기
    async getUserId() {
        if (this._userId) return this._userId;
        if (!supabase) return null;
        const { data: { user } } = await supabase.auth.getUser();
        if (user) this._userId = user.id;
        return this._userId;
    },

    // ══════════════ 정산 내역 ══════════════

    async loadSettlements() {
        if (!supabase) return null;
        try {
            const userId = await this.getUserId();
            if (!userId) return null;

            const { data, error } = await supabase
                .from('43_정산내역')
                .select('*, bank:bank_account_id (bank_name, account_holder, account_number)')
                .eq('interpreter_id', userId)
                .order('requested_at', { ascending: false });

            if (error) throw error;
            if (!data || data.length === 0) return null;

            const statusMap = { request: '승인 대기', approved: '승인 완료', paid: '입금 완료', rejected: '반려' };

            return data.map(d => ({
                id: d.id,
                dbId: d.id,
                expo: d.exhibition_name,
                client: d.client_company,
                start: d.start_date,
                end: d.end_date,
                lang: d.language_pair,
                days: d.working_days,
                rate: d.daily_rate,
                amount: d.gross_amount,
                tax: d.tax_amount,
                status: d.status,
                statusText: statusMap[d.status] || d.status,
                requestDate: d.requested_at ? d.requested_at.split('T')[0] : '',
                approvedDate: d.approved_at ? d.approved_at.split('T')[0] : undefined,
                rejectedDate: d.rejected_at ? d.rejected_at.split('T')[0] : undefined,
                paidDate: d.paid_at ? d.paid_at.split('T')[0] : undefined,
                rejectReason: d.reject_reason,
                contractId: d.contract_id,
                timeline: buildTimeline(d)
            }));
        } catch (e) {
            console.error('정산 로드 실패:', e);
            return null;
        }
    },

    // 정산 재요청
    async reRequestSettlement(dbId) {
        if (!supabase || !dbId) return false;
        try {
            const { error } = await supabase
                .from('43_정산내역')
                .update({
                    status: 'request',
                    requested_at: new Date().toISOString(),
                    rejected_at: null,
                    rejected_by: null,
                    reject_reason: null
                })
                .eq('id', dbId);
            return !error;
        } catch (e) { return false; }
    },

    // ══════════════ 계좌 정보 ══════════════

    async loadBankAccount() {
        if (!supabase) return null;
        try {
            const userId = await this.getUserId();
            if (!userId) return null;

            const { data, error } = await supabase
                .from('41_계좌정보')
                .select('*')
                .eq('user_id', userId)
                .maybeSingle();

            if (error) throw error;
            return data;
        } catch (e) {
            console.error('계좌 로드 실패:', e);
            return null;
        }
    },

    async saveBankAccount(bankName, accountHolder, accountNumber) {
        if (!supabase) return false;
        try {
            const userId = await this.getUserId();
            if (!userId) return false;

            const { error } = await supabase
                .from('41_계좌정보')
                .upsert({
                    user_id: userId,
                    bank_name: bankName,
                    account_holder: accountHolder,
                    account_number: accountNumber
                }, { onConflict: 'user_id' });

            return !error;
        } catch (e) {
            console.error('계좌 저장 실패:', e);
            return false;
        }
    },

    // ══════════════ 프로필 ══════════════

    async loadProfile() {
        if (!supabase) return null;
        try {
            const userId = await this.getUserId();
            if (!userId) return null;

            const { data, error } = await supabase
                .from('40_통역사프로필')
                .select('*, user:user_id (name, email, phone)')
                .eq('user_id', userId)
                .maybeSingle();

            if (error) throw error;
            return data;
        } catch (e) {
            console.error('프로필 로드 실패:', e);
            return null;
        }
    },

    async saveProfile(profileData) {
        if (!supabase) return false;
        try {
            const userId = await this.getUserId();
            if (!userId) return false;

            // 통역사 프로필 업데이트
            const { error } = await supabase
                .from('40_통역사프로필')
                .upsert({
                    user_id: userId,
                    display_name: profileData.name,
                    phone: profileData.phone,
                    intro: profileData.intro,
                    languages: profileData.langs || [],
                    specialties: profileData.fields || [],
                    base_rate: profileData.rates?.booth || 150000,
                    rate_by_type: profileData.rates || {},
                    rate_by_language: profileData.langRates || {}
                }, { onConflict: 'user_id' });

            if (error) {
                console.error('통역사 프로필 저장 실패:', error);
                return false;
            }

            // 회원 테이블도 업데이트
            const { error: memberError } = await supabase
                .from('01_회원')
                .update({
                    name: profileData.name,
                    phone: profileData.phone
                })
                .eq('id', userId);

            if (memberError) {
                console.error('회원 정보 업데이트 실패:', memberError);
                return false;
            }

            return true;
        } catch (e) {
            console.error('프로필 저장 실패:', e);
            return false;
        }
    },

    // ══════════════ 계약 ══════════════

    async loadContracts() {
        if (!supabase) return null;
        try {
            const userId = await this.getUserId();
            if (!userId) return null;

            const { data, error } = await supabase
                .from('42_통역계약')
                .select('*, customer:customer_id (name)')
                .eq('interpreter_id', userId)
                .order('start_date', { ascending: false });

            if (error) throw error;
            if (!data || data.length === 0) return null;

            const statusMap = {
                pending: '대기', deposit_paid: '계약금 결제', in_progress: '진행 중',
                completed: '완료', settled: '정산 완료', cancelled: '취소'
            };

            return data.map(d => ({
                id: d.id, dbId: d.id,
                expo: d.exhibition_name,
                client: d.client_company,
                customerName: d.customer?.name || '',
                status: d.status,
                statusText: statusMap[d.status] || d.status,
                startDate: d.start_date,
                endDate: d.end_date,
                lang: d.language_pair,
                days: d.working_days,
                dailyRate: d.daily_rate,
                totalAmount: d.total_amount,
                taxAmount: d.tax_amount,
                netAmount: d.net_amount,
                depositStatus: d.deposit_status,
                balanceStatus: d.balance_status,
                settlementStatus: d.settlement_status,
                contractSigned: d.contract_signed
            }));
        } catch (e) {
            console.error('계약 로드 실패:', e);
            return null;
        }
    },

    // ══════════════ 상담일지 ══════════════

    async loadConsultationLogs() {
        if (!supabase) return null;
        try {
            const userId = await this.getUserId();
            if (!userId) return null;

            const { data, error } = await supabase
                .from('44_상담일지')
                .select('*')
                .eq('interpreter_id', userId)
                .order('consultation_date', { ascending: false });

            if (error) throw error;
            return data;
        } catch (e) {
            console.error('상담일지 로드 실패:', e);
            return null;
        }
    },

    async saveConsultationLog(logData) {
        if (!supabase) return false;
        try {
            const userId = await this.getUserId();
            if (!userId) return false;

            const insertData = {
                interpreter_id: userId,
                exhibition_name: logData.exhibitionName,
                consultation_date: logData.date,
                buyer_company: logData.buyerCompany,
                buyer_contact: logData.buyerContact,
                buyer_country: logData.buyerCountry,
                discussion_summary: logData.summary,
                buyer_interest: logData.buyerInterest,
                follow_up_needed: logData.followUp || false,
                follow_up_notes: logData.followUpNotes,
                status: logData.status || 'submitted'
            };

            if (logData.contractId) insertData.contract_id = logData.contractId;

            const { error } = await supabase
                .from('44_상담일지')
                .insert(insertData);

            return !error;
        } catch (e) {
            console.error('상담일지 저장 실패:', e);
            return false;
        }
    },

    // ══════════════ 알림 ══════════════

    async loadNotifications() {
        if (!supabase) return null;
        try {
            const userId = await this.getUserId();
            if (!userId) return null;

            const { data, error } = await supabase
                .from('24_알림')
                .select('*')
                .eq('user_id', userId)
                .order('created_at', { ascending: false })
                .limit(20);

            if (error) throw error;
            return data;
        } catch (e) { return null; }
    },

    async markNotificationRead(notifId) {
        if (!supabase) return false;
        try {
            const { error } = await supabase
                .from('24_알림')
                .update({ is_read: true, read_at: new Date().toISOString() })
                .eq('id', notifId);
            return !error;
        } catch (e) { return false; }
    }
};

// 타임라인 빌더
function buildTimeline(d) {
    var tl = [
        { step: '통역 완료', date: d.end_date || '', done: true },
        { step: '정산 요청', date: d.requested_at ? d.requested_at.split('T')[0].replace(/-/g, '.') : '', done: true }
    ];
    if (d.status === 'rejected') {
        tl.push({ step: '관리자 반려', date: d.rejected_at ? d.rejected_at.split('T')[0].replace(/-/g, '.') : '', done: false, rejected: true });
        tl.push({ step: '입금', date: '-', done: false });
    } else if (d.status === 'request') {
        tl.push({ step: '관리자 승인', date: '대기 중', done: false, active: true });
        tl.push({ step: '입금', date: '-', done: false });
    } else if (d.status === 'approved') {
        tl.push({ step: '관리자 승인', date: d.approved_at ? d.approved_at.split('T')[0].replace(/-/g, '.') : '', done: true });
        tl.push({ step: '입금', date: '처리 중', done: false, active: true });
    } else if (d.status === 'paid') {
        tl.push({ step: '관리자 승인', date: d.approved_at ? d.approved_at.split('T')[0].replace(/-/g, '.') : '', done: true });
        tl.push({ step: '입금 완료', date: d.paid_at ? d.paid_at.split('T')[0].replace(/-/g, '.') : '', done: true });
    }
    return tl;
}
