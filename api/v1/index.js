const { handlePublicApi, run } = require('../../lib/routes');

module.exports = (req, res) => run(req, res, () => handlePublicApi(req, res));
