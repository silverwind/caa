import {caa, caaMatches, type CaaRecord} from "./index.ts";

const servfailServer = "127.0.0.2";
const record = (tag: string, value: string, flags = 0) => ({flags, tag, value, issuerCritical: Boolean(flags & 0x80)});
const critical = (tag: string, value: string) => record(tag, value, 0x80);
const le = record("issue", "letsencrypt.org");
const multi = [record("issue", "first.com"), record("issue", "second.com")];
const none = [record("issue", ";")];

const zone: Record<string, Array<CaaRecord> | undefined> = {
  "silverwind.io": [le],
  "caa-multi.silverwind.io": multi,
  "cname-caa-multi.silverwind.io": multi,
  "caa-none.silverwind.io": none,
  "caa-wild.silverwind.io": [le, record("issuewild", ";")],
  "caa-none-cname.silverwind.io": none,
  "caa-cname.silverwind.io": [le],
  "xn--r8jz45g.com": [le],
  "xn--p1ai": [le],
  "critical-unknown.example.com": [critical("futureproperty", "anything")],
  "critical-iodef.example.com": [critical("iodef", "mailto:security@example.com"), le],
  "critical-accounturi.example.com": [critical("accounturi", "https://acme.example.com/account/123"), le],
  "critical-validationmethods.example.com": [critical("validationmethods", "http-01"), le],
  "critical-uppercase.example.com": [critical("ISSUE", "letsencrypt.org")],
  "star-mid.example.com": [le],
};

const opts = {
  servers: ["127.0.0.1"],
  dnsSocket: {
    query({questions: [{name}]}: any, _port: number, server: string, cb: (err: null, res: unknown) => void) {
      cb(null, server === servfailServer ? {rcode: "SERVFAIL", answers: []} : {
        rcode: "NOERROR",
        answers: (zone[name] ?? []).map(data => ({name, type: "CAA", data: {...data}})),
      });
    },
  },
};

test.each([
  ["silverwind.io", [le]],
  ["sub.silverwind.io", [le]],
  ["caa-multi.silverwind.io", multi],
  ["cname-caa-multi.silverwind.io", multi],
  ["例え.com", [le]],
])("caa(%s)", async (name, expected) => {
  expect(await caa(name, opts)).toEqual(expected);
});

test("caa with ignoreTLDs skips IDN TLD records", async () => {
  expect(await caa("пример.рф", {...opts, ignoreTLDs: true})).toEqual([]);
});

test("caaMatches retries SERVFAIL on the next server instead of climbing", async () => {
  expect(await caaMatches("caa-none.silverwind.io", "letsencrypt.org", {...opts, servers: [servfailServer, "127.0.0.1"]})).toBe(false);
});

test.each([
  ["silverwind.io", "letsencrypt.org", true],
  ["sub.silverwind.io", "letsencrypt.org", true],
  ["caa-none.silverwind.io", "letsencrypt.org", false],
  ["sub.caa-none.silverwind.io", "letsencrypt.org", false],
  ["caa-wild.silverwind.io", "letsencrypt.org", true],
  ["*.caa-wild.silverwind.io", "letsencrypt.org", false],
  ["sub.caa-wild.silverwind.io", "letsencrypt.org", true],
  ["caa-none-cname.silverwind.io", "letsencrypt.org", false],
  ["caa-cname.silverwind.io", "letsencrypt.org", true],
  ["caa-multi.silverwind.io", "first.com", true],
  ["caa-multi.silverwind.io", "second.com", true],
  ["cname-caa-multi.silverwind.io", "first.com", true],
  ["cname-caa-multi.silverwind.io", "second.com", true],
  ["例え.com", "letsencrypt.org", true],
  ["critical-unknown.example.com", "letsencrypt.org", false],
  ["critical-iodef.example.com", "letsencrypt.org", true],
  ["critical-accounturi.example.com", "letsencrypt.org", true],
  ["critical-validationmethods.example.com", "letsencrypt.org", true],
  ["critical-uppercase.example.com", "letsencrypt.org", true],
  ["critical-uppercase.example.com", "other.org", false],
  ["star-mid.example.com", "letsencrypt.org", true],
])("caaMatches(%s, %s) is %j", async (name, ca, expected) => {
  expect(await caaMatches(name, ca, opts)).toBe(expected);
});
