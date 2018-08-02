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

const records = await caa('subdomain.example.com');
console.log(records);

// [
//   {
//     flags: 0,
//     tag: 'issue',
//     value: 'letsencrypt.org',
//     issuerCritical: false
//   }
// ]
```

## API

### caa(name, [{server, port}])

Retrieve the CAA records which apply to the given `name`. Returns a [`CAA` object](https://github.com/mafintosh/dns-packet/#caa). Optionally, a DNS `server` and `port` can be supplied, defaulting to the system resolver and port 53.

## License

© [silverwind](https://github.com/silverwind), distributed under BSD licence

Based on previous work by [Felipe Apostol](https://github.com/flipjs)
