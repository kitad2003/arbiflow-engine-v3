'use strict';
const assert = require('node:assert/strict');
const registry = require('./registry');
assert.equal(registry.chains.length,25,'expected 25 chains');
assert.equal(registry.exchanges.length,25,'expected 25 exchanges');
for (const [kind,entries] of [['chains',registry.chains],['exchanges',registry.exchanges]]) {
 assert.equal(new Set(entries.map(x=>x.key)).size,25,`${kind} duplicate keys`);
 assert.ok(entries.every(x=>x.status==='registry_only' && x.enabled===false),`${kind} must be disabled registry entries`);
}
assert.equal(registry.safety.mainnetBroadcast,false);
assert.equal(registry.safety.automaticScanning,false);
console.log('PASS: 25 chains, 25 CEXs, unique IDs, disabled integrations, read-only safety');
