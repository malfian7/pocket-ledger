// GET /api/session -> who is signed in (also tells the app it is running with a server)
const { ACCOUNTS, currentUser, send, route } = require("./_lib");

module.exports = route({
  GET: async (req, res) => {
    const accounts = Object.keys(ACCOUNTS).map(id => ({ id, name: ACCOUNTS[id].name, role: ACCOUNTS[id].role }));
    let user = null, setupError = null;
    try { user = await currentUser(req); }
    catch (e) { setupError = e.status ? e.message : "The server isn't set up yet."; }
    send(res, 200, { app: "pocket-ledger", user, accounts, setupError });
  }
});
