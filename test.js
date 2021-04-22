import caa from "./index.js";

test("tests", async () => {
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
    {promise: caa.matches("caa-multi.silverwind.io", "first.com"), expect: true},
    {promise: caa.matches("caa-multi.silverwind.io", "second.com"), expect: true},
    {promise: caa.matches("cname-caa-multi.silverwind.io", "first.com"), expect: true},
    {promise: caa.matches("cname-caa-multi.silverwind.io", "second.com"), expect: true},
  ];

  for (const [i, result] of Object.entries(await Promise.all(tests.map(test => test.promise)))) {
    const expected = tests[i].expect;
    if (typeof expected === "function") {
      expect(expected(result)).toBeTruthy();
    } else {
      expect(result).toEqual(expected);
    }
  }
});
