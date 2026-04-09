// Smooth scroll for anchor links
document.addEventListener('DOMContentLoaded', function () {
    // Initialize all features
    initMobileMenu();
    initActiveNavLink();
    initSmoothScroll();
    initScrollAnimations();
    initParallax();
    initInquiryForm();
    initExpoAutocomplete();

    initFaqAccessibility();
    initCountryCardKeyboard();
    console.log('Contentour Landing Page initialized successfully');
});

// Mobile menu toggle
function initMobileMenu() {
    const mobileMenuToggle = document.getElementById('mobileMenuToggle');
    const navMenu = document.getElementById('navMenu');

    if (mobileMenuToggle && navMenu) {
        mobileMenuToggle.addEventListener('click', function () {
            const isOpen = navMenu.getAttribute('data-open') === 'true';
            const newState = !isOpen;

            navMenu.setAttribute('data-open', newState);
            mobileMenuToggle.setAttribute('aria-expanded', newState);

            // Lock body scroll when menu is open
            if (newState) {
                document.body.style.overflow = 'hidden';
            } else {
                document.body.style.overflow = '';
            }
        });

        // Close menu when clicking links (especially for hash links on the same page)
        const links = navMenu.querySelectorAll('a');
        links.forEach(link => {
            link.addEventListener('click', () => {
                navMenu.setAttribute('data-open', 'false');
                mobileMenuToggle.setAttribute('aria-expanded', 'false');
                document.body.style.overflow = '';
            });
        });
    }
}

// Active navigation link highlighting
function initActiveNavLink() {
    const sections = document.querySelectorAll('section[id]');
    const navLinks = document.querySelectorAll('.nav__menu a');

    window.addEventListener('scroll', () => {
        let current = '';
        sections.forEach(section => {
            const sectionTop = section.offsetTop;
            const sectionHeight = section.clientHeight;
            if (window.pageYOffset >= sectionTop - 200) {
                current = section.getAttribute('id');
            }
        });

        navLinks.forEach(link => {
            link.classList.remove('is-active');
            if (link.getAttribute('href') === `#${current}` || link.getAttribute('href') === `index.html#${current}`) {
                link.classList.add('is-active');
            }
        });
    });
}

// Smooth scrolling for navigation links
function initSmoothScroll() {
    const links = document.querySelectorAll('a[href^="#"]');

    links.forEach(link => {
        link.addEventListener('click', function (e) {
            const href = this.getAttribute('href');

            // Skip if it's just "#"
            if (href === '#') {
                e.preventDefault();
                return;
            }

            const target = document.querySelector(href);

            if (target) {
                e.preventDefault();

                const headerOffset = 80;
                const elementPosition = target.getBoundingClientRect().top;
                const offsetPosition = elementPosition + window.pageYOffset - headerOffset;

                window.scrollTo({
                    top: offsetPosition,
                    behavior: 'smooth'
                });
            }
        });
    });
}

// Scroll-triggered animations
function initScrollAnimations() {
    const observerOptions = {
        threshold: 0.1,
        rootMargin: '0px 0px -100px 0px'
    };

    const observer = new IntersectionObserver(function (entries) {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.style.opacity = '1';
                entry.target.style.transform = 'translateY(0)';
            }
        });
    }, observerOptions);

    // Observe process cards
    const processCards = document.querySelectorAll('.process-card');
    processCards.forEach((card, index) => {
        card.style.opacity = '0';
        card.style.transform = 'translateY(30px)';
        card.style.transition = `all 0.6s ease ${index * 0.1}s`;
        observer.observe(card);
    });

    // Observe feature items
    const featureItems = document.querySelectorAll('.feature-item');
    featureItems.forEach((item, index) => {
        item.style.opacity = '0';
        item.style.transform = 'translateY(30px)';
        item.style.transition = `all 0.6s ease ${index * 0.15}s`;
        observer.observe(item);
    });

    // Observe stats
    const statItems = document.querySelectorAll('.stat-item');
    statItems.forEach((item, index) => {
        item.style.opacity = '0';
        item.style.transform = 'scale(0.8)';
        item.style.transition = `all 0.5s ease ${index * 0.1}s`;
        observer.observe(item);
    });
}

// Parallax effect for hero section
function initParallax() {
    const hero = document.querySelector('.hero');

    if (!hero) return;

    window.addEventListener('scroll', function () {
        const scrolled = window.pageYOffset;
        const parallaxSpeed = 0.5;

        if (scrolled < window.innerHeight) {
            hero.style.backgroundPositionY = `${scrolled * parallaxSpeed}px`;
        }
    });
}

// Download manual function
function downloadManual(event) {
    event.preventDefault();

    const content = `콘텐츄어 전문 통역 - 운영 매뉴얼 가이드

1. 준비 태도
   - 사전 교육 내용 필수 숙지
   - 전시회 인프라 100% 이해
   - 비즈니스 매너 및 복장 준수

2. 상담 및 지원
   - 전문 용어집 수시 활용
   - 적극적인 상담 서포트
   - 유망 바이어 밀착 대응

3. 현장 운영 원칙
   - Active Stance: 기립 응대 원칙
   - 상담 일지 즉시 작성
   - PM 보고 체계 준수

4. 상담 스킬
   - 고객사 중심 대화법
   - 니즈 파악 및 요약 정리
   - 후속 상담 일정 예약 유도

문의: info@contentour.co.kr
전화: 02-868-1522
`;

    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'contentour_manual_summary.txt';

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);

    alert('운영 매뉴얼 가이드가 다운로드되었습니다!');
}

// Counter animation for stats
function animateCounter(element, target, duration = 2000) {
    const start = 0;
    const increment = target / (duration / 16);
    let current = start;

    const timer = setInterval(() => {
        current += increment;
        if (current >= target) {
            element.textContent = target;
            clearInterval(timer);
        } else {
            element.textContent = Math.floor(current);
        }
    }, 16);
}

// Observe stats section and trigger counter animation
const statsObserver = new IntersectionObserver(function (entries) {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            const statNumbers = entry.target.querySelectorAll('.stat-number');
            statNumbers.forEach(stat => {
                const text = stat.textContent;
                const number = parseInt(text.replace(/\D/g, ''));

                if (!isNaN(number)) {
                    stat.textContent = '0';
                    setTimeout(() => {
                        animateCounter(stat, number);
                        if (text.includes('+')) {
                            setTimeout(() => {
                                stat.textContent = number + '+';
                            }, 2000);
                        } else if (text.includes('%')) {
                            setTimeout(() => {
                                stat.textContent = number + '%';
                            }, 2000);
                        }
                    }, 300);
                }
            });
            statsObserver.unobserve(entry.target);
        }
    });
}, { threshold: 0.5 });

const statsSection = document.querySelector('.stats-section');
if (statsSection) {
    statsObserver.observe(statsSection);
}

// Detail fields toggle
(function () {
    var toggle = document.getElementById('detailToggle');
    var fields = document.getElementById('detailFields');
    if (!toggle || !fields) return;
    toggle.addEventListener('click', function () {
        var expanded = toggle.getAttribute('aria-expanded') === 'true';
        toggle.setAttribute('aria-expanded', String(!expanded));
        if (expanded) {
            fields.hidden = true;
        } else {
            fields.hidden = false;
        }
    });
})();

// FAQ accessibility: button toggle + aria-expanded
function initFaqAccessibility() {
    document.querySelectorAll('.faq-item__q').forEach(function (btn) {
        btn.addEventListener('click', function () {
            var item = btn.closest('.faq-item');
            var expanded = btn.getAttribute('aria-expanded') === 'true';
            btn.setAttribute('aria-expanded', String(!expanded));
            item.classList.toggle('open');
        });
    });
}

// Country card keyboard support (Enter/Space)
function initCountryCardKeyboard() {
    document.querySelectorAll('.country-card[role="button"]').forEach(function (card) {
        card.addEventListener('keydown', function (e) {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                card.click();
            }
        });
    });
}

// Inquiry Form Logic
function initInquiryForm() {
    const form = document.querySelector("#interpreterForm");
    if (!form) return;

    function formToJSON(form) {
        const fd = new FormData(form);
        const obj = {};
        fd.forEach((v, k) => obj[k] = v);
        const consentInput = form.querySelector('input[name="consent"]');
        if (consentInput) {
            obj.consent = consentInput.checked;
        }
        return obj;
    }

    form.addEventListener("submit", async (e) => {
        e.preventDefault();

        const status = document.querySelector("#formStatus");
        const payload = formToJSON(form);
        const btn = form.querySelector('button[type="submit"]');

        // 간단 검증 (기간)
        if (payload.startDate && payload.endDate && payload.startDate > payload.endDate) {
            if (status) status.textContent = "종료일은 시작일 이후로 선택해주세요.";
            return;
        }

        if (btn) { btn.disabled = true; btn.textContent = "전송 중..."; }
        if (status) status.textContent = "전송 중입니다…";

        try {
            // ── Supabase DB 저장 ──
            if (window.sbClient) {
                const { data, error } = await window.sbClient
                    .from('46_ITQ견적문의')
                    .insert({
                        company: payload.company,
                        contact_name: payload.name,
                        email: payload.email,
                        phone: payload.phone,
                        exhibition_name: payload.expoName,
                        location: payload.location,
                        venue: payload.venue || null,
                        start_date: payload.startDate,
                        end_date: payload.endDate,
                        language_pair: (payload.sourceLang && payload.targetLang) ? payload.sourceLang + ' ↔ ' + payload.targetLang : payload.languages || null,
                        service_type: payload.type || null,
                        headcount: parseInt(payload.headcount) || 1,
                        working_hours: payload.workingHours || null,
                        keywords: payload.keywords || null,
                        message: payload.message || null,
                        consent: payload.consent || false
                    })
                    .select()
                    .single();

                if (error) throw error;

                if (status) status.textContent = "접수가 완료되었습니다! 담당자가 확인 후 연락드리겠습니다.";
                if (btn) { btn.textContent = "접수 완료!"; }
                setTimeout(() => {
                    form.reset();
                    if (btn) { btn.disabled = false; btn.textContent = "통역 섭외 문의 보내기"; }
                    document.getElementById('contact').classList.remove('active');
                    document.body.style.overflow = '';
                    if (status) status.textContent = "";
                }, 2500);
                return;
            }

            // ── 데모 모드 (Supabase 미연결 시) ──
            if (status) status.textContent = "접수가 완료되었습니다(데모). 담당자가 확인 후 연락드리겠습니다.";
            if (btn) { btn.textContent = "접수 완료!"; }
            setTimeout(() => {
                form.reset();
                if (btn) { btn.disabled = false; btn.textContent = "통역 섭외 문의 보내기"; }
                document.getElementById('contact').classList.remove('active');
                document.body.style.overflow = '';
                if (status) status.textContent = "";
            }, 2000);
        } catch (err) {
            console.error('ITQ 문의 전송 오류:', err);
            if (status) status.textContent = "전송에 실패했습니다. 잠시 후 다시 시도해주세요.";
            if (btn) { btn.disabled = false; btn.textContent = "통역 섭외 문의 보내기"; }
        }
    });

    // Toggle Logic
    const openButtons = document.querySelectorAll('a[href="#contact"]');
    const closeButton = document.getElementById('closeInquiry');
    const contactSection = document.getElementById('contact');

    openButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            contactSection.classList.add('active');
            document.body.style.overflow = 'hidden';

            // Close mobile menu if open
            const navMenu = document.getElementById('navMenu');
            if (navMenu && navMenu.getAttribute('data-open') === 'true') {
                navMenu.setAttribute('data-open', 'false');
                document.getElementById('mobileMenuToggle').setAttribute('aria-expanded', 'false');
            }
        });
    });

    if (closeButton) {
        closeButton.addEventListener('click', () => {
            contactSection.classList.remove('active');
            document.body.style.overflow = ''; // Restore scroll
        });
    }

    // Close on background click
    contactSection.addEventListener('click', (e) => {
        if (e.target === contactSection) {
            contactSection.classList.remove('active');
            document.body.style.overflow = '';
        }
    });

    // 다른 페이지에서 #contact 해시로 이동해온 경우 자동으로 열기
    if (window.location.hash === '#contact') {
        contactSection.classList.add('active');
        document.body.style.overflow = 'hidden';
    }
}

// Portal tab navigation
function openPortalTab(tabName) {
    const contents = document.querySelectorAll('.portal-content');
    contents.forEach(content => {
        content.classList.remove('active');
    });

    const tabButtons = document.querySelectorAll('.portal-tab-btn');
    tabButtons.forEach(btn => {
        btn.classList.remove('active');
    });

    const selectedContent = document.getElementById(tabName);
    if (selectedContent) {
        selectedContent.classList.add('active');
    }

    if (event && event.target) {
        event.target.classList.add('active');
    }
}

// ══════════════ 전시회명 자동완성 ══════════════
function initExpoAutocomplete() {
    var input = document.getElementById('expoName');
    if (!input) return;

    // 주요 해외 전시회 목록 (출처: contentour.co.kr 해외전시회 DB + 추가)
    // v=전시장, s=시작일, e=종료일 (2026년 기준, 없으면 생략)
    var expoList = [
        // ── 일본 ──
        { name: 'FOODEX JAPAN', country: '일본', city: '도쿄', field: '식품', v: 'Makuhari Messe', s: '2026-03-10', e: '2026-03-13' },
        { name: 'Nano Tech', country: '일본', city: '도쿄', field: '나노기술', v: 'Tokyo Big Sight', s: '2026-01-28', e: '2026-01-30' },
        { name: 'H2 & FC EXPO', country: '일본', city: '도쿄', field: '수소·연료전지', v: 'Tokyo Big Sight', s: '2026-03-04', e: '2026-03-06' },
        { name: 'CEATEC', country: '일본', city: '도쿄', field: 'IT·전자', v: 'Makuhari Messe', s: '2026-10-20', e: '2026-10-23' },
        { name: 'JIMTOF', country: '일본', city: '도쿄', field: '공작기계', v: 'Tokyo Big Sight', s: '2026-11-02', e: '2026-11-07' },
        { name: 'Japan IT Week', country: '일본', city: '도쿄', field: 'IT', v: 'Tokyo Big Sight', s: '2026-04-22', e: '2026-04-24' },
        { name: 'InterBEE', country: '일본', city: '도쿄', field: '방송·미디어', v: 'Makuhari Messe', s: '2026-11-18', e: '2026-11-20' },
        { name: 'SEMICON Japan', country: '일본', city: '도쿄', field: '반도체', v: 'Tokyo Big Sight', s: '2026-12-16', e: '2026-12-18' },
        { name: 'Smart Energy Week', country: '일본', city: '도쿄', field: '에너지', v: 'Tokyo Big Sight', s: '2026-03-04', e: '2026-03-06' },
        { name: 'COSME Tokyo', country: '일본', city: '도쿄', field: '화장품', v: 'Tokyo Big Sight', s: '2026-01-21', e: '2026-01-23' },
        { name: 'JAPAN PACK', country: '일본', city: '도쿄', field: '포장', v: 'Makuhari Messe' },
        { name: 'ifia JAPAN', country: '일본', city: '도쿄', field: '식품소재', v: 'Tokyo Big Sight' },
        { name: 'JASIS', country: '일본', city: '도쿄', field: '분석기기', v: 'Makuhari Messe' },
        // ── 중국 ──
        { name: 'Canton Fair', country: '중국', city: '광저우', field: '종합무역', v: 'Canton Fair Complex', s: '2026-04-15', e: '2026-05-05' },
        { name: 'CIIE', country: '중국', city: '상하이', field: '수입박람회', v: 'NECC Shanghai', s: '2026-11-05', e: '2026-11-10' },
        { name: 'CHINACOAT', country: '중국', city: '상하이', field: '도료·코팅', v: 'SNIEC' },
        { name: 'China Beauty Expo', country: '중국', city: '상하이', field: '뷰티', v: 'SNIEC', s: '2026-05-12', e: '2026-05-14' },
        { name: 'SIAL China', country: '중국', city: '상하이', field: '식품', v: 'SNIEC', s: '2026-05-18', e: '2026-05-20' },
        { name: 'Automechanika Shanghai', country: '중국', city: '상하이', field: '자동차부품', v: 'NECC Shanghai', s: '2026-12-01', e: '2026-12-04' },
        { name: 'CHINAPLAS', country: '중국', city: '선전', field: '플라스틱·고무', v: 'Shenzhen World Exhibition Center', s: '2026-04-21', e: '2026-04-24' },
        { name: 'CBME China', country: '중국', city: '상하이', field: '유아용품', v: 'NECC Shanghai' },
        { name: 'CMEF', country: '중국', city: '상하이', field: '의료기기', v: 'NECC Shanghai', s: '2026-04-09', e: '2026-04-12' },
        // ── 독일 ──
        { name: 'MEDICA', country: '독일', city: '뒤셀도르프', field: '의료기기', v: 'Messe Düsseldorf', s: '2026-11-16', e: '2026-11-19' },
        { name: 'Hannover Messe', country: '독일', city: '하노버', field: '산업기술', v: 'Hannover Fairground', s: '2026-04-20', e: '2026-04-24' },
        { name: 'ANUGA', country: '독일', city: '쾰른', field: '식품', v: 'Koelnmesse', s: '2027-10-09', e: '2027-10-13' },
        { name: 'IFA Berlin', country: '독일', city: '베를린', field: '가전·IT', v: 'Messe Berlin', s: '2026-09-04', e: '2026-09-09' },
        { name: 'Automechanika Frankfurt', country: '독일', city: '프랑크푸르트', field: '자동차부품', v: 'Messe Frankfurt', s: '2026-09-08', e: '2026-09-12' },
        { name: 'K Show', country: '독일', city: '뒤셀도르프', field: '플라스틱·고무', v: 'Messe Düsseldorf', s: '2028-10-18', e: '2028-10-25' },
        { name: 'FIBO', country: '독일', city: '쾰른', field: '피트니스', v: 'Koelnmesse', s: '2026-04-02', e: '2026-04-05' },
        { name: 'DRUPA', country: '독일', city: '뒤셀도르프', field: '인쇄', v: 'Messe Düsseldorf', s: '2028-05-09', e: '2028-05-17' },
        { name: 'ProSweets', country: '독일', city: '쾰른', field: '제과', v: 'Koelnmesse', s: '2026-02-01', e: '2026-02-04' },
        { name: 'SCHWEISSEN & SCHNEIDEN', country: '독일', city: '에센', field: '용접·절단장비', v: 'Messe Essen' },
        { name: 'EUROSHOP', country: '독일', city: '뒤셀도르프', field: '점포설비·유통', v: 'Messe Düsseldorf' },
        { name: 'Drinktec', country: '독일', city: '뮌헨', field: '식음료·포장기술', v: 'Messe München' },
        { name: 'IFFA', country: '독일', city: '프랑크푸르트', field: '육류가공', v: 'Messe Frankfurt' },
        { name: 'analytica', country: '독일', city: '뮌헨', field: '분석기기·바이오', v: 'Messe München' },
        { name: 'BAUMA', country: '독일', city: '뮌헨', field: '건설·광산기계', v: 'Messe München' },
        { name: 'ISM Cologne', country: '독일', city: '쾰른', field: '과자·스낵', v: 'Koelnmesse', s: '2026-02-01', e: '2026-02-04' },
        { name: 'INTERZUM', country: '독일', city: '쾰른', field: '가구부자재', v: 'Koelnmesse' },
        { name: 'EuroTier', country: '독일', city: '하노버', field: '축산', v: 'Hannover Fairground' },
        { name: 'embedded world', country: '독일', city: '뉘른베르크', field: '임베디드시스템', v: 'NürnbergMesse', s: '2026-03-10', e: '2026-03-12' },
        { name: 'LASER World of PHOTONICS', country: '독일', city: '뮌헨', field: '레이저·광학', v: 'Messe München', s: '2027-06-21', e: '2027-06-24' },
        { name: 'ACHEMA', country: '독일', city: '프랑크푸르트', field: '화학공학', v: 'Messe Frankfurt', s: '2027-06-14', e: '2027-06-18' },
        // ── 베트남 ──
        { name: 'VIETNAM EXPO', country: '베트남', city: '호치민', field: '종합무역', v: 'SECC', s: '2026-04-08', e: '2026-04-11' },
        { name: 'Vietnam Manufacturing Expo', country: '베트남', city: '호치민', field: '제조업', v: 'SECC' },
        { name: 'Vietfood & Beverage', country: '베트남', city: '호치민', field: '식품', v: 'SECC' },
        { name: 'Vietnam Medipharm Expo', country: '베트남', city: '호치민', field: '의약품', v: 'SECC' },
        { name: 'ILDEX Vietnam', country: '베트남', city: '호치민', field: '축산', v: 'SECC' },
        { name: 'VIETBUILD', country: '베트남', city: '호치민', field: '건축·건설', v: 'SECC' },
        // ── 미국 ──
        { name: 'CES', country: '미국', city: '라스베이거스', field: 'IT·가전', v: 'Las Vegas Convention Center', s: '2026-01-06', e: '2026-01-09' },
        { name: 'NAB Show', country: '미국', city: '라스베이거스', field: '방송·미디어', v: 'Las Vegas Convention Center', s: '2026-04-18', e: '2026-04-22' },
        { name: 'KBIS', country: '미국', city: '라스베이거스', field: '주방·욕실', v: 'Las Vegas Convention Center' },
        { name: 'Natural Products Expo West', country: '미국', city: 'LA', field: '건강식품', v: 'Anaheim Convention Center', s: '2026-03-03', e: '2026-03-07' },
        { name: 'IFT FIRST', country: '미국', city: '시카고', field: '식품기술', v: 'McCormick Place' },
        { name: 'PACK EXPO', country: '미국', city: '시카고', field: '포장', v: 'McCormick Place' },
        { name: 'MD&M West', country: '미국', city: 'LA', field: '의료기기', v: 'Anaheim Convention Center' },
        { name: 'AAPEX', country: '미국', city: '라스베이거스', field: '자동차부품', v: 'Venetian Expo', s: '2026-11-03', e: '2026-11-05' },
        { name: 'CONEXPO-CON/AGG', country: '미국', city: '라스베이거스', field: '건설기계', v: 'Las Vegas Convention Center' },
        { name: 'SEMA Show', country: '미국', city: '라스베이거스', field: '자동차애프터마켓', v: 'Las Vegas Convention Center', s: '2026-11-03', e: '2026-11-06' },
        { name: 'Cosmoprof North America', country: '미국', city: '라스베이거스', field: '뷰티', v: 'Las Vegas Convention Center' },
        { name: 'HIMSS', country: '미국', city: '올랜도', field: '헬스케어IT', v: 'Orange County Convention Center' },
        { name: 'IMTS', country: '미국', city: '시카고', field: '제조기술', v: 'McCormick Place' },
        { name: 'FABTECH', country: '미국', city: '라스베이거스', field: '금속성형·용접', v: 'Las Vegas Convention Center' },
        // ── UAE ──
        { name: 'GITEX', country: 'UAE', city: '두바이', field: 'IT', v: 'Dubai World Trade Centre', s: '2026-10-12', e: '2026-10-16' },
        { name: 'Arab Health', country: 'UAE', city: '두바이', field: '의료', v: 'Dubai World Trade Centre', s: '2026-01-26', e: '2026-01-29' },
        { name: 'Gulfood', country: 'UAE', city: '두바이', field: '식품', v: 'Dubai World Trade Centre', s: '2026-02-17', e: '2026-02-21' },
        { name: 'ADIPEC', country: 'UAE', city: '아부다비', field: '에너지', v: 'ADNEC', s: '2026-11-09', e: '2026-11-12' },
        { name: 'Beautyworld Middle East', country: 'UAE', city: '두바이', field: '뷰티', v: 'Dubai World Trade Centre' },
        { name: 'The Big 5', country: 'UAE', city: '두바이', field: '건설', v: 'Dubai World Trade Centre' },
        // ── 태국 ──
        { name: 'THAIFEX', country: '태국', city: '방콕', field: '식품', v: 'IMPACT', s: '2026-05-26', e: '2026-05-30' },
        { name: 'Manufacturing Expo Thailand', country: '태국', city: '방콕', field: '제조', v: 'BITEC' },
        { name: 'Medical Fair Thailand', country: '태국', city: '방콕', field: '의료', v: 'QSNCC' },
        { name: 'VICTAM Asia', country: '태국', city: '방콕', field: '사료·곡물', v: 'IMPACT' },
        { name: 'ProPak Asia', country: '태국', city: '방콕', field: '포장·가공', v: 'BITEC' },
        { name: 'Metalex', country: '태국', city: '방콕', field: '금속가공', v: 'BITEC' },
        // ── 이탈리아 ──
        { name: 'Cosmoprof Worldwide Bologna', country: '이탈리아', city: '볼로냐', field: '뷰티', v: 'BolognaFiere', s: '2026-03-19', e: '2026-03-23' },
        { name: 'IPACK-IMA', country: '이탈리아', city: '밀라노', field: '포장·제조공정', v: 'Fiera Milano' },
        { name: 'EICMA', country: '이탈리아', city: '밀라노', field: '이륜차', v: 'Fiera Milano' },
        { name: 'HOST Milano', country: '이탈리아', city: '밀라노', field: '호텔·요식업', v: 'Fiera Milano' },
        { name: 'Salone del Mobile', country: '이탈리아', city: '밀라노', field: '가구·디자인', v: 'Fiera Milano', s: '2026-04-21', e: '2026-04-26' },
        // ── 스페인 ──
        { name: 'MWC (Mobile World Congress)', country: '스페인', city: '바르셀로나', field: '모바일·통신', v: 'Fira Barcelona', s: '2026-03-02', e: '2026-03-05' },
        { name: 'ALIMENTARIA', country: '스페인', city: '바르셀로나', field: '식품', v: 'Fira Barcelona' },
        { name: 'Smart City Expo', country: '스페인', city: '바르셀로나', field: '스마트시티', v: 'Fira Barcelona' },
        // ── 프랑스 ──
        { name: 'SIAL Paris', country: '프랑스', city: '파리', field: '식품', v: 'Paris Nord Villepinte', s: '2026-10-17', e: '2026-10-21' },
        { name: 'Maison & Objet', country: '프랑스', city: '파리', field: '인테리어·디자인', v: 'Paris Nord Villepinte', s: '2026-01-22', e: '2026-01-26' },
        { name: 'JEC World', country: '프랑스', city: '파리', field: '복합소재', v: 'Paris Nord Villepinte' },
        { name: 'EUROSATORY', country: '프랑스', city: '파리', field: '방위산업', v: 'Paris Nord Villepinte' },
        { name: 'VIVA Technology', country: '프랑스', city: '파리', field: 'IT·스타트업', v: 'Paris Expo Porte de Versailles', s: '2026-06-17', e: '2026-06-20' },
        // ── 기타 ──
        { name: 'INTERTRAFFIC', country: '네덜란드', city: '암스테르담', field: '교통설비', v: 'RAI Amsterdam' },
        { name: 'IBC', country: '네덜란드', city: '암스테르담', field: '방송·미디어', v: 'RAI Amsterdam' },
        { name: 'CPHI Worldwide', country: '유럽', city: '변동', field: '제약' },
        { name: 'COMPUTEX', country: '대만', city: '타이페이', field: 'IT·컴퓨터', v: 'Taipei Nangang Exhibition Center', s: '2026-06-02', e: '2026-06-05' },
        { name: 'Taipei AMPA', country: '대만', city: '타이페이', field: '자동차부품', v: 'Taipei Nangang Exhibition Center' },
        { name: 'OSEA', country: '싱가포르', city: '싱가포르', field: '해양·석유가스', v: 'Marina Bay Sands' },
        { name: 'FHA', country: '싱가포르', city: '싱가포르', field: '식품·호텔', v: 'Singapore Expo' },
        { name: 'Africa Food Expo', country: '남아공', city: '요하네스버그', field: '식품', v: 'Gallagher Convention Centre' }
    ];

    // 자동완성을 input에 붙이는 헬퍼
    // fields: { location, venue, startDate, endDate } - 자동 입력할 input ID 맵
    function attachExpoAC(input, fields) {
        if (typeof fields === 'string') fields = { location: fields }; // 하위호환
        if (!input || input._expoAC) return; // 중복 방지
        input._expoAC = true;

        var wrapper = input.parentElement;
        wrapper.style.position = 'relative';

        var dropdown = document.createElement('div');
        dropdown.style.cssText = 'position:absolute;top:100%;left:0;right:0;background:#fff;border:2px solid #1565c0;border-top:none;border-radius:0 0 12px 12px;max-height:240px;overflow-y:auto;z-index:100;display:none;box-shadow:0 8px 24px rgba(0,0,0,0.12);';
        wrapper.appendChild(dropdown);

        function renderDropdown(matches) {
            if (matches.length === 0) { dropdown.style.display = 'none'; return; }
            dropdown.innerHTML = matches.map(function(m) {
                var dateInfo = (m.s && m.e) ? ' · ' + m.s.slice(5) + ' ~ ' + m.e.slice(5) : '';
            return '<div class="expo-ac-item" style="padding:10px 14px;cursor:pointer;font-size:0.85rem;border-bottom:1px solid #f0f0f0;transition:background 0.15s;" ' +
                    'onmouseover="this.style.background=\'#f0f7ff\'" onmouseout="this.style.background=\'#fff\'" ' +
                    'data-name="' + m.name + '" data-country="' + m.country + '" data-city="' + m.city + '"' +
                    (m.v ? ' data-venue="' + m.v + '"' : '') +
                    (m.s ? ' data-start="' + m.s + '"' : '') +
                    (m.e ? ' data-end="' + m.e + '"' : '') + '>' +
                    '<div style="font-weight:700;color:#1a1a2e;">' + m.name + '</div>' +
                    '<div style="font-size:0.75rem;color:#888;margin-top:2px;">' + m.country + ' · ' + m.city + (m.v ? ' · ' + m.v : '') + ' · ' + m.field + dateInfo + '</div>' +
                '</div>';
            }).join('');
            dropdown.style.display = 'block';

            dropdown.querySelectorAll('.expo-ac-item').forEach(function(item) {
                item.addEventListener('mousedown', function(e) {
                    e.preventDefault();
                    input.value = this.dataset.name;
                    dropdown.style.display = 'none';
                    var f = fields || {};
                    // 개최지
                    if (f.location) {
                        var el = document.getElementById(f.location);
                        if (el) el.value = this.dataset.country + ' / ' + this.dataset.city;
                    }
                    // 전시장
                    if (f.venue && this.dataset.venue) {
                        var el = document.getElementById(f.venue);
                        if (el) el.value = this.dataset.venue;
                    }
                    // 시작일
                    if (f.startDate && this.dataset.start) {
                        var el = document.getElementById(f.startDate);
                        if (el) el.value = this.dataset.start;
                    }
                    // 종료일
                    if (f.endDate && this.dataset.end) {
                        var el = document.getElementById(f.endDate);
                        if (el) el.value = this.dataset.end;
                    }
                });
            });
        }

        input.addEventListener('input', function() {
            var q = this.value.trim().toLowerCase();
            if (q.length < 1) { dropdown.style.display = 'none'; return; }
            var matches = expoList.filter(function(e) {
                return e.name.toLowerCase().includes(q) ||
                       e.country.toLowerCase().includes(q) ||
                       e.city.toLowerCase().includes(q) ||
                       e.field.toLowerCase().includes(q);
            }).slice(0, 8);
            renderDropdown(matches);
        });

        input.addEventListener('focus', function() {
            if (this.value.trim().length >= 1) input.dispatchEvent(new Event('input'));
        });

        input.addEventListener('blur', function() {
            setTimeout(function() { dropdown.style.display = 'none'; }, 150);
        });
    }

    // 견적 문의 폼 (support.html, index.html)
    var expoInput = document.getElementById('expoName');
    if (expoInput) attachExpoAC(expoInput, { location: 'location', venue: 'venue', startDate: 'startDate', endDate: 'endDate' });

    // 고객사 대시보드 - 문의 접수
    var fExpo = document.getElementById('f-expo');
    if (fExpo) attachExpoAC(fExpo, { location: 'f-location', venue: 'f-venue', startDate: 'f-start', endDate: 'f-end' });

    // 고객사 대시보드 - 상담일지 (바이어 프로파일링)
    var bpExpo = document.getElementById('bp-expo');
    if (bpExpo) attachExpoAC(bpExpo, {});

    // 고객사 대시보드 - 상담일지 (KOTRA 양식)
    var ktExpo = document.getElementById('kt-expo');
    if (ktExpo) attachExpoAC(ktExpo, {});

    // 통역사 대시보드 - 상담일지 (KOTRA 양식)
    var jnlKtExpo = document.getElementById('jnl-kt-expo');
    if (jnlKtExpo) attachExpoAC(jnlKtExpo, {});

    // 전역 함수로 노출 (동적 생성 input에도 적용 가능)
    window.attachExpoAutocomplete = attachExpoAC;
}

// Export functions
window.contentour = {
    downloadManual,
    animateCounter,
    openPortalTab
};
