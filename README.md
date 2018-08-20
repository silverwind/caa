# caa
[![](https://img.shields.io/npm/v/caa.svg?style=flat)](https://www.npmjs.org/package/caa) [![](https://img.shields.io/npm/dm/caa.svg)](https://www.npmjs.org/package/caa) [![](https://api.travis-ci.org/silverwind/caa.svg?style=flat)](https://travis-ci.org/silverwind/caa)

> rfc6844-conform CAA record lookup

## Install

```sh
npm i caa
```

## Usage

```js
const caa = require('caa');

await caa('subdomain.example.com');
// => [{flags: 0, tag: 'issue', value: 'letsencrypt.org', issuerCritical: false}]

await caa.matches('subdomain.example.com', 'letsencrypt.org');
// => true

```

## API

### caa(name, [opts])

Retrieve the CAA records which apply to the given `name`. Returns a [`CAA` object](https://github.com/mafintosh/dns-packet/#caa).

### caa.matches(name, ca, [opts])

Test if the CAA record for a given `name` matches a given `ca`.

#### Options

- `server`: The DNS server to use. Defaults to the first system resolver or `8.8.8.8` if none is configured).
- `port`: The port on the DNS server to use. Defaults to port 53.
- `ignoreCNAME`: Don't issue CNAME queries.
- `ignoreDNAME`: Don't issue DNAME queries.
- `ignoreTLDs`: Don't query top level domains.
- `dnsSocket`: A [dns-socket instance](https://github.com/mafintosh/dns-socket#var-socket--dnsoptions).

## License

© [silverwind](https://github.com/silverwind), distributed under BSD licence
