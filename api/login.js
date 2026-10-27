// POST /api/login { username, password }
const { ACCOUNTS, HttpError, redis, issueSession, checkPassword, hasPassword, publicUser, send, readBody, route } = require("./_lib");
const MAX_FAILS = 10, LOCK_SECONDS = 15 * 60;

module.exports = route({
  POST: async (req, res) => {
    const { username, password } = readBody(req);
    const user = String(username || "").toLowerCase();
    if (!ACCOUNTS[user]) throw new HttpError(400, "Choose an account to sign in.");
    const failKey = `pl:fail:${user}`;
    const fails = Number(await redis("GET", failKey) || 0);
    if (fails >= MAX_FAILS) throw new HttpError(429, "Too many wrong passwords. Wait 15 minutes, then try again.");
    if (!(await hasPassword(user))) throw new HttpError(403, `No password is set for ${ACCOUNTS[user].name} yet. Add ${user.toUpperCase()}_PASSWORD in Vercel, then redeploy.`);
    if (!(await checkPassword(user, password))) {
      await redis("INCR", failKey);
      await redis("EXPIRE", failKey, LOCK_SECONDS);
      throw new HttpError(401, "That password isn't right. Check it and try again.");
    }
    await redis("DEL", failKey);
    await issueSession(req, res, user);
    send(res, 200, { user: publicUser(user) });
  }
});
