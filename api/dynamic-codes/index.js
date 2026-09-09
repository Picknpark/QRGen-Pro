const { handleCollection, run } = require('../../lib/routes');

module.exports = (req, res) => run(req, res, () => handleCollection(req, res, false));
