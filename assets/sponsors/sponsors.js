(function () {
  const sponsors = [
    "/assets/sponsors/sponsor1.png",
    "/assets/sponsors/sponsor2.png",
    "/assets/sponsors/sponsor3.png",
    "/assets/sponsors/sponsor4.png",
    "/assets/sponsors/sponsor5.png"
  ];

  const container = document.getElementById("sponsorsFooter");
  if (!container || !sponsors.length) return;

  // cria trilha
  const track = document.createElement("div");
  track.className = "sponsors-track";

  // duplicamos para efeito infinito
  const loopItems = sponsors.concat(sponsors);

  loopItems.forEach(src => {
    const item = document.createElement("div");
    item.className = "sponsor-item";

    const img = document.createElement("img");
    img.src = src;
    img.alt = "Community Sponsor";

    item.appendChild(img);
    track.appendChild(item);
  });

  container.appendChild(track);
})();
