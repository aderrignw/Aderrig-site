/* =========================================================
   Community Sponsors – Footer Carousel (single row)
   - Infinite auto-scroll carousel
   - Logos forced to same height as site logo
   - Pauses on hover
   ========================================================= */

(function () {
  const container = document.getElementById("sponsorsFooter");
  if (!container) return;

  // ===== SETTINGS =====
  const LOGO_HEIGHT = 40;   // igual ao logo do site
  const SPEED_SECONDS = 22; // menor = mais rápido / maior = mais lento

  // ===== SPONSORS LIST =====
  const sponsors = [
    { name: "Community Sponsor 1", image: "/assets/sponsors/sponsor1.png", url: "#" },
    { name: "Community Sponsor 2", image: "/assets/sponsors/sponsor2.png", url: "#" },
    { name: "Community Sponsor 3", image: "/assets/sponsors/sponsor3.png", url: "#" },
    { name: "Community Sponsor 4", image: "/assets/sponsors/sponsor4.png", url: "#" },
    { name: "Community Sponsor 5", image: "/assets/sponsors/sponsor5.png", url: "#" }
  ];

  // Clear container to avoid duplicates if script runs twice
  container.innerHTML = "";

  // ===== Inject CSS once =====
  const STYLE_ID = "anw-sponsors-carousel-style";
  if (!document.getElementById(STYLE_ID)) {
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      /* Wrapper hides overflow so it looks like a carousel */
      .anw-sponsors-wrap{
        width: 100%;
        display: flex;
        justify-content: center;
        margin: 10px 0 6px;
      }

      .anw-sponsors-viewport{
        width: min(var(--container, 1100px), calc(100% - 32px));
        overflow: hidden;
        position: relative;
      }

      /* Track scrolls horizontally forever */
      .anw-sponsors-track{
        display: flex;
        align-items: center;
        gap: 26px;
        width: max-content;
        will-change: transform;
        animation: anwSponsorMarquee linear infinite;
      }

      /* Pause on hover */
      .anw-sponsors-viewport:hover .anw-sponsors-track{
        animation-play-state: paused;
      }

      .anw-sponsor{
        display: inline-flex;
        align-items: center;
        justify-content: center;
        text-decoration: none;
        flex: 0 0 auto;
        padding: 2px 0;
      }

      .anw-sponsor img{
        height: ${LOGO_HEIGHT}px;
        width: auto;
        max-height: ${LOGO_HEIGHT}px;
        max-width: 180px;
        object-fit: contain;
        display: block;
      }

      /* Reduced motion: no animation, allow manual scroll */
      @media (prefers-reduced-motion: reduce){
        .anw-sponsors-track{ animation: none !important; }
        .anw-sponsors-viewport{ overflow-x: auto; -webkit-overflow-scrolling: touch; }
      }

      /* Keyframes: move half the track width (because we duplicate the list) */
      @keyframes anwSponsorMarquee {
        from { transform: translateX(0); }
        to   { transform: translateX(-50%); }
      }
    `;
    document.head.appendChild(style);
  }

  // ===== Build DOM structure =====
  const wrap = document.createElement("div");
  wrap.className = "anw-sponsors-wrap";

  const viewport = document.createElement("div");
  viewport.className = "anw-sponsors-viewport";

  const track = document.createElement("div");
  track.className = "anw-sponsors-track";

  // ===== Helper to create one sponsor element =====
  function makeSponsorEl(s) {
    const a = document.createElement("a");
    a.className = "anw-sponsor";
    a.href = s.url || "#";
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.title = s.name || "";

    const img = document.createElement("img");
    img.src = s.image;
    img.alt = s.name || "Sponsor";

    a.appendChild(img);
    return a;
  }

  // ===== We duplicate the list so the animation loops seamlessly =====
  const all = sponsors.concat(sponsors);

  all.forEach(s => track.appendChild(makeSponsorEl(s)));

  viewport.appendChild(track);
  wrap.appendChild(viewport);
  container.appendChild(wrap);

  // ===== After render: set animation duration dynamically =====
  // We use -50% in keyframes; to make that valid, we set track width > viewport and keep it duplicated.
  // We control speed by duration only.
  track.style.animationDuration = `${SPEED_SECONDS}s`;

  // ===== Safety: if images fail to load, hide broken ones =====
  track.querySelectorAll("img").forEach(img => {
    img.addEventListener("error", () => {
      const parent = img.closest(".anw-sponsor");
      if (parent) parent.style.display = "none";
    });
  });
})();
