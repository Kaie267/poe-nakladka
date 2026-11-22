'use strict';
// Odczyt kodu Path of Building: klasa postaci i lista gemów (do poradnika kampanii).
const zlib = require('zlib');

function decodePob(code) {
  const clean = String(code || '').trim().replace(/^https?:\/\/\S+\//, '').replace(/-/g, '+').replace(/_/g, '/');
  const buf = Buffer.from(clean, 'base64');
  const xml = zlib.inflateSync(buf).toString('utf8');
  const cls = (xml.match(/<Build[^>]*\bclassName="([^"]+)"/) || [])[1] || null;
  const asc = (xml.match(/<Build[^>]*\bascendClassName="([^"]+)"/) || [])[1] || null;
  const gems = new Set();
  const re = /<Gem\b[^>]*>/g;
  let m;
  while ((m = re.exec(xml))) {
    const tag = m[0];
    const name = (tag.match(/\bnameSpec="([^"]+)"/) || tag.match(/\bname="([^"]+)"/) || [])[1];
    if (!name) continue;
    // Wsparcia mają w PoB nazwę bez słowa "Support", a w nagrodach questów z nim — zapisujemy obie formy.
    gems.add(name);
    if (/skillId="Support/.test(tag) && !/ Support$/.test(name)) gems.add(name + ' Support');
  }
  return { className: cls, ascendancy: asc, gems: [...gems] };
}

module.exports = { decodePob };
