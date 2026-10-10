'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { rewriteFlight, rewriteInlineFlight } = require('./proxy.cjs');
const rewrite = text => text.replaceAll('https://mustanad-pdf.abdulhadisa966.chatgpt.site',
  'https://raqzilo-test.vercel.app').replaceAll('https://malafak.is-a.dev',
  'https://raqzilo-test.vercel.app').replace(/noindex,\s*nofollow/g, 'index, follow');

function embeddedFlight(html) {
  const chunks = [];
  for (const script of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)) {
    for (const push of script[1].matchAll(/\.rsc\.push\(("(?:\\.|[^"\\])*")\)/g)) {
      chunks.push(JSON.parse(push[1]));
    }
  }
  return Buffer.from(chunks.join(''));
}

function metadataFrame(flight) {
  const header = /[a-f0-9]+:T([a-f0-9]+),/.exec(flight.toString());
  assert(header, 'The real homepage must contain framed metadata.');
  const start = Buffer.byteLength(flight.toString().slice(0, header.index + header[0].length));
  const end = start + Number.parseInt(header[1], 16);
  return { text: flight.subarray(start, end).toString(), next: flight.subarray(end).toString() };
}

const original = fs.readFileSync(__dirname + '/malafak-upstream-home.html', 'utf8');
const originalFlight = embeddedFlight(original);
const before = metadataFrame(originalFlight);
assert(before.text.endsWith('</script>'));
assert(before.next.startsWith('1:[['));

// The previous rewrite consumed four bytes of the next record, reproducing the
// browser's "Connection closed" failure on an actual captured homepage.
const broken = metadataFrame(embeddedFlight(rewrite(original)));
assert(!broken.text.endsWith('</script>'));
assert(!broken.next.startsWith('1:[['));

const fixedHtml = rewriteInlineFlight(original, rewrite);
const fixedFlight = embeddedFlight(fixedHtml);
const after = metadataFrame(fixedFlight);
assert.equal(after.text, rewrite(before.text));
assert(after.text.endsWith('</script>'));
assert(after.next.startsWith('1:[['));
assert.equal(fixedFlight.toString(), rewriteFlight(originalFlight, rewrite).toString());
assert(!fixedFlight.toString().includes('noindex'));
assert(fixedHtml.includes('\\u003c'));
assert(!fixedHtml.includes('push("<'));

// Multibyte Arabic changes frame lengths in bytes, rather than characters.
const arabic = 'مرحبا — noindex, nofollow';
const framed = Buffer.from('0:T' + Buffer.byteLength(arabic).toString(16) + ',' + arabic + '1:null\n');
const fixed = rewriteFlight(framed, rewrite).toString();
const expected = rewrite(arabic);
assert.equal(fixed, '0:T' + Buffer.byteLength(expected).toString(16) + ',' + expected + '1:null\n');

// A typed-array payload can contain both newlines and URL-like bytes; it must
// be preserved instead of being treated as another textual metadata record.
const binary = Buffer.from('https://malafak.is-a.dev\n\x00\xff', 'latin1');
const typed = Buffer.concat([Buffer.from('0:o' + binary.length.toString(16) + ','), binary,
  Buffer.from('1:null\n')]);
assert.deepEqual(rewriteFlight(typed, rewrite), typed);
assert.throws(() => rewriteFlight(Buffer.from('0:Tffff,short'), rewrite), /Incomplete/);
console.log('PASS: real homepage Flight metadata, Arabic byte framing, and binary preservation.');
