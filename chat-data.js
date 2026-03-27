// ══════════════ 채팅 & 알림 - Supabase 데이터 레이어 ══════════════
// interpreter-dashboard.html, customer-dashboard.html 공용

const ChatData = {

    _userId: null,
    _userRole: null,
    _userName: null,
    _subscription: null,
    _notifSubscription: null,

    // 현재 사용자 정보 캐시
    async getUser() {
        if (this._userId) return { id: this._userId, role: this._userRole, name: this._userName };
        if (!window.sbClient) return null;
        const { data: { user } } = await window.sbClient.auth.getUser();
        if (!user) return null;
        this._userId = user.id;
        // 회원 테이블에서 역할과 이름 가져오기
        const { data: profile } = await window.sbClient
            .from('01_회원')
            .select('name, role')
            .eq('id', user.id)
            .maybeSingle();
        if (profile) {
            this._userRole = profile.role;
            this._userName = profile.name;
        }
        return { id: this._userId, role: this._userRole, name: this._userName };
    },

    // ══════════════ 채팅방 목록 ══════════════

    // 내가 참여한 계약 기반 채팅방 목록 로드
    async loadChatRooms() {
        if (!window.sbClient) return null;
        try {
            const user = await this.getUser();
            if (!user) return null;

            // 내가 참여한 계약 조회
            let query = window.sbClient
                .from('42_통역계약')
                .select('id, exhibition_name, client_company, language_pair, customer_id, interpreter_id, customer:customer_id (id, name), interpreter:interpreter_id (id, name)')
                .order('created_at', { ascending: false });

            if (user.role === 'customer') {
                query = query.eq('customer_id', user.id);
            } else if (user.role === 'interpreter') {
                query = query.eq('interpreter_id', user.id);
            }
            // admin은 전체 조회

            const { data: contracts, error } = await query;
            if (error) throw error;
            if (!contracts || contracts.length === 0) return null;

            // 각 채팅방의 마지막 메시지 + 안읽은 수 조회
            const rooms = [];
            for (const c of contracts) {
                const roomId = 'contract_' + c.id;
                const partner = user.role === 'customer'
                    ? { id: c.interpreter_id, name: c.interpreter?.name || '통역사' }
                    : { id: c.customer_id, name: c.customer?.name || '고객' };

                // 마지막 메시지
                const { data: lastMsg } = await window.sbClient
                    .from('45_채팅메시지')
                    .select('message, created_at, sender_id')
                    .eq('room_id', roomId)
                    .order('created_at', { ascending: false })
                    .limit(1)
                    .maybeSingle();

                // 안읽은 메시지 수
                const { count: unreadCount } = await window.sbClient
                    .from('45_채팅메시지')
                    .select('id', { count: 'exact', head: true })
                    .eq('room_id', roomId)
                    .neq('sender_id', user.id)
                    .not('read_by', 'cs', '["' + user.id + '"]');

                rooms.push({
                    roomId: roomId,
                    contractId: c.id,
                    expo: c.exhibition_name,
                    company: c.client_company,
                    lang: c.language_pair,
                    partnerId: partner.id,
                    partnerName: partner.name,
                    lastMessage: lastMsg ? lastMsg.message : '',
                    lastMessageTime: lastMsg ? lastMsg.created_at : null,
                    lastSenderId: lastMsg ? lastMsg.sender_id : null,
                    unread: unreadCount || 0
                });
            }

            // 마지막 메시지 시간 순 정렬
            rooms.sort((a, b) => {
                if (!a.lastMessageTime) return 1;
                if (!b.lastMessageTime) return -1;
                return b.lastMessageTime.localeCompare(a.lastMessageTime);
            });

            return rooms;
        } catch (e) {
            console.error('채팅방 로드 실패:', e);
            return null;
        }
    },

    // ══════════════ 메시지 CRUD ══════════════

    // 특정 채팅방의 메시지 히스토리 로드
    async loadMessages(roomId, limit) {
        if (!window.sbClient|| !roomId) return [];
        try {
            // 클라이언트 측 접근 제어 (서버 RLS와 이중 보호)
            const contractId = roomId.replace('contract_', '');
            if (contractId) {
                const user = await this.getUser();
                if (user) {
                    const { data: contract } = await window.sbClient
                        .from('42_통역계약')
                        .select('customer_id, interpreter_id')
                        .eq('id', contractId)
                        .single();
                    if (contract && contract.customer_id !== user.id && contract.interpreter_id !== user.id) {
                        const { data: profile } = await window.sbClient.from('01_회원').select('role').eq('id', user.id).single();
                        if (!profile || profile.role !== 'admin') {
                            console.warn('채팅 접근 권한 없음');
                            return [];
                        }
                    }
                }
            }

            const { data, error } = await window.sbClient
                .from('45_채팅메시지')
                .select('*')
                .eq('room_id', roomId)
                .order('created_at', { ascending: true })
                .limit(limit || 100);
            if (error) throw error;
            return data || [];
        } catch (e) {
            console.error('메시지 로드 실패:', e);
            return [];
        }
    },

    // 메시지 전송
    async sendMessage(roomId, contractId, text, attachments) {
        if (!window.sbClient|| !roomId) return null;
        try {
            const user = await this.getUser();
            if (!user) return null;

            const msgData = {
                room_id: roomId,
                contract_id: contractId || null,
                sender_id: user.id,
                sender_role: user.role,
                sender_name: user.name || '사용자',
                message: text,
                message_type: attachments && attachments.length > 0 ? 'file' : 'text',
                attachments: attachments || [],
                read_by: [user.id]
            };

            const { data, error } = await window.sbClient
                .from('45_채팅메시지')
                .insert(msgData)
                .select()
                .single();

            if (error) throw error;
            return data;
        } catch (e) {
            console.error('메시지 전송 실패:', e);
            return null;
        }
    },

    // 메시지 읽음 처리
    async markAsRead(roomId) {
        if (!window.sbClient|| !roomId) return;
        try {
            const user = await this.getUser();
            if (!user) return;

            // 내가 보내지 않은 & 아직 안 읽은 메시지들 읽음 처리
            const { data: unread } = await window.sbClient
                .from('45_채팅메시지')
                .select('id, read_by')
                .eq('room_id', roomId)
                .neq('sender_id', user.id)
                .not('read_by', 'cs', '["' + user.id + '"]');

            if (!unread || unread.length === 0) return;

            for (const msg of unread) {
                const newReadBy = [...(msg.read_by || []), user.id];
                await window.sbClient
                    .from('45_채팅메시지')
                    .update({ read_by: newReadBy })
                    .eq('id', msg.id);
            }
        } catch (e) {
            console.error('읽음 처리 실패:', e);
        }
    },

    // 메시지 삭제
    async deleteMessage(msgId) {
        if (!window.sbClient|| !msgId) return false;
        try {
            const user = await this.getUser();
            if (!user) return false;
            // 본인 메시지만 삭제 가능
            const { error } = await window.sbClient
                .from('45_채팅메시지')
                .delete()
                .eq('id', msgId)
                .eq('sender_id', user.id);
            return !error;
        } catch (e) { return false; }
    },

    // ══════════════ Realtime 구독 ══════════════

    // 채팅 메시지 실시간 수신
    subscribeToRoom(roomId, onNewMessage) {
        if (!window.sbClient|| !roomId) return null;

        // 기존 구독 해제
        this.unsubscribeChat();

        this._subscription = window.sbClient
            .channel('chat-' + roomId)
            .on('postgres_changes',
                { event: 'INSERT', schema: 'public', table: '45_채팅메시지', filter: 'room_id=eq.' + roomId },
                function(payload) {
                    if (onNewMessage) onNewMessage(payload.new);
                }
            )
            .subscribe();

        return this._subscription;
    },

    unsubscribeChat() {
        if (this._subscription) {
            window.sbClient.removeChannel(this._subscription);
            this._subscription = null;
        }
    },

    // 알림 실시간 수신
    subscribeToNotifications(onNewNotification) {
        if (!window.sbClient) return null;
        var self = this;

        this.getUser().then(function(user) {
            if (!user) return;

            self._notifSubscription = window.sbClient
                .channel('notif-' + user.id)
                .on('postgres_changes',
                    { event: 'INSERT', schema: 'public', table: '24_알림', filter: 'user_id=eq.' + user.id },
                    function(payload) {
                        if (onNewNotification) onNewNotification(payload.new);
                    }
                )
                .subscribe();
        });
    },

    unsubscribeNotifications() {
        if (this._notifSubscription) {
            window.sbClient.removeChannel(this._notifSubscription);
            this._notifSubscription = null;
        }
    },

    // ══════════════ 알림 ══════════════

    async loadNotifications(limit) {
        if (!window.sbClient) return [];
        try {
            const user = await this.getUser();
            if (!user) return [];

            const { data, error } = await window.sbClient
                .from('24_알림')
                .select('*')
                .eq('user_id', user.id)
                .order('created_at', { ascending: false })
                .limit(limit || 30);

            if (error) throw error;
            return data || [];
        } catch (e) {
            console.error('알림 로드 실패:', e);
            return [];
        }
    },

    async markNotificationRead(notifId) {
        if (!window.sbClient|| !notifId) return false;
        try {
            const { error } = await window.sbClient
                .from('24_알림')
                .update({ is_read: true, read_at: new Date().toISOString() })
                .eq('id', notifId);
            return !error;
        } catch (e) { return false; }
    },

    async markAllNotificationsRead() {
        if (!window.sbClient) return false;
        try {
            const user = await this.getUser();
            if (!user) return false;
            const { error } = await window.sbClient
                .from('24_알림')
                .update({ is_read: true, read_at: new Date().toISOString() })
                .eq('user_id', user.id)
                .eq('is_read', false);
            return !error;
        } catch (e) { return false; }
    },

    async getUnreadNotificationCount() {
        if (!window.sbClient) return 0;
        try {
            const user = await this.getUser();
            if (!user) return 0;
            const { count } = await window.sbClient
                .from('24_알림')
                .select('id', { count: 'exact', head: true })
                .eq('user_id', user.id)
                .eq('is_read', false);
            return count || 0;
        } catch (e) { return 0; }
    }
};
