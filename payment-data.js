// ══════════════ 결제 시스템 - PortOne + Supabase 데이터 레이어 ══════════════
// customer-dashboard.html, admin-dashboard.html 공용

const PaymentData = {

    // PortOne 설정 — 실제 운영 시 본인의 가맹점 코드로 교체
    // 테스트: https://admin.portone.io 에서 테스트 채널 생성 후 아래 값 입력
    PORTONE_STORE_ID: 'imp00000000',  // TODO: 실제 PortOne 가맹점 코드
    PORTONE_CHANNEL_KEY: '',           // TODO: 실제 채널 키

    // PortOne SDK가 로드되고 실제 키가 설정되었는지 확인
    isReady() {
        return typeof PortOne !== 'undefined'
            && this.PORTONE_STORE_ID !== 'imp00000000'
            && !!this.PORTONE_CHANNEL_KEY;
    },

    // ══════════════ 결제 요청 ══════════════

    // PortOne 결제창 호출
    async requestPayment(contract, paymentType) {
        const amount = paymentType === 'deposit' ? contract.deposit : contract.balance;
        const label = paymentType === 'deposit' ? '계약금' : '잔금';
        const merchantUid = 'CT_' + paymentType.toUpperCase() + '_' + contract.id + '_' + Date.now();

        // PortOne V2 SDK 사용
        if (typeof PortOne !== 'undefined') {
            try {
                const response = await PortOne.requestPayment({
                    storeId: this.PORTONE_STORE_ID,
                    channelKey: this.PORTONE_CHANNEL_KEY,
                    paymentId: merchantUid,
                    orderName: '[콘텐츄어] ' + contract.expo + ' ' + label,
                    totalAmount: amount,
                    currency: 'KRW',
                    payMethod: 'CARD',
                    customer: {
                        fullName: contract.client?.name || '고객',
                        email: contract.client?.email || ''
                    },
                    customData: {
                        contractId: contract.dbId || contract.id,
                        paymentType: paymentType
                    }
                });

                if (response.code) {
                    // 결제 실패/취소
                    return { success: false, error: response.message || '결제가 취소되었습니다.' };
                }

                // 결제 성공 → DB 기록
                return await this.verifyAndSavePayment(
                    contract.dbId || contract.id,
                    paymentType,
                    amount,
                    'card',
                    merchantUid,
                    response.paymentId || merchantUid
                );
            } catch (e) {
                console.error('PortOne 결제 오류:', e);
                return { success: false, error: e.message || '결제 처리 중 오류가 발생했습니다.' };
            }
        }

        // PortOne SDK 미로드 시 → 데모 결제 처리
        return await this.processDemoPayment(contract, paymentType, amount, merchantUid);
    },

    // 결제 수단 지정 결제 (모달에서 선택한 수단으로)
    async requestPaymentWithMethod(contract, paymentType, method) {
        const amount = paymentType === 'deposit' ? contract.deposit : contract.balance;
        const label = paymentType === 'deposit' ? '계약금' : '잔금';
        const merchantUid = 'CT_' + paymentType.toUpperCase() + '_' + (contract.dbId || contract.id) + '_' + Date.now();

        const methodMap = {
            'card': 'CARD',
            'transfer': 'TRANSFER',
            'virtual': 'VIRTUAL_ACCOUNT'
        };

        if (this.isReady()) {
            try {
                const response = await PortOne.requestPayment({
                    storeId: this.PORTONE_STORE_ID,
                    channelKey: this.PORTONE_CHANNEL_KEY,
                    paymentId: merchantUid,
                    orderName: '[콘텐츄어] ' + contract.expo + ' ' + label,
                    totalAmount: amount,
                    currency: 'KRW',
                    payMethod: methodMap[method] || 'CARD',
                    customer: {
                        fullName: contract.client?.name || '고객'
                    },
                    customData: {
                        contractId: contract.dbId || contract.id,
                        paymentType: paymentType
                    }
                });

                if (response.code) {
                    return { success: false, error: response.message || '결제가 취소되었습니다.' };
                }

                return await this.verifyAndSavePayment(
                    contract.dbId || contract.id,
                    paymentType,
                    amount,
                    method,
                    merchantUid,
                    response.paymentId || merchantUid
                );
            } catch (e) {
                return { success: false, error: e.message || '결제 처리 중 오류' };
            }
        }

        // 데모 모드
        return await this.processDemoPayment(contract, paymentType, amount, merchantUid, method);
    },

    // ══════════════ 결제 검증 & DB 저장 ══════════════

    async verifyAndSavePayment(contractId, paymentType, amount, method, merchantUid, impUid) {
        if (!supabase) return { success: false, error: 'DB 미연결' };

        // 입력값 검증
        if (!contractId || typeof contractId !== 'string') return { success: false, error: '유효하지 않은 계약 ID' };
        if (!paymentType || !['deposit', 'balance', 'full'].includes(paymentType)) return { success: false, error: '유효하지 않은 결제 유형' };
        if (typeof amount !== 'number' || amount <= 0) return { success: false, error: '유효하지 않은 결제 금액' };
        if (!merchantUid) return { success: false, error: '거래 ID가 없습니다' };

        try {
            const { data, error } = await supabase.rpc('process_payment', {
                p_contract_id: contractId,
                p_payment_type: paymentType,
                p_amount: amount,
                p_method: method,
                p_merchant_uid: merchantUid,
                p_imp_uid: impUid || ''
            });
            if (error) throw error;
            return data || { success: true };
        } catch (e) {
            console.error('결제 DB 저장 실패:', e);
            return { success: false, error: e.message };
        }
    },

    // 데모 결제 (PortOne 미연동 시)
    async processDemoPayment(contract, paymentType, amount, merchantUid, method) {
        console.log('데모 결제 처리:', { contract: contract.id, paymentType, amount, method });

        // DB 연결 시 DB에 기록 (UUID 형식 체크: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx)
        const contractId = contract.dbId || contract.id;
        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(contractId);
        if (typeof supabase !== 'undefined' && supabase && isUuid) {
            const result = await this.verifyAndSavePayment(
                contract.dbId || contract.id,
                paymentType,
                amount,
                method || 'card',
                merchantUid,
                'demo_' + merchantUid
            );
            return result;
        }

        // 완전 데모 모드 (자연스러운 처리 딜레이)
        await new Promise(r => setTimeout(r, 1200));
        return { success: true, demo: true, payment_id: 'demo_' + Date.now() };
    },

    // ══════════════ 결제 내역 조회 ══════════════

    async loadPaymentHistory(contractId) {
        if (!supabase) return [];
        try {
            let query = supabase
                .from('47_결제기록')
                .select('*')
                .order('created_at', { ascending: false });

            if (contractId) {
                query = query.eq('contract_id', contractId);
            }

            const { data, error } = await query;
            if (error) throw error;
            return data || [];
        } catch (e) {
            console.error('결제 내역 로드 실패:', e);
            return [];
        }
    },

    // 전체 결제 통계 (관리자용)
    async loadPaymentStats() {
        if (!supabase) return null;
        try {
            const { data, error } = await supabase
                .from('47_결제기록')
                .select('payment_type, amount, status, method');
            if (error) throw error;
            if (!data) return null;

            const paid = data.filter(d => d.status === 'paid');
            return {
                totalPaid: paid.reduce((s, d) => s + d.amount, 0),
                depositPaid: paid.filter(d => d.payment_type === 'deposit').reduce((s, d) => s + d.amount, 0),
                balancePaid: paid.filter(d => d.payment_type === 'balance').reduce((s, d) => s + d.amount, 0),
                totalCount: paid.length,
                refundedCount: data.filter(d => d.status === 'refunded').length,
                byMethod: {
                    card: paid.filter(d => d.method === 'card').length,
                    transfer: paid.filter(d => d.method === 'transfer').length,
                    virtual: paid.filter(d => d.method === 'virtual').length
                }
            };
        } catch (e) { return null; }
    },

    // ══════════════ 환불 (관리자) ══════════════

    async requestRefund(paymentId, reason) {
        if (!supabase) return { success: false, error: 'DB 미연결' };
        try {
            const { data, error } = await supabase.rpc('process_refund', {
                p_payment_id: paymentId,
                p_reason: reason || ''
            });
            if (error) throw error;
            return data || { success: true };
        } catch (e) {
            return { success: false, error: e.message };
        }
    }
};
