const { handleHealth, run } = require('../lib/routes');

module.exports = (req, res) => run(req, res, () => handleHealth(req, res));
