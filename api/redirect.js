const { handleRedirect, run } = require('../lib/routes');

module.exports = (req, res) => run(req, res, () => handleRedirect(req, res));
