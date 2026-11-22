const test = require('node:test');
const assert = require('node:assert/strict');
const { createLookup } = require('../db/developmentDns');

test('working system DNS is preferred', () => {
  createLookup({ lookup: (_, __, cb) => cb(null, '127.0.0.1', 4),
    resolve4: () => assert.fail('unexpected fallback') })('x.neon.tech', {}, (err, ip) => {
    assert.equal(err, null); assert.equal(ip, '127.0.0.1');
  });
});
test('development Neon lookup recovers DNS errors without changing host', () => {
  const host = 'example.neon.tech';
  createLookup({ lookup: (_, __, cb) => cb({ code: 'ENOTFOUND' }),
    resolve4: (queried, cb) => { assert.equal(queried, host); cb(null, ['192.0.2.1']); }
  })(host, {}, (err, ip, family) => {
    assert.equal(err, null); assert.equal(ip, '192.0.2.1'); assert.equal(family, 4);
  });
});
test('other hosts and non-DNS errors are not redirected', () => {
  for (const [host, code] of [['example.com', 'ENOTFOUND'], ['x.neon.tech', 'EPERM']]) {
    createLookup({ lookup: (_, __, cb) => cb({ code }), resolve4: () => assert.fail('unexpected fallback')
    })(host, {}, err => assert.equal(err.code, code));
  }
});
