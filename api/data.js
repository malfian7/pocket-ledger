// GET /api/data            -> your own data
// GET /api/data?user=wife  -> Super Admin only: read another account's data
// PUT /api/data { rev, data } -> save your own data (409 if another device saved first)
const { MEMBERS, HttpError, requireUser, readData, writeData, send, readBody, route } = require("./_lib");

module.exports = route({
  GET: async (req, res) => {
    const me = await requireUser(req);
    let target = me.id;
    const asked = req.query && req.query.user;
    if (asked && asked !== me.id) {
      if (me.role !== "superadmin") throw new HttpError(403, "You can only open your own data.");
      if (!MEMBERS.includes(asked)) throw new HttpError(404, "That account doesn't exist.");
      target = asked;
    }
    send(res, 200, await readData(target));
  },
  PUT: async (req, res) => {
    const me = await requireUser(req);
    if (me.role === "superadmin") throw new HttpError(403, "The Super Admin account can view other accounts but doesn't keep its own data.");
    const { rev, data } = readBody(req);
    if (!data || typeof data !== "object" || !Array.isArray(data.expenses) || !Array.isArray(data.incomes) || !Array.isArray(data.savings)) {
      throw new HttpError(400, "The data sent was incomplete.");
    }
    const current = await readData(me.id);
    if (Number(rev || 0) !== Number(current.rev || 0)) return send(res, 409, current);
    send(res, 200, await writeData(me.id, Number(current.rev || 0) + 1, data));
  }
});
