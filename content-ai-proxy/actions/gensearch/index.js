const { createProxy } = require('../lib/proxy');

exports.main = createProxy('gensearch', { passQueryOptions: false });
