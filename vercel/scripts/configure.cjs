// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const fs = require('node:fs');
const path = require('node:path');

function configuration(publicOrigin) {
  const publicURL = new URL(publicOrigin);
  if (publicURL.protocol !== 'https:' || publicURL.pathname !== '/' ||
      publicURL.username || publicURL.password || publicURL.search || publicURL.hash) {
    throw new Error('Provide the actual assigned HTTPS origin, without a path.');
  }
  const upstream = 'https://mustanad-pdf.abdulhadisa966.chatgpt.site';
  const deleteHeader = key => ({ type: 'request.headers', op: 'delete', target: { key } });
  const setHeader = (key, args) => ({ type: 'request.headers', op: 'set', target: { key }, args });
  return {
    $schema: 'https://openapi.vercel.sh/vercel.json',
    framework: null,
    buildCommand: 'npm run build',
    outputDirectory: 'public',
    functions: { 'api/gateway.js': { maxDuration: 75 } },
    routes: [
      {
        src: '/api/shares/(?<shareId>[a-f0-9]{32})',
        methods: ['PUT'],
        has: [
          { type: 'host', value: { eq: publicURL.host } },
          { type: 'header', key: 'origin', value: { eq: publicURL.origin } },
          { type: 'cookie', key: 'pdf-share-device', value: '(?<shareDevice>[a-f0-9]{64})' }
        ],
        // The CDN forwards PDF bytes directly: the Node function's 4.5 MB
        // request limit must not reduce the existing 10 MB sharing limit.
        dest: upstream + '/api/shares/$shareId',
        transforms: [
          ...['authorization', 'proxy-authorization', 'forwarded'].map(deleteHeader),
          ...['oai-', 'cf-', 'x-openai-', 'x-vercel-', 'x-forwarded-', 'x-real-']
            .map(pre => deleteHeader({ pre })),
          setHeader('cookie', 'pdf-share-device=$shareDevice'),
          setHeader('origin', upstream),
          deleteHeader('referer')
        ]
      },
      // Vercel probes PNG and ICO even when the site's head uses its SVG icon.
      // Serve the existing brand icon in all three formats as static assets.
      ...['svg', 'png', 'ico'].map(extension => ({
        src: `/favicon\\.${extension}`,
        methods: ['GET', 'HEAD'],
        dest: `/favicon.${extension}`
      })),
      {
        src: '/(.*)',
        dest: '/api/gateway',
        transforms: [{ type: 'request.path', op: 'set', args: '/$1' }]
      }
    ]
  };
}

module.exports = { configuration };
if (require.main === module) {
  if (!process.argv[2]) throw new Error('Run npm run configure -- https://ACTUAL-DOMAIN.vercel.app');
  const config = configuration(process.argv[2]);
  fs.writeFileSync(path.join(__dirname, '..', 'vercel.json'), JSON.stringify(config, null, 2) + '\n');
  console.log('Configured routing for ' + new URL(process.argv[2]).origin);
}
