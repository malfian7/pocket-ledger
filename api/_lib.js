// Shared helpers for the Pocket Ledger API (Vercel Node functions, no dependencies).
// Files starting with "_" inside /api are not exposed as endpoints.
const crypto = require("crypto");

const ACCOUNTS = {
  superadmin: { name: "Super Admin", role: "superadmin" },
  wife:       { name: "Wife",        role: "adult" },
  husband:    { name: "Husband",     role: "adult" },
  child:      { name: "Child",       role: "child" }
};
const MEMBERS = ["wife", "husband", "child"];
const COOKIE = "pl_session";
const MAX_AGE = 60 * 60 * 24 * 30; // 30 days
const MAX_DATA_BYTES = 900 * 1024;

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

/* ---------- Upstash Redis over REST ---------- */
function redisConfig() {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  return { url, token };
}
async function redis(...command) {
  const { url, token } = redisConfig();
  if (!url || !token) throw new HttpError(500, "The database isn't connected. In Vercel, add Upstash Redis to this project (Storage tab), then redeploy.");
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(command)
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.error) throw new Error("Redis error: " + (json.error || res.status));
  return json.result;
}

/* ---------- sessions (HMAC-signed, HttpOnly cookie) ---------- */
// Values pasted into Vercel often carry stray spaces, line breaks or quotes. Strip them.
function clean(v) { return String(v == null ? "" : v).trim().replace(/^["'`]+|["'`]+$/g, "").trim(); }

// SESSION_SECRET is optional. If it's missing or too short, a random secret is
// generated once and kept in the database, so sign-in works without any setup.
let cachedSecret = null;
function envSecret() { const s = clean(process.env.SESSION_SECRET); return s.length >= 16 ? s : ""; }
async function secret() {
  if (cachedSecret) return cachedSecret;
  const fromEnv = envSecret();
  if (fromEnv) return (cachedSecret = fromEnv);
  let stored = await redis("GET", "pl:secret");
  if (!stored) {
    await redis("SET", "pl:secret", crypto.randomBytes(48).toString("base64url"), "NX");
    stored = await redis("GET", "pl:secret");
  }
  return (cachedSecret = String(stored));
}
async function sign(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const mac = crypto.createHmac("sha256", await secret()).update(body).digest("base64url");
  return body + "." + mac;
}
async function verify(token) {
  if (!token || token.indexOf(".") < 0) return null;
  const [body, mac] = token.split(".");
  const expected = crypto.createHmac("sha256", await secret()).update(body).digest("base64url");
  const a = Buffer.from(mac || ""), b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (!p.exp || p.exp < Date.now()) return null;
    return p;
  } catch (e) { return null; }
}
function readCookies(req) {
  const out = {};
  (req.headers.cookie || "").split(";").forEach(part => {
    const i = part.indexOf("=");
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  });
  return out;
}
function secureFlag(req) {
  const host = String(req.headers.host || "");
  return host.startsWith("localhost") || host.startsWith("127.0.0.1") ? "" : " Secure;";
}
function setSession(req, res, token) {
  res.setHeader("Set-Cookie", `${COOKIE}=${token}; Path=/; HttpOnly;${secureFlag(req)} SameSite=Lax; Max-Age=${MAX_AGE}`);
}
function clearSession(req, res) {
  res.setHeader("Set-Cookie", `${COOKIE}=; Path=/; HttpOnly;${secureFlag(req)} SameSite=Lax; Max-Age=0`);
}
async function passwordVersion(user) { return Number(await redis("GET", `pl:pwv:${user}`) || 0); }
async function issueSession(req, res, user) {
  const v = await passwordVersion(user);
  setSession(req, res, await sign({ u: user, v, exp: Date.now() + MAX_AGE * 1000 }));
}
async function currentUser(req) {
  const p = await verify(readCookies(req)[COOKIE]);
  if (!p || !ACCOUNTS[p.u]) return null;
  if ((await passwordVersion(p.u)) !== p.v) return null; // password changed since sign-in
  return publicUser(p.u);
}
async function requireUser(req) {
  const u = await currentUser(req);
  if (!u) throw new HttpError(401, "Please sign in again.");
  return u;
}
function publicUser(id) { return { id, name: ACCOUNTS[id].name, role: ACCOUNTS[id].role }; }

/* ---------- passwords (scrypt) ---------- */
function scrypt(pw, salt) {
  return new Promise((resolve, reject) => crypto.scrypt(pw, salt, 64, (err, key) => err ? reject(err) : resolve(key)));
}
async function hashPassword(pw) {
  const salt = crypto.randomBytes(16).toString("hex");
  return salt + ":" + (await scrypt(pw, salt)).toString("hex");
}
function envPassword(user) { return clean(process.env[`${user.toUpperCase()}_PASSWORD`]); }
async function hasPassword(user) { return !!(await redis("GET", `pl:pw:${user}`)) || !!envPassword(user); }
async function checkPassword(user, pw) {
  if (typeof pw !== "string") return false;
  pw = pw.trim();
  if (!pw) return false;
  const stored = await redis("GET", `pl:pw:${user}`);
  if (stored) {
    const [salt, hash] = String(stored).split(":");
    const got = await scrypt(pw, salt);
    const want = Buffer.from(hash, "hex");
    return got.length === want.length && crypto.timingSafeEqual(got, want);
  }
  const env = envPassword(user);
  if (!env) return false;
  const a = crypto.createHash("sha256").update(pw).digest();
  const b = crypto.createHash("sha256").update(env).digest();
  return crypto.timingSafeEqual(a, b);
}
async function setPassword(user, pw) {
  await redis("SET", `pl:pw:${user}`, await hashPassword(String(pw).trim()));
  await redis("INCR", `pl:pwv:${user}`); // signs out every other device
}

/* ---------- data ---------- */
async function readData(user) {
  const raw = await redis("GET", `pl:data:${user}`);
  if (!raw) return { rev: 0, updatedAt: null, data: null };
  try { return JSON.parse(raw); } catch (e) { return { rev: 0, updatedAt: null, data: null }; }
}
async function writeData(user, rev, data) {
  const record = { rev, updatedAt: new Date().toISOString(), data };
  const text = JSON.stringify(record);
  if (Buffer.byteLength(text) > MAX_DATA_BYTES) throw new HttpError(413, "This account's data is too large to save. Delete old entries or download a backup first.");
  await redis("SET", `pl:data:${user}`, text);
  return record;
}

/* ---------- http helpers ---------- */
function send(res, status, obj) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(obj));
}
function readBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  try { return JSON.parse(req.body || "{}"); } catch (e) { return {}; }
}
function route(methods) {
  return async (req, res) => {
    const fn = methods[req.method];
    if (!fn) { res.setHeader("Allow", Object.keys(methods).join(", ")); return send(res, 405, { error: "Method not allowed." }); }
    try { await fn(req, res); }
    catch (e) {
      if (!e.status) console.error(e);
      send(res, e.status || 500, { error: e.status ? e.message : "Something went wrong on the server. Try again in a moment." });
    }
  };
}

module.exports = {
  clean, envSecret, envPassword, redisConfig,
  ACCOUNTS, MEMBERS, HttpError, redis, issueSession, clearSession, currentUser, requireUser, publicUser,
  checkPassword, setPassword, hasPassword, readData, writeData, send, readBody, route
};
