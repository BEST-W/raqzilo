// SPDX-License-Identifier: AGPL-3.0-only
'use strict';

const { createMalafakServer } = require('../proxy.cjs');
const canonicalOrigin = process.env.PUBLIC_ORIGIN ||
  (process.env.VERCEL_PROJECT_PRODUCTION_URL && `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`);
const productionServer = createMalafakServer({ publicOrigin: canonicalOrigin });
const handlers = new Map();
if (canonicalOrigin) {
  handlers.set(new URL(canonicalOrigin).host, productionServer.listeners('request')[0]);
  // Only deployment hosts supplied by Vercel are accepted. A visitor's Host or
  // forwarded headers cannot create an upstream or an additional allowed origin.
  for (const host of [process.env.VERCEL_URL, process.env.VERCEL_BRANCH_URL]) {
    if (!host || handlers.has(host) || !/^[a-z0-9-]+\.vercel\.app$/i.test(host)) continue;
    const server = createMalafakServer({ publicOrigin: `https://${host}`, canonicalOrigin, indexable: false });
    handlers.set(host, server.listeners('request')[0]);
  }
}

// Keep an invocation alive until the streamed upstream response has finished.
module.exports = function gateway(request, response) {
  return new Promise((resolve, reject) => {
    function cleanup() {
      response.removeListener('finish', complete);
      response.removeListener('close', complete);
      response.removeListener('error', failed);
    }
    function complete() { cleanup(); resolve(); }
    function failed(error) { cleanup(); reject(error); }
    response.once('finish', complete);
    response.once('close', complete);
    response.once('error', failed);
    const handleRequest = handlers.get(request.headers.host) || productionServer.listeners('request')[0];
    try { handleRequest(request, response); }
    catch (error) { failed(error); }
  });
};
