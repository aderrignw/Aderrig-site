/* =========================================================
   Sponsors footer carousel (single-line marquee)
   - Renders sponsor logos into #sponsorsFooter
   - Single row, continuous scrolling loop
   - Logos constrained by CSS var: --sponsor-h
   ========================================================= */

(function () {
  const FOOTER_ID = "sponsorsFooter";

  // Update this list if you add/remove sponsor images
  const SPONSORS = [
    { src: "/assets/sponsors/sponsor1.png", alt: "Community Sponsor 1" },
    { src: "/assets/sponsors/sponsor2.png", alt: "Community Sponsor 2" },
    { src: "/assets/sponsors/sponsor3.png", alt: "Community Sponsor 3" },
    { src: "/assets/sponsors/sponsor4.png", alt: "Community Sponsor 4" },
    { src: "/assets/sponsors/sponsor5.png", alt: "Community Sponsor 5" },
  ];

  // Pixels per second for the marquee animation (tweak if you want faster/slower)
  const SPEED_PX_PER_SEC = 55;

  function prefersReducedMotion() {
    return window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  function el(tag, attrs = {}, children = []) {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === "class") n.className = v;
      else if (k === "style") n.setAttribute("style", v);
      else if (k.startsWith("data-")) n.setAttribute(k, v);
      else n[k] = v;
    }
    for (const c of children) n.appendChild(c);
    return n;
  }

  function buildLogo({ src, alt }) {
    const img = el("img", { src, alt, loading: "lazy", decoding: "async" });
    // Link abre o PNG (útil pra testar rápido)
    return el("a", { href: src, target: "_blank", rel: "noopener", class: "sponsor-item" }, [img]);
  }

  function setMotionVars(track) {
    const firstSet = track.querySelector(".sponsor-set");
    const w = firstSet ? firstSet.scrollWidth : (track.scrollWidth || 1200);

    // Duration based on content width for consistent speed
    const seconds = Math.max(12, Math.round(w / SPEED_PX_PER_SEC));
    track.style.setProperty("--marquee-dur", `${seconds}s`);
    track.style.setProperty("--marquee-shift", `${w}px`);
  }

  function init() {
    const mount = document.getElementById(FOOTER_ID);
    if (!mount) return;

    mount.innerHTML = "";

    const title = el("div", { class: "sponsor-title" });
    title.textContent = "Community Supporters";

    const wrapper = el("div", { class: "sponsor-marquee", "aria-label": "Community supporters carousel" });
    const track = el("div", { class: "sponsor-track" });

    // Build one set
    const set1 = el("div", { class: "sponsor-set" });
    SPONSORS.forEach((s) => set1.appendChild(buildLogo(s)));

    // Duplicate for seamless loop
    const set2 = el("div", { class: "sponsor-set", "aria-hidden": "true" });
    SPONSORS.forEach((s) => set2.appendChild(buildLogo(s)));

    track.appendChild(set1);
    track.appendChild(set2);
    wrapper.appendChild(track);

    mount.appendChild(title);
    mount.appendChild(wrapper);

    if (prefersReducedMotion()) {
      wrapper.classList.add("reduced-motion");
      return;
    }

    // After images load, measure widths and set animation vars
    const imgs = mount.querySelectorAll("img");
    let pending = imgs.length;

    const done = () => {
      pending = Math.max(0, pending - 1);
      if (pending === 0) setMotionVars(track);
    };

    if (!pending) setMotionVars(track);

    imgs.forEach((img) => {
      if (img.complete) done();
      else {
        img.addEventListener("load", done, { once: true });
        img.addEventListener("error", done, { once: true });
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
