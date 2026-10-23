const { createProxy } = require('../lib/proxy');

exports.main = createProxy('search', { passQueryOptions: true });
