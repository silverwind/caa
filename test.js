"use strict";

const caa = require(".");
const assert = require("assert");

(async () => {
  try {
    const tests = [
      {promise: caa("silverwind.io"), expect: records => records.map(r => r.value).includes("letsencrypt.org")},
      {promise: caa("sub.silverwind.io"), expect: records => records.map(r => r.value).includes("letsencrypt.org")},
      {promise: caa("caa-multi.silverwind.io"), expect: records => records.length > 1},
      {promise: caa("cname-caa-multi.silverwind.io"), expect: records => records.length > 1},
      {promise: caa.matches("silverwind.io", "letsencrypt.org"), expect: true},
      {promise: caa.matches("sub.silverwind.io", "letsencrypt.org"), expect: true},
      {promise: caa.matches("caa-none.silverwind.io", "letsencrypt.org"), expect: false},
      {promise: caa.matches("sub.caa-none.silverwind.io", "letsencrypt.org"), expect: false},
      {promise: caa.matches("caa-wild.silverwind.io", "letsencrypt.org"), expect: true},
      {promise: caa.matches("*.caa-wild.silverwind.io", "letsencrypt.org"), expect: false},
      {promise: caa.matches("sub.caa-wild.silverwind.io", "letsencrypt.org"), expect: true},
      {promise: caa.matches("caa-none-cname.silverwind.io", "letsencrypt.org"), expect: false},
      {promise: caa.matches("caa-cname.silverwind.io", "letsencrypt.org"), expect: true},
    ];

    const results = await Promise.all(tests.map(test => test.promise));
    for (const [i, result] of results.entries()) {
      const expect = tests[i].expect;
      if (typeof expect === "function") {
        assert(tests[i].expect(result));
      } else {
        assert.equal(result, expect, `Test ${i} failed`);
      }
    }
  } catch (err) {
    console.info(err);
    process.exit(1);
  }
})();
