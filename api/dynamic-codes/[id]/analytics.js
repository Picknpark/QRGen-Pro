const { handleAnalytics, run } = require('../../../lib/routes');

module.exports = (req, res) => run(req, res, () => handleAnalytics(req, res, req.query.id, false));
