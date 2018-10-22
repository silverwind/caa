# caa
[![](https://img.shields.io/npm/v/caa.svg?style=flat)](https://www.npmjs.org/package/caa) [![](https://img.shields.io/npm/dm/caa.svg)](https://www.npmjs.org/package/caa) [![](https://api.travis-ci.org/silverwind/caa.svg?style=flat)](https://travis-ci.org/silverwind/caa)

> [rfc6844](https://tools.ietf.org/html/rfc6844)-conform CAA record lookup and validation

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

### `caa(name, [options])`

Retrieve the CAA records which apply to `name`. Returns a [`CAA` object](https://github.com/mafintosh/dns-packet/#caa).

### `caa.matches(name, ca, [options])`

Test if the CAA record for `name` matches for certificate authority `ca`.

#### `options`

- `servers`: The DNS servers to use. Defaults to the system resolvers or `['8.8.8.8', '8.8.4.4']` if none are configured.
- `port`: The port on the DNS server to use. Default `53`.
- `recursions`: How many recursions to follow. Default `50`.
- `retries`: How many retries to attempt. Default `12`.
- `ignoreTLDs`: Don't query top level domains like `com` in `example.com`.
- `dnsSocket`: A [dns-socket instance](https://github.com/mafintosh/dns-socket#var-socket--dnsoptions).

## License

© [silverwind](https://github.com/silverwind), distributed under BSD licence
