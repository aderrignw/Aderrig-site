
const { getStore } = require("@netlify/blobs");

const MASTER_EMAIL = "claudiosantos1968@gmail.com";
const MASTER_EIRCODE = "K78T2W8";

function norm(v){ return String(v||"").trim().toLowerCase(); }

function makeStore(){
  return getStore({ name: "anw-store" });
}

exports.handler = async (event) => {
  try{
    const store = makeStore();
    const user = event.context?.clientContext?.user;

    if(!user || !user.email){
      return { statusCode: 401, body: JSON.stringify({ error: "Not authenticated" }) };
    }

    const email = norm(user.email);
    let users = await store.get("anw_users", { type: "json" }) || [];
    if(!Array.isArray(users)) users = [];

    let record = users.find(u => norm(u.email) === email);

    // MASTER BOOTSTRAP
    if(norm(email) === norm(MASTER_EMAIL)){
      if(!record){
        record = {
          email: MASTER_EMAIL,
          role: "owner",
          approved: true,
          status: "active",
          eircode: MASTER_EIRCODE,
          createdAt: new Date().toISOString()
        };
        users.unshift(record);
      }else{
        record.role = "owner";
        record.approved = true;
        record.status = "active";
        record.eircode = MASTER_EIRCODE;
      }
      await store.set("anw_users", users);
    }

    if(event.httpMethod === "GET"){
      const key = event.queryStringParameters?.key;
      if(key === "anw_users"){
        return { statusCode: 200, body: JSON.stringify(users) };
      }
      const data = await store.get(key, { type: "json" });
      return { statusCode: 200, body: JSON.stringify(data || null) };
    }

    if(event.httpMethod === "POST"){
      const body = JSON.parse(event.body || "{}");
      await store.set(body.key, body.value);
      return { statusCode: 200, body: JSON.stringify({ success: true }) };
    }

    return { statusCode: 405, body: "Method not allowed" };

  }catch(e){
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
};
