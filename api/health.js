// GET /api/health -> setup checklist for the sign-in screen (never returns secret values)
const { ACCOUNTS, redis, redisConfig, envSecret, envPassword, send, route } = require("./_lib");

module.exports = route({
  GET: async (req, res) => {
    const out = { app: "pocket-ledger", database: { ok: false, message: "" }, sessionSecret: "", accounts: {} };
    const { url, token } = redisConfig();
    if (!url || !token) {
      out.database.message = "Not connected. Add Upstash Redis in the Storage tab, connect it to this project, then redeploy.";
    } else {
      try { await redis("PING"); out.database.ok = true; out.database.message = "Connected"; }
      catch (e) { out.database.message = "Connection failed. Reconnect Upstash Redis in the Storage tab, then redeploy."; }
    }
    out.sessionSecret = envSecret() ? "Set in Vercel" : "Automatic (no setup needed)";
    for (const id of Object.keys(ACCOUNTS)) {
      const a = { name: ACCOUNTS[id].name, variable: `${id.toUpperCase()}_PASSWORD`, password: "missing", locked: false };
      let changedInApp = false;
      if (out.database.ok) {
        try {
          changedInApp = !!(await redis("GET", `pl:pw:${id}`));
          a.locked = Number(await redis("GET", `pl:fail:${id}`) || 0) >= 10;
        } catch (e) {}
      }
      if (changedInApp) a.password = "changed in the app";
      else if (envPassword(id)) a.password = "set in Vercel";
      out.accounts[id] = a;
    }
    send(res, 200, out);
  }
});
