const assert = require('assert');
const { parseItem } = require('../src/parser');
const S = require('./samples');

const ring = parseItem(S.ring);
assert.equal(ring.rarity, 'Rare');
assert.equal(ring.baseType, 'Amethyst Ring');
assert.equal(ring.ilvl, 84);
assert.equal(ring.corrupted, true);
assert.deepEqual(ring.mods.map(m => m.type), ['implicit', 'explicit', 'explicit', 'explicit', 'explicit']);
assert.deepEqual(ring.mods[4].nums, [3, 7]);

const c = parseItem(S.currency);
assert.equal(c.name, 'Chaos Orb'); assert.equal(c.stack, 12); assert.equal(c.mods.length, 0);

const d = parseItem(S.divcard);
assert.equal(d.name, 'The Doctor'); assert.equal(d.stack, 3);

const g = parseItem(S.gem);
assert.equal(g.name, 'Arc'); assert.equal(g.gemLevel, 21); assert.equal(g.quality, 20); assert.equal(g.corrupted, true);

const u = parseItem(S.unique);
assert.equal(u.name, 'Tabula Rasa'); assert.equal(u.links, 6);

const m = parseItem(S.map);
assert.equal(m.isMap, true); assert.equal(m.mapTier, 16); assert.equal(m.mapStats.length, 3);
assert.equal(m.mods.length, 4);

const a = parseItem(S.advanced);
assert.deepEqual(a.mods.map(x => x.text), ['+12% to Fire and Cold Resistances', '+88 to maximum Life', '30% increased Movement Speed', '+15% to Lightning Resistance']);
assert.deepEqual(a.mods.map(x => x.type), ['implicit', 'explicit', 'explicit', 'crafted']);

assert.equal(parseItem('hello world'), null);
console.log('parser: OK');
