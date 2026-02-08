/* =========================================================
   Community Sponsors – Footer
   All logos forced to SAME size as site logo
   ========================================================= */

(function () {
  const container = document.getElementById("sponsorsFooter");
  if (!container) return;

  // ===== CONFIGURAÇÃO ÚNICA =====
  const LOGO_HEIGHT = 40; // mesmo tamanho do logo do site (px)

  // ===== LISTA DE SPONSORS =====
  const sponsors = [
    {
      name: "Community Sponsor 1",
      image: "/assets/sponsors/sponsor1.png",
      url: "#"
    },
    {
      name: "Community Sponsor 2",
      image: "/assets/sponsors/sponsor2.png",
      url: "#"
    },
    {
      name: "Community Sponsor 3",
      image: "/assets/sponsors/sponsor3.png",
      url: "#"
    },
    {
      name: "Community Sponsor 4",
      image: "/assets/sponsors/sponsor4.png",
      url: "#"
    }
  ];

  // ===== CONTAINER STYLE =====
  container.style.display = "flex";
  container.style.justifyContent = "center";
  container.style.alignItems = "center";
  container.style.gap = "24px";
  container.style.flexWrap = "wrap";
  container.style.marginTop = "12px";

  // ===== RENDER SPONSORS =====
  sponsors.forEach(sponsor => {
    const link = document.createElement("a");
    link.href = sponsor.url || "#";
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.title = sponsor.name;

    link.style.display = "flex";
    link.style.alignItems = "center";
    link.style.justifyContent = "center";

    const img = document.createElement("img");
    img.src = sponsor.image;
    img.alt = sponsor.name;

    // 🔒 REGRA FINAL DE TAMANHO (NÃO QUEBRA)
    img.style.height = LOGO_HEIGHT + "px";
    img.style.width = "auto";
    img.style.maxHeight = LOGO_HEIGHT + "px";
    img.style.maxWidth = "160px"; // segurança extra
    img.style.objectFit = "contain";
    img.style.display = "block";

    link.appendChild(img);
    container.appendChild(link);
  });
})();
