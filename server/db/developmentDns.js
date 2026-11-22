const dns = require('node:dns');
const net = require('node:net');

// Some local DNS servers refuse Neon's hostname while public DNS resolves it.
// Scoped to the development Postgres socket; keep the real host for TLS/SNI.
function createLookup({ lookup = dns.lookup, resolve4 } = {}) {
  if (!resolve4) {
    const resolver = new dns.Resolver({ timeout: 1500, tries: 1 });
    resolver.setServers(['1.1.1.1', '8.8.8.8']);
    resolve4 = (host, callback) => resolver.resolve4(host, callback);
  }
  return (host, options, callback) => {
    lookup(host, options, (error, address, family) => {
      if (!error || !host.endsWith('.neon.tech') ||
          !['ENOTFOUND', 'EAI_AGAIN', 'EREFUSED'].includes(error.code)) {
        return callback(error, address, family);
      }
      resolve4(host, (fallbackError, addresses) => {
        if (fallbackError || !addresses?.length) return callback(error);
        callback(null, addresses[0], 4);
      });
    });
  };
}

const lookup = createLookup();
class DevelopmentSocket extends net.Socket {
  connect(port, host) {
    return super.connect({ port, host, family: 4, lookup });
  }
}

module.exports = { createLookup, createDevelopmentSocket: () => new DevelopmentSocket() };
