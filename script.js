// Smooth scroll for anchor links
document.addEventListener('DOMContentLoaded', function () {
    // Initialize all features
    initMobileMenu();
    initActiveNavLink();
    initSmoothScroll();
    initScrollAnimations();
    initParallax();
    initInquiryForm();

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
                        language_pair: payload.languages,
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

// Export functions
window.contentour = {
    downloadManual,
    animateCounter,
    openPortalTab
};
