// POST /api/logout
const { clearSession, send, route } = require("./_lib");
module.exports = route({ POST: async (req, res) => { clearSession(req, res); send(res, 200, { ok: true }); } });
