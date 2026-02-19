(function () {
  "use strict";

  // Deployed site URL used ONLY for localhost development.
  // In production we automatically use window.location.origin so the same build
  // works on your Netlify subdomain and on the custom domain.
  const DEPLOYED_SITE_URL = "https://aderrignw.ie";

  function isLocalhost(hostname) {
    return (
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname === "0.0.0.0" ||
      hostname.endsWith(".localhost")
    );
  }

  function initIdentity() {
    if (!window.netlifyIdentity) return;

    const hostname = (window.location && window.location.hostname) ? window.location.hostname : "";
    const isLocal = isLocalhost(hostname);

    const siteUrl = isLocal ? DEPLOYED_SITE_URL : (window.location && window.location.origin ? window.location.origin : DEPLOYED_SITE_URL);

    try {
      if (isLocal) {
        // ✅ Force Identity API to the deployed Identity endpoint to avoid local proxy timeouts/CORS issues.
        const apiUrl = siteUrl.replace(/\/+$/, "") + "/.netlify/identity";

        try { localStorage.setItem("netlifySiteURL", siteUrl); } catch (e) {}

        window.netlifyIdentity.init({ APIUrl: apiUrl });
      } else {
        window.netlifyIdentity.init();
      }
    } catch (e) {
      console.error("Netlify Identity init failed:", e);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initIdentity);
  } else {
    initIdentity();
  }
})();