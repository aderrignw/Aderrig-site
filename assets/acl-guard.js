/*
 Aderrig ACL Guard (fixed)
 Prevents redirect loops with the dashboard and allows public shells.
*/

(function () {

  const body = document.body || {};
  const shellPublic = body.dataset && body.dataset.aclShellPublic === "true";

  function redirectToDashboard() {
    if (window.location.pathname !== "/dashboard.html") {
      window.location.href = "/dashboard.html";
    }
  }

  function isUserApproved(user) {
    try {
      return user && user.app_metadata && user.app_metadata.approved === true;
    } catch (e) {
      return false;
    }
  }

  function handleUser(user) {

    // If this page is marked public, do nothing
    if (shellPublic) {
      return;
    }

    // If not logged in → redirect
    if (!user) {
      redirectToDashboard();
      return;
    }

    // If logged in but not approved → redirect
    if (!isUserApproved(user)) {
      redirectToDashboard();
      return;
    }

    // approved user → allow
  }

  // Netlify Identity integration
  if (window.netlifyIdentity) {

    window.netlifyIdentity.on("init", function (user) {
      handleUser(user);
    });

    window.netlifyIdentity.on("login", function (user) {
      handleUser(user);
    });

    window.netlifyIdentity.on("logout", function () {
      redirectToDashboard();
    });

  }

})();
