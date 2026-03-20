document.addEventListener("DOMContentLoaded", () => {

    /* ═══════════════════════════════════════════
       LOGO ANIMATION (Canvas Trail)
       ═══════════════════════════════════════════ */

    const svgEl = document.getElementById("base-svg");
    const pathEl = document.getElementById("logo-path");
    const canvas = document.getElementById("glow-canvas");
    const ctx = canvas.getContext("2d");

    const vbWidth = 1681.94;
    const vbHeight = 150.15;
    const canvasPad = 40;

    let svgRect;
    let scaleX, scaleY;

    function resize() {
        // Calculate untransformed SVG dimensions from CSS rules to avoid
        // feedback loop with CSS transform scale during resize
        const vw = window.innerWidth;
        const containerW = Math.min(vw <= 768 ? vw * 0.95 : vw * 0.9, 1400);
        const aspectRatio = vbHeight / vbWidth;
        svgRect = { width: containerW, height: containerW * aspectRatio };

        // Use 3× DPR so logo stays sharp when CSS scales it down
        const dpr = (window.devicePixelRatio || 1) * 3;
        canvas.width = (svgRect.width + canvasPad * 2) * dpr;
        canvas.height = (svgRect.height + canvasPad * 2) * dpr;
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.scale(dpr, dpr);
        ctx.translate(canvasPad, canvasPad);
        scaleX = svgRect.width / vbWidth;
        scaleY = svgRect.height / vbHeight;
    }

    window.addEventListener('resize', () => {
        resize();
        trail.length = 0; // Clear old trail drawn at previous dimensions
    });
    resize();

    // ── Ustawienia wizualne ──
    const speed = 2;
    const subSteps = 15;
    const tailColor = '#d3d3d3';
    const lineThickness = 3.0;
    const trailLifetime = 240;

    // ── Mouse interaction ──
    const mouseRadius = 200;
    const waveStrength = 18;
    const noiseStrength = 8;

    let mouseClientX = -9999;
    let mouseClientY = -9999;
    let mouseX = -9999;
    let mouseY = -9999;
    let scrollProgress = 0; // 0 = hero, 1 = fully scrolled

    document.addEventListener("mousemove", (e) => {
        mouseClientX = e.clientX;
        mouseClientY = e.clientY;

        // Oblicz mouseX/Y w przestrzeni canvasa (uwzględniając aktualną pozycję SVG na ekranie)
        const rect = svgEl.getBoundingClientRect();
        // Przelicz z pozycji na ekranie (skalowanej przez CSS transform) do oryginalnej przestrzeni rysowania
        const cssScale = 1 - scrollProgress * (1 - 0.14);
        mouseX = (e.clientX - rect.left) / cssScale;
        mouseY = (e.clientY - rect.top) / cssScale;
    });

    // ── Split path into letter sub-paths ──
    const dString = pathEl.getAttribute('d');
    const matchStrings = dString.match(/M[^Z]+Z/gi) || [dString];

    const paths = matchStrings.map(dLine => {
        const p = document.createElementNS("http://www.w3.org/2000/svg", "path");
        p.setAttribute("d", dLine);
        p.style.visibility = "hidden";
        svgEl.appendChild(p);
        return { el: p, length: p.getTotalLength() };
    });

    let currentPathIndex = 0;
    let currentLength = 0;
    let pData = paths[currentPathIndex];
    let lastPoint = pData.el.getPointAtLength(currentLength);
    const trail = [];

    function mouseFactor(x, y) {
        // Wyłącz interakcję myszki gdy logo jest zmniejszone (w nawigacji)
        if (scrollProgress > 0.5) return 0;
        const dx = x - mouseX;
        const dy = y - mouseY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > mouseRadius) return 0;
        const f = 1 - dist / mouseRadius;
        return f * f;
    }

    function displace(x, y) {
        const f = mouseFactor(x, y);
        if (f === 0) return { x, y };
        const dx = x - mouseX;
        const dy = y - mouseY;
        const angle = Math.atan2(dy, dx);
        const push = waveStrength * f;
        const perpAngle = angle + Math.PI / 2;
        const jitter = noiseStrength * f * (Math.random() - 0.5) * 2;
        return {
            x: x + Math.cos(angle) * push + Math.cos(perpAngle) * jitter,
            y: y + Math.sin(angle) * push + Math.sin(perpAngle) * jitter
        };
    }

    function animateLogo() {
        for (let i = 0; i < subSteps; i++) {
            currentLength += speed;
            let jumped = false;
            while (currentLength > pData.length) {
                currentLength -= pData.length;
                currentPathIndex = (currentPathIndex + 1) % paths.length;
                pData = paths[currentPathIndex];
                lastPoint = pData.el.getPointAtLength(currentLength);
                jumped = true;
            }
            const pt = pData.el.getPointAtLength(currentLength);
            trail.push({
                x1: lastPoint.x * scaleX,
                y1: lastPoint.y * scaleY,
                x2: pt.x * scaleX,
                y2: pt.y * scaleY,
                age: 0,
                gap: jumped // Oznacza skok między literami — nie rysuj kreski
            });
            lastPoint = pt;
        }

        ctx.clearRect(-canvasPad, -canvasPad, svgRect.width + canvasPad * 2, svgRect.height + canvasPad * 2);

        // Usuwamy martwe segmenty i aktualizujemy wiek
        for (let i = trail.length - 1; i >= 0; i--) {
            trail[i].age++;
            if (trail[i].age > trailLifetime) {
                trail.splice(i, 1);
            }
        }

        // Rysujemy segmenty jako ciągłe polilinie, przerywając na granicach liter
        const bandSize = 10;
        ctx.strokeStyle = tailColor;
        // Partial compensation for CSS scale — sqrt keeps lines visible but not fat
        const currentScale = 1 - scrollProgress * (1 - getTargetScale());
        ctx.lineWidth = lineThickness / Math.sqrt(Math.max(currentScale, 0.05));
        ctx.lineCap = "round";
        ctx.lineJoin = "round";

        for (let b = 0; b < trail.length; b += bandSize) {
            const end = Math.min(b + bandSize, trail.length);
            let avgAge = 0;
            for (let i = b; i < end; i++) avgAge += trail[i].age;
            avgAge /= (end - b);
            const opacity = 1 - avgAge / trailLifetime;
            if (opacity <= 0) continue;

            ctx.globalAlpha = opacity;
            ctx.beginPath();
            const p0 = displace(trail[b].x1, trail[b].y1);
            ctx.moveTo(p0.x, p0.y);

            for (let i = b; i < end; i++) {
                if (trail[i].gap) {
                    // Skok na nową literę — przerywamy polilinie
                    ctx.stroke();
                    ctx.beginPath();
                    const gp = displace(trail[i].x1, trail[i].y1);
                    ctx.moveTo(gp.x, gp.y);
                }
                const p = displace(trail[i].x2, trail[i].y2);
                ctx.lineTo(p.x, p.y);
            }
            ctx.stroke();
        }

        ctx.globalAlpha = 1;
        requestAnimationFrame(animateLogo);
    }

    requestAnimationFrame(animateLogo);


    /* ═══════════════════════════════════════════
       SCROLL — Navbar + Logo shrink
       ═══════════════════════════════════════════ */

    const navbar = document.getElementById("navbar");
    const hero = document.getElementById("hero");
    const animContainer = document.getElementById("animation-container");

    // Dynamic targetScale: desired final logo width in px
    // On desktop: ~200px, on mobile: ~50% of viewport width
    function getTargetScale() {
        const vw = window.innerWidth;
        const elemW = animContainer.offsetWidth;
        const desiredWidth = vw <= 768 ? vw * 0.5 : 200;
        return Math.min(desiredWidth / elemW, 0.5);
    }

    function lerp(a, b, t) {
        return a + (b - a) * t;
    }

    function onScroll() {
        const scrollY = window.scrollY;
        const heroH = hero.offsetHeight;
        const progress = Math.min(Math.max(scrollY / (heroH * 0.7), 0), 1);
        // Ease-in-out
        const t = progress < 0.5
            ? 2 * progress * progress
            : 1 - Math.pow(-2 * progress + 2, 2) / 2;
        
        scrollProgress = t; // Udostępnij globalnie dla animacji

        const elemW = animContainer.offsetWidth;
        const elemH = animContainer.offsetHeight;
        const vw = window.innerWidth;
        const vh = window.innerHeight;

        // Start: logo wycentrowane na ekranie
        // Z transform-origin: 0 0, translate ustawia lewy górny róg
        const startX = (vw - elemW) / 2;
        const startY = (vh - elemH) / 2;

        // Koniec: lewy górny róg, wycentrowane pionowo w navbar (60px)
        const navH = 60;
        const ts = getTargetScale();
        const scaledH = elemH * ts;
        const endX = vw <= 768 ? 16 : 40;
        const endY = (navH - scaledH) / 2;

        const s = lerp(1, ts, t);
        const tx = lerp(startX, endX, t);
        const ty = lerp(startY, endY, t);

        animContainer.style.transform = `translate(${tx}px, ${ty}px) scale(${s})`;
        animContainer.style.opacity = lerp(1, 0.85, t);

        if (progress > 0.3) {
            navbar.classList.add("scrolled");
            document.body.classList.add("scrolled-past-hero");
        } else {
            navbar.classList.remove("scrolled");
            document.body.classList.remove("scrolled-past-hero");
        }
    }

    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    onScroll();


    /* ═══════════════════════════════════════════
       SCROLL REVEAL — IntersectionObserver
       ═══════════════════════════════════════════ */

    const revealEls = document.querySelectorAll(".reveal");

    const revealObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add("revealed");
            }
        });
    }, {
        threshold: 0.15,
        rootMargin: "0px 0px -50px 0px"
    });

    revealEls.forEach(el => revealObserver.observe(el));


    /* ═══════════════════════════════════════════
       TERMINAL TYPING EFFECT
       ═══════════════════════════════════════════ */

    const typingTarget = document.getElementById("typing-text");
    const aboutText = `Cześć! Jestem Daniel Ambroziewicz — inżynier mechatronik z Krakowa.\nAktualnie pracuję jako Process Innovation Intern w Aptiv (Versigent),\ngdzie tworzę systemy wizji komputerowej i rozwiązania embedded.\n\nMoja praca inżynierska — zautomatyzowany system kontroli jakości\nz dokładnością ponad 97% — została wyróżniona przez AGH i opisana w prasie.\n\nSpecjalizuję się w Pythonie, C++, PyTorch i YOLO.\nZawsze otwarty na nowe wyzwania.`;

    let typingIndex = 0;
    let typingStarted = false;

    function typeChar() {
        if (typingIndex < aboutText.length) {
            typingTarget.textContent += aboutText[typingIndex];
            typingIndex++;
            const delay = aboutText[typingIndex - 1] === '\n' ? 200 : 25 + Math.random() * 30;
            setTimeout(typeChar, delay);
        }
    }

    // Start typing when "about" section becomes visible
    const aboutSection = document.getElementById("about");
    const typingObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting && !typingStarted) {
                typingStarted = true;
                setTimeout(typeChar, 500);
            }
        });
    }, { threshold: 0.3 });

    typingObserver.observe(aboutSection);


    /* ═══════════════════════════════════════════
       CUSTOM CURSOR
       ═══════════════════════════════════════════ */

    const cursorEl = document.getElementById("custom-cursor");

    document.addEventListener("mousemove", (e) => {
        cursorEl.style.transform = `translate(${e.clientX - 10}px, ${e.clientY - 10}px)`;
    });

    // ═══════════ HAMBURGER MENU ═══════════
    const menuToggle = document.getElementById('menu-toggle');
    const navLinks = document.getElementById('nav-links');

    menuToggle.addEventListener('click', () => {
        menuToggle.classList.toggle('open');
        navLinks.classList.toggle('open');
        const isOpen = navLinks.classList.contains('open');
        // Prevent body scroll when menu is open
        document.body.style.overflow = isOpen ? 'hidden' : '';
        // Hide logo animation behind menu overlay
        animContainer.style.visibility = isOpen ? 'hidden' : 'visible';
    });

    // Smooth scroll for nav links + close mobile menu
    document.querySelectorAll('#nav-links a').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            // Close mobile menu
            menuToggle.classList.remove('open');
            navLinks.classList.remove('open');
            document.body.style.overflow = '';
            animContainer.style.visibility = 'visible';

            const target = document.querySelector(link.getAttribute('href'));
            if (target) {
                target.scrollIntoView({ behavior: 'smooth' });
            }
        });
    });

});
