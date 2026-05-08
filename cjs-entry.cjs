#!/usr/bin/env node
// CommonJS wrapper for pkg compatibility with ESM
(async () => {
  await import('./server/index.js');
})();
