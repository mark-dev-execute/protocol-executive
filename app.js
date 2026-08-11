/**
 * FLUENT_EDGE — Interactive Client Logic
 */

document.addEventListener('DOMContentLoaded', () => {
    let currentCurrency = 'EUR';
    let isEarlyRenewal = false;

    // Pricing Dataset with Direct Renewal Rules
    const pricingData = {
        EUR: {
            symbol: '€',
            packages: {
                5: {
                    standardTotal: 175,
                    earlyTotal: 165,
                    standardSavings: 'Standard Rate (€35/session)',
                    earlySavings: 'Save Extra €10 (Direct Renewal)'
                },
                10: {
                    standardTotal: 330,
                    earlyTotal: 310,
                    standardSavings: 'Save €20 Base (€33/session)',
                    earlySavings: 'Save Extra €20 (€40 Total Savings)'
                },
                15: {
                    standardTotal: 465,
                    earlyTotal: 435,
                    standardSavings: 'Save €60 Base (€31/session)',
                    earlySavings: 'Save Extra €30 (€90 Total Savings)'
                }
            }
        },
        USD: {
            symbol: '$',
            packages: {
                5: {
                    standardTotal: 200,
                    earlyTotal: 188,
                    standardSavings: 'Standard Rate ($40/session)',
                    earlySavings: 'Save Extra $12 (Direct Renewal)'
                },
                10: {
                    standardTotal: 380,
                    earlyTotal: 357,
                    standardSavings: 'Save $20 Base ($38/session)',
                    earlySavings: 'Save Extra $23 ($43 Total Savings)'
                },
                15: {
                    standardTotal: 535,
                    earlyTotal: 500,
                    standardSavings: 'Save $65 Base ($35.66/session)',
                    earlySavings: 'Save Extra $35 ($100 Total Savings)'
                }
            }
        }
    };

    // DOM Elements
    const segmentBtns = document.querySelectorAll('.segment-btn');
    const earlyRenewalToggle = document.getElementById('earlyRenewalToggle');
    const bookingModal = document.getElementById('bookingModal');
    const openBookingBtns = document.querySelectorAll('.open-booking-modal');
    const closeBookingBtn = document.querySelector('.modal-close-btn');
    const packageSelect = document.getElementById('packageSelect');
    const mobileToggle = document.querySelector('.mobile-toggle');
    const mobileDrawer = document.querySelector('.mobile-drawer');
    const shareReferralBtn = document.getElementById('shareReferralBtn');
    const accordionBtns = document.querySelectorAll('.accordion-btn');

    // 1. Interactive Career ROI Calculator
    window.calculateCareerRoi = function() {
        const role = document.getElementById('currentRoleSelect')?.value;
        const goal = document.getElementById('targetGoalSelect')?.value;
        const roiValue = document.getElementById('roiAnnualValue');
        const roiPkg = document.getElementById('roiRecommendedPkg');

        if (!roiValue || !roiPkg) return;

        let upside = "+$35,000 – $65,000 / yr";
        let recommended = "Interview Sprint ($1,500)";

        if (goal === 'FAANG Offer') {
            upside = "+$40,000 – $85,000 / yr";
            recommended = "Interview Sprint ($1,500)";
        } else if (goal === 'Executive Relocation') {
            upside = "+$35,000 – $65,000 / yr";
            recommended = "Interview Sprint ($1,500)";
        } else if (goal === 'B2B Sales Pitches') {
            upside = "+$50,000 – $120,000 / yr";
            recommended = "Executive Leadership Sprint ($2,500)";
        } else if (goal === 'Meeting Leadership') {
            upside = "+$30,000 – $55,000 / yr";
            recommended = "Executive Leadership Sprint ($2,500)";
        }

        roiValue.textContent = upside;
        roiPkg.textContent = recommended;
    };

    // 2. Pricing Display Manager
    function updatePricingDisplay() {
        const data = pricingData[currentCurrency];
        if (!data) return;
        const symbol = data.symbol;

        [5, 10, 15].forEach(pkgCount => {
            const pkgInfo = data.packages[pkgCount];
            const priceValElem = document.getElementById(`price-${pkgCount}`);
            const perLessonElem = document.getElementById(`per-lesson-${pkgCount}`);
            const savingsElem = document.getElementById(`savings-${pkgCount}`);
            const cardElem = document.querySelector(`[data-package="${pkgCount}"]`);

            const totalPrice = isEarlyRenewal ? pkgInfo.earlyTotal : pkgInfo.standardTotal;
            const perLessonPrice = (totalPrice / pkgCount).toFixed(2);
            const savingsText = isEarlyRenewal ? pkgInfo.earlySavings : pkgInfo.standardSavings;

            if (priceValElem) priceValElem.textContent = totalPrice;
            if (perLessonElem) perLessonElem.textContent = `${symbol}${perLessonPrice} / session`;
            if (savingsElem) {
                savingsElem.textContent = savingsText;
                if (isEarlyRenewal || pkgCount > 5) {
                    savingsElem.classList.add('active');
                } else {
                    savingsElem.classList.remove('active');
                }
            }

            const symbolElems = cardElem ? cardElem.querySelectorAll('.curr-symbol') : [];
            symbolElems.forEach(s => s.textContent = symbol);
        });
    }

    // Currency Switcher
    segmentBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            segmentBtns.forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            currentCurrency = e.target.getAttribute('data-currency');
            updatePricingDisplay();
            showToast(`Switched currency to ${currentCurrency}`);
        });
    });

    // Early Renewal Toggle
    if (earlyRenewalToggle) {
        earlyRenewalToggle.addEventListener('change', (e) => {
            isEarlyRenewal = e.target.checked;
            updatePricingDisplay();
            showToast(isEarlyRenewal ? 'Applied Early Renewal Rate!' : 'Showing Standard Rates.');
        });
    }

    // Video Play Handlers (Direct YouTube link to avoid file:// Error 153 iframe policy)
    const openVideoBtns = document.querySelectorAll('.open-video-modal');
    const youtubeUrl = 'https://www.youtube.com/watch?v=eWnjK1nXoSw';

    openVideoBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            window.open(youtubeUrl, '_blank', 'noopener,noreferrer');
        });
    });

    // Universal Qualification Intake Modal Handlers
    const qualModal = document.getElementById('qualModal');
    const openQualBtns = document.querySelectorAll('.open-qual-modal');
    const closeQualModalBtn = document.getElementById('closeQualModalBtn');
    const qualModalTitle = document.getElementById('qualModalTitle');

    let currentQualStep = 1;

    window.openQualModal = function(intentText = 'Apply for Executive Coaching') {
        currentQualStep = 1;
        updateQualStepperDisplay();
        if (qualModalTitle) qualModalTitle.textContent = intentText;
        if (qualModal) {
            qualModal.classList.add('active');
            document.body.style.overflow = 'hidden';
        }
    };

    window.closeQualModal = function() {
        if (qualModal) {
            qualModal.classList.remove('active');
            document.body.style.overflow = '';
        }
    };

    window.nextQualStep = function(stepNum) {
        // Simple validation
        if (stepNum > currentQualStep) {
            if (currentQualStep === 1) {
                const role = document.getElementById('qualRole')?.value;
                if (!role) {
                    showToast('Please select your current role.');
                    return;
                }
            } else if (currentQualStep === 2) {
                const bottleneck = document.getElementById('qualBottleneck')?.value;
                if (!bottleneck) {
                    showToast('Please select your primary goal.');
                    return;
                }
            }
        }
        currentQualStep = stepNum;
        updateQualStepperDisplay();
    };

    function updateQualStepperDisplay() {
        [1, 2, 3].forEach(num => {
            const pane = document.getElementById(`qualStep${num}`);
            const dot = document.getElementById(`dotStep${num}`);
            const line = document.getElementById(`lineStep${num - 1}`);

            if (pane) pane.classList.toggle('active', num === currentQualStep);
            if (dot) dot.classList.toggle('active', num <= currentQualStep);
            if (line) line.classList.toggle('active', num < currentQualStep);
        });
    }

    window.handleQualSubmit = function() {
        const role = document.getElementById('qualRole')?.value;
        const bottleneck = document.getElementById('qualBottleneck')?.value;
        const funding = document.getElementById('qualFunding')?.value;

        if (!role || !bottleneck || !funding) {
            showToast('Please complete all 3 qualification questions.');
            return;
        }

        // Save lead data locally
        const leadData = { role, bottleneck, funding, timestamp: new Date().toISOString() };
        localStorage.setItem('fluent_edge_lead', JSON.stringify(leadData));

        showToast('Qualified! Redirecting to Google Calendar Schedule...');

        setTimeout(() => {
            closeQualModal();
            window.open('https://calendar.google.com/calendar/u/0/appointments/schedules/AcZssZ2eS5Lf6RGvLqM1pWFJ0GsXA_FqX1tS_AikzrszcPdrp7m0Z0qSzaYY6Ge5_8584UGuAfR-041o?gv=true', '_blank');
        }, 1200);
    };

    openQualBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            const intent = btn.getAttribute('data-intent') || 'Apply for Coaching';
            openQualModal(intent);
        });
    });

    if (closeQualModalBtn) closeQualModalBtn.addEventListener('click', closeQualModal);
    if (qualModal) {
        qualModal.addEventListener('click', (e) => {
            if (e.target === qualModal) closeQualModal();
        });
    }

    // Modal Interactions (Standard)
    function openModal(preSelectedPackage = null) {
        if (preSelectedPackage && packageSelect) {
            Array.from(packageSelect.options).forEach(opt => {
                if (opt.value.toLowerCase().includes(preSelectedPackage.toLowerCase())) {
                    opt.selected = true;
                }
            });
        }
        if (bookingModal) {
            bookingModal.classList.add('active');
            document.body.style.overflow = 'hidden';
        }
    }

    function closeModal() {
        if (bookingModal) {
            bookingModal.classList.remove('active');
            document.body.style.overflow = '';
        }
    }

    openBookingBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const pkg = btn.getAttribute('data-select-pkg');
            openModal(pkg);
        });
    });

    if (closeBookingBtn) closeBookingBtn.addEventListener('click', closeModal);
    if (bookingModal) {
        bookingModal.addEventListener('click', (e) => {
            if (e.target === bookingModal) closeModal();
        });
    }

    // Accordions
    accordionBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const panel = btn.parentElement;
            const isActive = panel.classList.contains('active');

            document.querySelectorAll('.accordion-panel').forEach(p => p.classList.remove('active'));
            if (!isActive) panel.classList.add('active');
        });
    });

    // Mobile Navigation Drawer
    if (mobileToggle) {
        mobileToggle.addEventListener('click', () => {
            mobileDrawer.classList.toggle('open');
        });
    }

    document.querySelectorAll('.mobile-link').forEach(link => {
        link.addEventListener('click', () => mobileDrawer.classList.remove('open'));
    });

    // Referral Copy
    if (shareReferralBtn) {
        shareReferralBtn.addEventListener('click', () => {
            const text = "Fluent Edge — Executive Tech Career & Presentation Coaching by Mark Parfenov. Earn up to $150 credit: mark.parfenov@gmail.com";
            navigator.clipboard.writeText(text).then(() => {
                showToast("Referral details copied to clipboard!");
            }).catch(() => {
                showToast("Email: mark.parfenov@gmail.com");
            });
        });
    }

    // Toast Utility
    window.showToast = function(message) {
        const toast = document.getElementById('toastNotification');
        const toastMsg = document.getElementById('toastMessage');
        if (toast && toastMsg) {
            toastMsg.textContent = message;
            toast.classList.add('show');
            setTimeout(() => toast.classList.remove('show'), 3000);
        }
    };

    // Reviews Carousel Implementation
    const track = document.getElementById('reviewsTrack');
    const prevBtn = document.getElementById('prevReviewBtn');
    const nextBtn = document.getElementById('nextReviewBtn');
    const dotsContainer = document.getElementById('carouselDots');

    if (track && prevBtn && nextBtn && dotsContainer) {
        const slides = Array.from(track.children);
        let currentIndex = 0;
        let autoplayTimer = null;

        function getVisibleSlides() {
            if (window.innerWidth <= 640) return 1;
            if (window.innerWidth <= 992) return 2;
            return 3;
        }

        function getMaxIndex() {
            return Math.max(0, slides.length - getVisibleSlides());
        }

        function buildDots() {
            dotsContainer.innerHTML = '';
            const maxIdx = getMaxIndex();
            for (let i = 0; i <= maxIdx; i++) {
                const dot = document.createElement('button');
                dot.className = `dot ${i === currentIndex ? 'active' : ''}`;
                dot.setAttribute('aria-label', `Go to slide ${i + 1}`);
                dot.addEventListener('click', () => goToSlide(i));
                dotsContainer.appendChild(dot);
            }
        }

        function updateCarouselPosition() {
            const visibleCount = getVisibleSlides();
            const slideWidth = slides[0].getBoundingClientRect().width;
            const gap = 24; // 1.5rem
            const offset = currentIndex * (slideWidth + gap);
            track.style.transform = `translateX(-${offset}px)`;

            // Update dots
            const dots = Array.from(dotsContainer.children);
            dots.forEach((dot, idx) => {
                dot.classList.toggle('active', idx === currentIndex);
            });
        }

        function goToSlide(index) {
            const maxIdx = getMaxIndex();
            if (index < 0) currentIndex = maxIdx;
            else if (index > maxIdx) currentIndex = 0;
            else currentIndex = index;
            updateCarouselPosition();
        }

        prevBtn.addEventListener('click', () => {
            goToSlide(currentIndex - 1);
            resetAutoplay();
        });

        nextBtn.addEventListener('click', () => {
            goToSlide(currentIndex + 1);
            resetAutoplay();
        });

        function startAutoplay() {
            stopAutoplay();
            autoplayTimer = setInterval(() => {
                goToSlide(currentIndex + 1);
            }, 5000);
        }

        function stopAutoplay() {
            if (autoplayTimer) clearInterval(autoplayTimer);
        }

        function resetAutoplay() {
            stopAutoplay();
            startAutoplay();
        }

        // Mouse hover pause
        track.addEventListener('mouseenter', stopAutoplay);
        track.addEventListener('mouseleave', startAutoplay);

        // Touch Swipe Support
        let startX = 0;
        let isDragging = false;

        track.addEventListener('touchstart', (e) => {
            startX = e.touches[0].clientX;
            isDragging = true;
            stopAutoplay();
        }, { passive: true });

        track.addEventListener('touchend', (e) => {
            if (!isDragging) return;
            isDragging = false;
            const endX = e.changedTouches[0].clientX;
            const diffX = startX - endX;
            if (Math.abs(diffX) > 40) {
                if (diffX > 0) goToSlide(currentIndex + 1);
                else goToSlide(currentIndex - 1);
            }
            startAutoplay();
        }, { passive: true });

        // Resize Listener
        window.addEventListener('resize', () => {
            buildDots();
            if (currentIndex > getMaxIndex()) currentIndex = getMaxIndex();
            updateCarouselPosition();
        });

        // Initialize
        buildDots();
        updateCarouselPosition();
        startAutoplay();
    }

    // Form Submission & Calendar Redirect
    window.handleBookingSubmit = function() {
        const name = document.getElementById('studentName')?.value;
        const email = document.getElementById('studentEmail')?.value;
        const pkg = document.getElementById('packageSelect')?.value;
        const goal = document.getElementById('learningGoal')?.value;
        const notes = document.getElementById('notes')?.value || 'None';

        const calendarUrl = "https://calendar.google.com/calendar/u/0/appointments/schedules/AcZssZ2eS5Lf6RGvLqM1pWFJ0GsXA_FqX1tS_AikzrszcPdrp7m0Z0qSzaYY6Ge5_8584UGuAfR-041o?gv=true";

        const subject = encodeURIComponent(`Fluent Edge Session Booking — ${name} (${pkg})`);
        const body = encodeURIComponent(
            `Hi Mark,\n\nI would like to schedule a session for Fluent Edge.\n\n` +
            `Full Name: ${name}\n` +
            `Email Address: ${email}\n` +
            `Preferred Package: ${pkg}\n` +
            `Primary Goal: ${goal}\n` +
            `Additional Notes: ${notes}\n\n` +
            `Looking forward to connecting!`
        );

        window.location.href = `mailto:mark.parfenov@gmail.com?subject=${subject}&body=${body}`;

        setTimeout(() => {
            window.open(calendarUrl, '_blank');
        }, 500);

        closeModal();
        showToast(`Opening email & Google Calendar schedule...`);
        const form = document.getElementById('bookingForm');
        if (form) form.reset();
    };

    // PAR Assessment Tool State Management
    let storyCount = 3;

    window.addParStory = function() {
        storyCount++;
        const list = document.getElementById('par-story-list');
        if (!list) return;

        const card = document.createElement('div');
        card.className = 'story-card';
        card.innerHTML = `
            <div class="story-meta">
                <span class="story-tag">Story ${storyCount}: Custom PAR Story</span>
                <span class="story-cat" contenteditable="true">Category: Select Category</span>
            </div>
            <div class="story-par-grid">
                <div>
                    <label class="par-label text-danger">Problem</label>
                    <div contenteditable="true" class="par-input">Describe the technical or business problem...</div>
                </div>
                <div>
                    <label class="par-label text-accent">Action</label>
                    <div contenteditable="true" class="par-input">What did YOU specifically do? Architecture, tools, tradeoffs...</div>
                </div>
                <div>
                    <label class="par-label text-success">Result</label>
                    <div contenteditable="true" class="par-input">Quantify the outcome: latency, cost, revenue %, error rate...</div>
                </div>
            </div>
        `;
        list.appendChild(card);
        card.scrollIntoView({ behavior: 'smooth', block: 'center' });
        showToast(`Added PAR Story #${storyCount}`);
    };

    window.updateScorecardTotal = function() {
        const sliders = document.querySelectorAll('.score-range');
        let total = 0;
        sliders.forEach(sl => {
            total += parseInt(sl.value);
            const valSpan = sl.nextElementSibling;
            if (valSpan) valSpan.textContent = `${sl.value}/10`;
        });
        const totalDisplay = document.getElementById('par-total-score');
        if (totalDisplay) {
            totalDisplay.textContent = `${total} / ${sliders.length * 10}`;
        }
    };

    window.saveParData = function() {
        const editableElems = document.querySelectorAll('[contenteditable="true"]');
        const data = {};
        editableElems.forEach((el, index) => {
            data['field_' + index] = el.innerHTML;
        });

        const sliders = document.querySelectorAll('.score-range');
        const sliderData = {};
        sliders.forEach((sl, index) => {
            sliderData['slider_' + index] = sl.value;
        });

        localStorage.setItem('fluentedge_par_data', JSON.stringify(data));
        localStorage.setItem('fluentedge_par_sliders', JSON.stringify(sliderData));
        showToast('PAR Assessment saved to browser!');
    };

    window.loadParData = function() {
        const data = JSON.parse(localStorage.getItem('fluentedge_par_data') || '{}');
        const editableElems = document.querySelectorAll('[contenteditable="true"]');
        editableElems.forEach((el, index) => {
            if (data['field_' + index] !== undefined) {
                el.innerHTML = data['field_' + index];
            }
        });

        const sliderData = JSON.parse(localStorage.getItem('fluentedge_par_sliders') || '{}');
        const sliders = document.querySelectorAll('.score-range');
        sliders.forEach((sl, index) => {
            if (sliderData['slider_' + index] !== undefined) {
                sl.value = sliderData['slider_' + index];
                const valSpan = sl.nextElementSibling;
                if (valSpan) valSpan.textContent = `${sl.value}/10`;
            }
        });

        updateScorecardTotal();
    };

    window.clearParData = function() {
        if (confirm('Are you sure you want to reset your PAR Assessment template?')) {
            localStorage.removeItem('fluentedge_par_data');
            localStorage.removeItem('fluentedge_par_sliders');
            location.reload();
        }
    };

    // Utility: Copy Email
    window.copyEmailAddress = function() {
        navigator.clipboard.writeText('mark.parfenov@gmail.com').then(() => {
            showToast('Email copied: mark.parfenov@gmail.com');
        }).catch(() => {
            showToast('Email: mark.parfenov@gmail.com');
        });
    };

    // Auto-save every 30 seconds
    setInterval(saveParData, 30000);

    // Initial render & load
    updatePricingDisplay();
    loadParData();
    calculateCareerRoi();
});
