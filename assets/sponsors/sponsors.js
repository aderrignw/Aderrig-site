/* =========================================================
   ADERRIG NW — Sponsors (Footer)
   - Single-row auto-scrolling carousel
   - Logos constrained to header-logo size
   - No dependency on external CSS (injects its own)
   ========================================================= */

(function () {
  const DEFAULT_LOGOS = [
    { src: "/assets/sponsors/sponsor1.png", alt: "Community Sponsor 1" },
    { src: "/assets/sponsors/sponsor2.png", alt: "Community Sponsor 2" },
    { src: "/assets/sponsors/sponsor3.png", alt: "Community Sponsor 3" },
    { src: "/assets/sponsors/sponsor4.png", alt: "Community Sponsor 4" },
    { src: "/assets/sponsors/sponsor5.png", alt: "Community Sponsor 5" }
  ];

  const STYLE_ID = "anw-sponsors-carousel-style";

  function injectStyleOnce() {
    if (document.getElementById(STYLE_ID)) return;

    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      /* Sponsors carousel (scoped) */
      .sponsors-carousel{
        width: 100%;
        overflow: hidden;
        position: relative;
        padding: 8px 0 2px;
      }

      .sponsors-carousel__track{
        width: 100%;
        overflow: hidden;
      }

      .sponsors-carousel__row{
        display: flex;
        align-items: center;
        gap: 28px;
        width: max-content;
        will-change: transform;
        animation: anwSponsorsScroll 22s linear infinite;
      }

      .sponsors-carousel:hover .sponsors-carousel__row{
        animation-play-state: paused;
      }

      .sponsors-carousel__item{
        display: inline-flex;
        align-items: center;
        justify-content: center;
        text-decoration: none;
        border: 0;
        padding: 0;
        margin: 0;
      }

      /* IMPORTANT: lock logo size (match header logo vibe) */
      .sponsors-carousel__img{
        height: 34px;      /* <= adjust here if you want slightly bigger/smaller */
        width: auto;
        max-height: 34px;
        max-width: 220px;
        object-fit: contain;
        display: block;
        opacity: .95;
      }

      @keyframes anwSponsorsScroll{
        from { transform: translateX(0); }
        to   { transform: translateX(-50%); }
      }

      @media (max-width: 768px){
        .sponsors-carousel__row{ gap: 18px; animation-duration: 18s; }
        .sponsors-carousel__img{
          height: 30px;
          max-height: 30px;
          max-width: 180px;
        }
      }

      @media (prefers-reduced-motion: reduce){
        .sponsors-carousel__row{
          animation: none;
        }
        .sponsors-carousel__track{
          overflow-x: auto;
          -webkit-overflow-scrolling: touch;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function sanitize(list) {
    const arr = Array.isArray(list) ? list : [];
    const cleaned = arr
      .filter(x => x && typeof x.src === "string" && x.src.trim())
      .map(x => ({
        src: x.src.trim(),
        alt: (x.alt || "Community Sponsor").toString()
      }));
    return cleaned.length ? cleaned : DEFAULT_LOGOS;
  }

  function renderCarousel(el, logos) {
    // duplicate the list so we can scroll seamlessly with translateX(-50%)
    const doubled = logos.concat(logos);

    const itemsHtml = doubled.map((s, i) => {
      const safeAlt = s.alt.replace(/"/g, "");
      return `
        <span class="sponsors-carousel__item" aria-hidden="${i >= logos.length ? "true" : "false"}">
          <img class="sponsors-carousel__img" src="${s.src}" alt="${safeAlt}" loading="lazy" decoding="async">
        </span>
      `;
    }).join("");

    el.innerHTML = `
      <div class="sponsors-carousel" role="region" aria-label="Community Supporters">
        <div class="sponsors-carousel__track">
          <div class="sponsors-carousel__row">
            ${itemsHtml}
          </div>
        </div>
      </div>
    `;
  }

  function init() {
    injectStyleOnce();

    const elFooter = document.getElementById("sponsorsFooter");
    const elPage   = document.getElementById("sponsorsPage");

    // If you have a JSON config somewhere later, plug it here.
    // For now we just use DEFAULT_LOGOS (or window.ANW_SPONSORS if you define it).
    const logos = sanitize(window.ANW_SPONSORS || DEFAULT_LOGOS);

    if (elFooter) renderCarousel(elFooter, logos);
    if (elPage) renderCarousel(elPage, logos);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
