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

console.log(await caa('subdomain.example.com'));
// => [{flags: 0, tag: 'issue', tag: 'issue', value: 'letsencrypt.org', issuerCritical: false}]

console.log(await caa.matches('subdomain.example.com', 'letsencrypt.org'));
// => true

```

## API

### caa(name, {server, port})

Retrieve the CAA records which apply to the given `name`. Returns a [`CAA` object](https://github.com/mafintosh/dns-packet/#caa).

### caa(name, ca, {server, port})

Test if the CAA record for a given `name` matches a given `ca`.

#### Options

Optionally, a DNS `server` and `port` can be supplied, defaulting to the first system resolver and port 53.

## License

© [silverwind](https://github.com/silverwind), distributed under BSD licence
