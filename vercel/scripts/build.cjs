'use strict';
const fs = require('node:fs');
// Vercel's Other preset requires a nonempty static output directory alongside
// the /api function. The routing table sends website requests to the gateway.
fs.mkdirSync('public', { recursive: true });
fs.writeFileSync('public/health.json', '{"ok":true}\n');
