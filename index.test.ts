import {caa, caaMatches, type CaaRecord} from "./index.ts";

type CaaData = {flags: number, tag: string, value: string};
type Zone = Record<string, Array<CaaData> | undefined>;

function makeStub(zone: Zone) {
  return {
    query(packet: any, _port: number, _server: string, cb: (err: unknown, res: unknown) => void) {
      const name = packet.questions[0].name;
      const records = zone[name] ?? [];
      cb(null, {
        rcode: "NOERROR",
        answers: records.map(r => ({
          name,
          type: "CAA",
          data: {...r, issuerCritical: Boolean(r.flags & 0x80)},
        })),
      });
    },
  };
}

const issue = (value: string): CaaData => ({flags: 0, tag: "issue", value});
const issueWild = (value: string): CaaData => ({flags: 0, tag: "issuewild", value});
const critical = (tag: string, value: string): CaaData => ({flags: 0x80, tag, value});

// Resolver chases CNAMEs and returns the target's CAA records under the queried name —
// see RFC 8659 §7. Stub mirrors that for cname-* entries.
const multi = [issue("first.com"), issue("second.com")];
const zone: Zone = {
  "silverwind.io": [issue("letsencrypt.org")],
  "caa-multi.silverwind.io": multi,
  "cname-caa-multi.silverwind.io": multi,
  "caa-none.silverwind.io": [issue(";")],
  "caa-wild.silverwind.io": [issue("letsencrypt.org"), issueWild(";")],
  "caa-none-cname.silverwind.io": [issue(";")],
  "caa-cname.silverwind.io": [issue("letsencrypt.org")],
  "xn--r8jz45g.com": [issue("letsencrypt.org")],
  "critical-unknown.example.com": [critical("futureproperty", "anything")],
  "critical-iodef.example.com": [critical("iodef", "mailto:security@example.com"), issue("letsencrypt.org")],
  "critical-accounturi.example.com": [critical("accounturi", "https://acme.example.com/account/123"), issue("letsencrypt.org")],
  "critical-validationmethods.example.com": [critical("validationmethods", "http-01"), issue("letsencrypt.org")],
  "star-mid.example.com": [issue("letsencrypt.org")],
};

const opts = {dnsSocket: makeStub(zone), servers: ["127.0.0.1"]};

test("tests", async () => {
  const tests: Array<{promise: ReturnType<typeof caa | typeof caaMatches>, expect: boolean | ((records: Array<CaaRecord>) => boolean)}> = [
    {promise: caa("silverwind.io", opts), expect: r => r.map(rec => rec.value).includes("letsencrypt.org")},
    {promise: caa("sub.silverwind.io", opts), expect: r => r.map(rec => rec.value).includes("letsencrypt.org")},
    {promise: caa("caa-multi.silverwind.io", opts), expect: r => r.length === 2},
    {promise: caa("cname-caa-multi.silverwind.io", opts), expect: r => r.length === 2},
    {promise: caaMatches("silverwind.io", "letsencrypt.org", opts), expect: true},
    {promise: caaMatches("sub.silverwind.io", "letsencrypt.org", opts), expect: true},
    {promise: caaMatches("caa-none.silverwind.io", "letsencrypt.org", opts), expect: false},
    {promise: caaMatches("sub.caa-none.silverwind.io", "letsencrypt.org", opts), expect: false},
    {promise: caaMatches("caa-wild.silverwind.io", "letsencrypt.org", opts), expect: true},
    {promise: caaMatches("*.caa-wild.silverwind.io", "letsencrypt.org", opts), expect: false},
    {promise: caaMatches("sub.caa-wild.silverwind.io", "letsencrypt.org", opts), expect: true},
    {promise: caaMatches("caa-none-cname.silverwind.io", "letsencrypt.org", opts), expect: false},
    {promise: caaMatches("caa-cname.silverwind.io", "letsencrypt.org", opts), expect: true},
    {promise: caaMatches("caa-multi.silverwind.io", "first.com", opts), expect: true},
    {promise: caaMatches("caa-multi.silverwind.io", "second.com", opts), expect: true},
    {promise: caaMatches("cname-caa-multi.silverwind.io", "first.com", opts), expect: true},
    {promise: caaMatches("cname-caa-multi.silverwind.io", "second.com", opts), expect: true},

    // IDN: U-label resolves to A-label
    {promise: caa("例え.com", opts), expect: r => r.length === 1 && r[0].value === "letsencrypt.org"},
    {promise: caaMatches("例え.com", "letsencrypt.org", opts), expect: true},

    // RFC 8659 §4.5: unknown property tag with the critical flag forbids issuance
    {promise: caaMatches("critical-unknown.example.com", "letsencrypt.org", opts), expect: false},

    // Critical flag on tags the library recognizes is not a denial
    {promise: caaMatches("critical-iodef.example.com", "letsencrypt.org", opts), expect: true},
    {promise: caaMatches("critical-accounturi.example.com", "letsencrypt.org", opts), expect: true},
    {promise: caaMatches("critical-validationmethods.example.com", "letsencrypt.org", opts), expect: true},

    // isWildcard requires a literal "*." prefix — middle-asterisk is not a wildcard
    {promise: caaMatches("star-mid.example.com", "letsencrypt.org", opts), expect: true},
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
