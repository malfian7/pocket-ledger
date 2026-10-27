// POST /api/password { username?, current?, newPassword }
// - Anyone: change their own password (needs the current one).
// - Super Admin: set a new password for any family account.
const { ACCOUNTS, HttpError, requireUser, checkPassword, setPassword, issueSession, send, readBody, route } = require("./_lib");

module.exports = route({
  POST: async (req, res) => {
    const me = await requireUser(req);
    const { username, current, newPassword } = readBody(req);
    const target = String(username || me.id).toLowerCase();
    if (!ACCOUNTS[target]) throw new HttpError(404, "That account doesn't exist.");
    if (typeof newPassword !== "string" || newPassword.length < 8) throw new HttpError(400, "Use at least 8 characters for the new password.");
    if (target === me.id) {
      if (!(await checkPassword(me.id, current))) throw new HttpError(401, "Your current password isn't right.");
    } else if (me.role !== "superadmin") {
      throw new HttpError(403, "Only the Super Admin can change another account's password.");
    }
    await setPassword(target, newPassword);
    if (target === me.id) await issueSession(req, res, me.id); // stay signed in on this device
    send(res, 200, { ok: true, signedOutOthers: true });
  }
});
