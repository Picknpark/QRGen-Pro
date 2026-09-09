const { handleItem, run } = require('../../lib/routes');

module.exports = (req, res) => run(req, res, () => handleItem(req, res, req.query.id, false));
