// GET /api/users -> Super Admin only: every family account with its data
const { ACCOUNTS, MEMBERS, HttpError, requireUser, readData, hasPassword, send, route } = require("./_lib");

module.exports = route({
  GET: async (req, res) => {
    const me = await requireUser(req);
    if (me.role !== "superadmin") throw new HttpError(403, "Only the Super Admin can see every account.");
    const users = [];
    for (const id of MEMBERS) {
      const rec = await readData(id);
      users.push({ id, name: ACCOUNTS[id].name, role: ACCOUNTS[id].role, passwordSet: await hasPassword(id), rev: rec.rev, updatedAt: rec.updatedAt, data: rec.data });
    }
    send(res, 200, { users });
  }
});
