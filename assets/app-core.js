
const MASTER_EMAIL = "claudiosantos1968@gmail.com";

function norm(v){ return String(v||"").trim().toLowerCase(); }

async function getToken(){
  const user = netlifyIdentity.currentUser();
  if(!user) return null;
  if(user.token && user.token.access_token) return user.token.access_token;
  if(user.jwt) return await user.jwt(true);
  return null;
}

async function syncUsers(){
  const token = await getToken();
  if(!token) return;

  const res = await fetch("/.netlify/functions/store?key=anw_users", {
    headers: { Authorization: `Bearer ${token}` }
  });

  if(res.ok){
    const users = await res.json();
    localStorage.setItem("anw_users", JSON.stringify(users));
  }
}

function getCurrentUser(){
  const user = netlifyIdentity.currentUser();
  if(!user) return null;

  const email = norm(user.email);
  const users = JSON.parse(localStorage.getItem("anw_users") || "[]");
  let record = users.find(u => norm(u.email) === email);

  if(norm(email) === norm(MASTER_EMAIL)){
    return {
      email,
      role: "owner",
      isAdmin: true,
      isOwner: true
    };
  }

  return record || null;
}

netlifyIdentity.on("login", async () => {
  await syncUsers();
  location.reload();
});

document.addEventListener("DOMContentLoaded", async () => {
  await syncUsers();
});
