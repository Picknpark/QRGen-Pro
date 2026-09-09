const { handleSummary, run } = require('../../lib/routes');

module.exports = (req, res) => run(req, res, () => handleSummary(req, res));
