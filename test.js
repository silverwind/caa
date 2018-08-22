"use strict";

const caa = require(".");
const assert = require("assert");

(async () => {
  assert.equal((await caa("silverwind.io")).map(r => r.value).includes("letsencrypt.org"), true);
  assert.equal((await caa("sub.silverwind.io")).map(r => r.value).includes("letsencrypt.org"), true);
  assert.equal(await caa.matches("silverwind.io", "letsencrypt.org"), true);
  assert.equal(await caa.matches("sub.silverwind.io", "letsencrypt.org"), true);
  assert.equal(await caa.matches("caa-none.silverwind.io", "letsencrypt.org"), false);
  assert.equal(await caa.matches("sub.caa-none.silverwind.io", "letsencrypt.org"), false);
  assert.equal(await caa.matches("caa-wild.silverwind.io", "letsencrypt.org"), true);
  assert.equal(await caa.matches("*.caa-wild.silverwind.io", "letsencrypt.org"), false);
  assert.equal(await caa.matches("sub.caa-wild.silverwind.io", "letsencrypt.org"), true);
})();
