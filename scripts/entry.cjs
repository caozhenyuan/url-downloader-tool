const { join, dirname } = require('node:path');
const webDir = typeof process.pkg !== 'undefined'
  ? join(dirname(process.execPath), 'web')
  : join(__dirname, 'web');
process.env.__WEB_DIR__ = webDir;
require('./bundle.cjs');
