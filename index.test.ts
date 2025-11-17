import {caa, caaMatches, type CaaRecord} from "./index.ts";

test("tests", async () => {
  const tests: Array<{promise: ReturnType<typeof caa | typeof caaMatches>, expect: boolean | ((records: Array<CaaRecord>) => boolean)}> = [
    {promise: caa("silverwind.io"), expect: records => records.map(r => r.value).includes("letsencrypt.org")},
    {promise: caa("sub.silverwind.io"), expect: records => records.map(r => r.value).includes("letsencrypt.org")},
    {promise: caa("caa-multi.silverwind.io"), expect: records => records.length > 1},
    {promise: caa("cname-caa-multi.silverwind.io"), expect: records => records.length > 1},
    {promise: caaMatches("silverwind.io", "letsencrypt.org"), expect: true},
    {promise: caaMatches("sub.silverwind.io", "letsencrypt.org"), expect: true},
    {promise: caaMatches("caa-none.silverwind.io", "letsencrypt.org"), expect: false},
    {promise: caaMatches("sub.caa-none.silverwind.io", "letsencrypt.org"), expect: false},
    {promise: caaMatches("caa-wild.silverwind.io", "letsencrypt.org"), expect: true},
    {promise: caaMatches("*.caa-wild.silverwind.io", "letsencrypt.org"), expect: false},
    {promise: caaMatches("sub.caa-wild.silverwind.io", "letsencrypt.org"), expect: true},
    {promise: caaMatches("caa-none-cname.silverwind.io", "letsencrypt.org"), expect: false},
    {promise: caaMatches("caa-cname.silverwind.io", "letsencrypt.org"), expect: true},
    {promise: caaMatches("caa-multi.silverwind.io", "first.com"), expect: true},
    {promise: caaMatches("caa-multi.silverwind.io", "second.com"), expect: true},
    {promise: caaMatches("cname-caa-multi.silverwind.io", "first.com"), expect: true},
    {promise: caaMatches("cname-caa-multi.silverwind.io", "second.com"), expect: true},
  ];

  for (const [i, result] of (await Promise.all(tests.map(test => test.promise))).entries()) {
    const expected = tests[i].expect;
    if (typeof expected === "function") {
      expect(expected(result as Array<CaaRecord>)).toBeTruthy();
    } else {
      expect(result).toEqual(expected);
    }
  }
});
