const { handleDashboard, run } = require('../lib/routes');

module.exports = (req, res) => run(req, res, () => handleDashboard(req, res));
