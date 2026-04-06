// ══════════════ 관리자 대시보드 - Supabase 데이터 레이어 ══════════════
// 각 함수는 DB에서 데이터를 가져오고, 실패 시 null을 반환하여 기존 하드코딩 데이터로 폴백

const AdminData = {

    // ── ITQ 견적문의 로드 ──
    async loadInquiries() {
        try {
            // 서버사이드 API로 문의 조회 (RLS 우회)
            var accessToken = '';
            if (supabase) {
                var { data: sessionData } = await supabase.auth.getSession();
                if (sessionData && sessionData.session) accessToken = sessionData.session.access_token;
            }
            if (!accessToken) return null;

            var res = await fetch('/api/admin-inquiries', {
                headers: { 'Authorization': 'Bearer ' + accessToken }
            });
            if (!res.ok) return null;
            var data = await res.json();
            if (!data || data.length === 0) return null;

            // DB 데이터 → 기존 inquiries 형식으로 변환
            return data.map((d, i) => ({
                id: d.id,
                dbId: d.id,
                priority: i < 2 ? 'high' : 'medium',
                company: d.company,
                contact: d.contact_name,
                expo: d.exhibition_name,
                lang: langPairToKo(d.language_pair),
                start: d.start_date,
                end: d.end_date,
                type: serviceTypeToKo(d.service_type),
                status: itqStatusToAdmin(d.status),
                interpreter: (function() { try { var n = JSON.parse(d.admin_note); return n.interpreter || ''; } catch(e) { return ''; } })(),
                received: d.created_at.split('T')[0],
                count: d.headcount || 1,
                location: d.location,
                venue: d.venue,
                keywords: d.keywords,
                message: d.message,
                email: d.email,
                phone: d.phone,
                workingHours: d.working_hours,
                adminNote: d.admin_note
            }));
        } catch (e) {
            console.error('문의 로드 실패:', e);
            return null;
        }
    },

    // ── 문의 상태 업데이트 ──
    async updateInquiryStatus(dbId, status, adminNote) {
        if (!supabase || !dbId) return false;
        try {
            const updateData = { status: status };
            if (adminNote) updateData.admin_note = adminNote;
            const { error } = await supabase
                .from('46_ITQ견적문의')
                .update(updateData)
                .eq('id', dbId);
            return !error;
        } catch (e) { return false; }
    },

    // ── 통역사 목록 로드 ──
    async loadInterpreters() {
        if (!supabase) return null;
        try {
            const { data, error } = await supabase
                .from('40_통역사프로필')
                .select(`
                    *,
                    user:user_id (id, name, email, phone)
                `)
                .eq('is_active', true)
                .order('created_at', { ascending: false });
            if (error) throw error;
            if (!data || data.length === 0) return null;

            const colors = ['#1565c0', '#0277bd', '#00695c', '#4527a0', '#c62828', '#ef6c00'];
            return data.map((d, i) => ({
                id: d.user_id,
                dbId: d.id,
                name: d.display_name || d.user?.name || '통역사',
                initials: (d.display_name || d.user?.name || '?').charAt(0),
                color: colors[i % colors.length],
                langs: d.languages || [],
                field: (d.specialties || []).join(', ') || '일반',
                rating: 4.5,
                cases: 0,
                available: d.is_active,
                baseRate: d.base_rate,
                rateByType: d.rate_by_type,
                rateByLanguage: d.rate_by_language,
                pendingRateByType: d.pending_rate_by_type,
                pendingRateByLanguage: d.pending_rate_by_language,
                rateStatus: d.rate_status || 'approved',
                rateRejectedReason: d.rate_rejected_reason,
                rateSubmittedAt: d.rate_submitted_at,
                email: d.user?.email,
                phone: d.user?.phone || d.phone
            }));
        } catch (e) {
            console.error('통역사 로드 실패:', e);
            return null;
        }
    },

    // ── 정산 내역 로드 ──
    async loadSettlements() {
        if (!supabase) return null;
        try {
            const { data, error } = await supabase
                .from('43_정산내역')
                .select(`
                    *,
                    interpreter:interpreter_id (id, name),
                    bank:bank_account_id (bank_name, account_holder, account_number),
                    contract:contract_id (id)
                `)
                .order('requested_at', { ascending: false });
            if (error) throw error;
            if (!data || data.length === 0) return null;

            const colors = ['#1565c0', '#0277bd', '#00695c', '#4527a0', '#c62828'];
            const statusMap = { request: '승인 대기', approved: '승인 완료', paid: '입금 완료', rejected: '반려' };

            return data.map((d, i) => ({
                id: d.id,
                dbId: d.id,
                interpreter: d.interpreter?.name || '통역사',
                interpreterId: d.interpreter_id,
                interpColor: colors[i % colors.length],
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
                journalSubmitted: true,
                contractId: d.contract_id,
                bankInfo: d.bank ? {
                    name: d.bank.bank_name,
                    holder: d.bank.account_holder,
                    account: d.bank.account_number
                } : null
            }));
        } catch (e) {
            console.error('정산 로드 실패:', e);
            return null;
        }
    },

    // ── 정산 건 생성 (DB) ──
    async createSettlement(contract) {
        if (!supabase || !contract) return { success: false, error: 'DB 미연결' };
        try {
            const serviceFee = (contract.daily_rate || 0) * (contract.working_days || 0);
            const platformFeeRate = 0.10;
            const platformFee = Math.round(serviceFee * platformFeeRate);
            const clientTotal = serviceFee + platformFee;
            const taxAmount = Math.round(serviceFee * 0.033);
            const netAmount = serviceFee - taxAmount;

            const { data, error } = await supabase
                .from('43_정산내역')
                .insert({
                    contract_id: contract.id,
                    interpreter_id: contract.interpreter_id,
                    exhibition_name: contract.exhibition_name,
                    client_company: contract.client_company,
                    language_pair: contract.language_pair,
                    start_date: contract.start_date,
                    end_date: contract.end_date,
                    working_days: contract.working_days,
                    daily_rate: contract.daily_rate,
                    gross_amount: serviceFee,
                    tax_amount: taxAmount,
                    net_amount: netAmount,
                    platform_fee: platformFee,
                    client_total: clientTotal,
                    platform_fee_rate: platformFeeRate,
                    status: 'request',
                    requested_at: new Date().toISOString(),
                    journal_submitted: true
                })
                .select()
                .single();

            if (error) throw error;
            return { success: true, data };
        } catch (e) {
            console.error('정산 건 생성 실패:', e);
            return { success: false, error: e.message };
        }
    },

    // ── 정산 승인 (DB) ──
    async approveSettlement(dbId) {
        if (!supabase || !dbId) return { success: false, error: 'DB 미연결' };
        try {
            const profile = await ContentourAuth.getUserProfile();
            if (!profile) return { success: false, error: '로그인 필요' };

            const { data, error } = await supabase.rpc('approve_settlement', {
                p_settlement_id: dbId,
                p_admin_id: profile.id
            });
            if (error) throw error;
            if (typeof CT !== 'undefined' && CT.logAudit) {
                CT.logAudit('settlement_approved', '43_정산내역', dbId, {});
            }
            return data;
        } catch (e) {
            console.error('정산 승인 실패:', e);
            return { success: false, error: e.message };
        }
    },

    // ── 정산 반려 (DB) ──
    async rejectSettlement(dbId, reason) {
        if (!supabase || !dbId) return { success: false, error: 'DB 미연결' };
        try {
            const profile = await ContentourAuth.getUserProfile();
            if (!profile) return { success: false, error: '로그인 필요' };

            const { data, error } = await supabase.rpc('reject_settlement', {
                p_settlement_id: dbId,
                p_admin_id: profile.id,
                p_reason: reason
            });
            if (error) throw error;
            return data;
        } catch (e) {
            console.error('정산 반려 실패:', e);
            return { success: false, error: e.message };
        }
    },

    // ── 정산 입금 완료 (DB) ──
    async completeSettlementPayment(dbId, reference) {
        if (!supabase || !dbId) return { success: false, error: 'DB 미연결' };
        try {
            const { data, error } = await supabase.rpc('complete_settlement_payment', {
                p_settlement_id: dbId,
                p_payment_reference: reference || null
            });
            if (error) throw error;
            return data;
        } catch (e) {
            console.error('입금 처리 실패:', e);
            return { success: false, error: e.message };
        }
    },

    // ── 계약 목록 로드 ──
    async loadContracts() {
        if (!supabase) return null;
        try {
            const { data, error } = await supabase
                .from('42_통역계약')
                .select(`
                    *,
                    customer:customer_id (id, name),
                    interpreter:interpreter_id (id, name)
                `)
                .order('created_at', { ascending: false });
            if (error) throw error;
            if (!data || data.length === 0) return null;

            const statusMap = {
                pending: '견적 검토', deposit_paid: '계약금 결제',
                in_progress: '진행 중', completed: '완료',
                settled: '정산 완료', cancelled: '취소'
            };

            return data.map(d => ({
                id: d.id,
                dbId: d.id,
                expo: d.exhibition_name,
                client: {
                    name: d.customer?.name || '',
                    company: d.client_company,
                    color: '#1565c0'
                },
                interpreter: {
                    name: d.interpreter?.name || '',
                    color: '#0277bd'
                },
                status: d.status,
                statusText: statusMap[d.status] || d.status,
                dates: { start: d.start_date, end: d.end_date },
                lang: d.language_pair,
                dailyRate: d.daily_rate,
                days: d.working_days,
                subtotal: d.total_amount,
                platformFee: 0,
                total: d.total_amount,
                deposit: d.deposit_amount,
                balance: d.balance_amount,
                depositPaid: d.deposit_status === 'paid',
                balancePaid: d.balance_status === 'paid',
                settlementStatus: d.settlement_status
            }));
        } catch (e) {
            console.error('계약 로드 실패:', e);
            return null;
        }
    },

    // ── 상담일지 로드 ──
    async loadJournals() {
        if (!supabase) return null;
        try {
            const { data, error } = await supabase
                .from('44_상담일지')
                .select(`
                    *,
                    interpreter:interpreter_id (id, name),
                    customer:customer_id (id, name)
                `)
                .order('consultation_date', { ascending: false });
            if (error) throw error;
            if (!data || data.length === 0) return null;

            const statusMap = { draft: 'draft', submitted: 'new', reviewed: 'reviewed' };

            return data.map(d => ({
                id: d.id,
                dbId: d.id,
                expo: d.exhibition_name,
                company: d.buyer_company || '',
                date: d.consultation_date,
                interp: d.interpreter?.name || '',
                lang: '',
                status: statusMap[d.status] || d.status,
                total: 1,
                contract: 0,
                sample: 0,
                follow: d.follow_up_needed ? 1 : 0,
                countries: [d.buyer_country || ''],
                summary: d.discussion_summary || '',
                result: d.buyer_interest || '',
                issue: '',
                action: d.follow_up_notes || '',
                source: 'interpreter',
                adminComment: d.review_comment || ''
            }));
        } catch (e) {
            console.error('상담일지 로드 실패:', e);
            return null;
        }
    },

    // ── 상담일지 리뷰 (관리자 코멘트) ──
    async reviewJournal(dbId, comment) {
        if (!supabase || !dbId) return false;
        try {
            const profile = await ContentourAuth.getUserProfile();
            const { error } = await supabase
                .from('44_상담일지')
                .update({
                    status: 'reviewed',
                    reviewed_at: new Date().toISOString(),
                    reviewed_by: profile ? profile.id : null,
                    review_comment: comment
                })
                .eq('id', dbId);
            return !error;
        } catch (e) { return false; }
    },

    // ── 일정 (통역 주문) 로드 ──
    async loadSchedules() {
        if (!supabase) return null;
        try {
            const { data, error } = await supabase
                .from('12_통역주문')
                .select(`
                    *,
                    interpreter:interpreter_id (id, name),
                    client:client_company_id (name)
                `)
                .order('service_date', { ascending: true });
            if (error) throw error;
            if (!data || data.length === 0) return null;

            const typeMap = { '부스상주': 'booth', '미팅동행': 'meeting', '현장운영': 'ops' };

            return data.map(d => ({
                id: d.interpretation_id,
                date: d.service_date,
                expo: '',
                company: d.client?.name || '',
                interp: d.interpreter?.name || '',
                lang: d.language_pair,
                type: typeMap[d.service_type] || 'booth',
                start: '10:00',
                end: d.duration_hours ? (10 + d.duration_hours) + ':00' : '18:00'
            }));
        } catch (e) {
            console.error('일정 로드 실패:', e);
            return null;
        }
    },

    // ── 대시보드 통계 로드 ──
    async loadStats() {
        if (!supabase) return null;
        try {
            const [inquiryRes, settleRes, contractRes] = await Promise.all([
                supabase.from('46_ITQ견적문의').select('id, status', { count: 'exact' }),
                supabase.from('43_정산내역').select('id, status, net_amount'),
                supabase.from('42_통역계약').select('id, status')
            ]);

            return {
                totalInquiries: inquiryRes.data?.length || 0,
                pendingInquiries: inquiryRes.data?.filter(d => d.status === '접수' || d.status === '검토중').length || 0,
                totalSettlements: settleRes.data?.length || 0,
                pendingSettlements: settleRes.data?.filter(d => d.status === 'request').length || 0,
                paidAmount: settleRes.data?.filter(d => d.status === 'paid').reduce((s, d) => s + (d.net_amount || 0), 0) || 0,
                activeContracts: contractRes.data?.filter(d => !['settled', 'cancelled'].includes(d.status)).length || 0
            };
        } catch (e) {
            console.error('통계 로드 실패:', e);
            return null;
        }
    }
};

// ── 유틸리티 함수 ──
function langPairToKo(code) {
    const map = { 'KR-EN': '한↔영', 'KR-JP': '한↔일', 'KR-CN': '한↔중', 'ETC': '기타' };
    return map[code] || code;
}

function serviceTypeToKo(code) {
    const map = { 'BOOTH': '부스 상주', 'MEETING': '미팅 동행', 'ONSITE_OPS': '현장 운영', 'OTHER': '기타' };
    return map[code] || code;
}

function itqStatusToAdmin(status) {
    const map = { '접수': '검토중', '검토중': '검토중', '견적발송': '매칭완료', '계약진행': '파견확정', '완료': '완료', '취소': '취소' };
    return map[status] || status;
}
