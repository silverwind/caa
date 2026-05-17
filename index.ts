import {getServers} from "node:dns";
import {promisify} from "node:util";
import {domainToASCII} from "node:url";
import dnsSocket from "dns-socket";
import tlds from "tlds" with {type: "json"};

type CaaOpts = {
  ignoreTLDs?: boolean,
  recursions?: number,
  retries?: number,
  port?: number,
  servers?: Array<string>,
  dnsSocket?: any,
};

const defaults = {
  ignoreTLDs: false,
  recursions: 50,
  retries: 12,
  port: 53,
  servers: ["8.8.8.8", "8.8.4.4"], // fallback when no system resolvers are configured
};

const tldSet = new Set(tlds);
const knownTags = new Set(["issue", "issuewild", "iodef", "contactemail", "contactphone", "accounturi", "validationmethods"]);
const okRcodes = new Set(["NXDOMAIN", "NOERROR"]);
const isTLD = (name: string) => tldSet.has(name);
const isWildcard = (name: string) => name.startsWith("*.");
const parent = (name: string) => name.split(".").slice(1).join(".");

function normalizeName(name: string = "") {
  const wildcard = isWildcard(name);
  const base = wildcard ? name.slice(2) : name;
  let ascii = domainToASCII(base) || base.toLowerCase();
  if (ascii.endsWith(".") && ascii.length > 1) ascii = ascii.slice(0, -1);
  return wildcard ? `*.${ascii}` : ascii;
}

export type CaaRecord = {
  flags: number,
  tag: string,
  value: string,
  issuerCritical: boolean,
};

export async function caa(name: string, opts: CaaOpts = {}): Promise<Array<CaaRecord>> {
  const ignoreTLDs = opts.ignoreTLDs ?? defaults.ignoreTLDs;
  const recursions = opts.recursions ?? defaults.recursions;
  const retries = opts.retries ?? defaults.retries;
  const port = opts.port ?? defaults.port;
  let servers: Array<string>;
  if (opts.servers?.length) {
    servers = opts.servers;
  } else {
    const sys = getServers();
    servers = sys.length ? sys : defaults.servers;
  }
  const socket = opts.dnsSocket || dnsSocket();
  const query = promisify(socket.query.bind(socket));

  // RFC 8659 §3: query CAA at the FQDN; if empty, climb to the parent.
  // CNAME/DNAME chasing is the recursive resolver's responsibility.
  const climb = async (name: string, recursionsLeft: number, retriesLeft: number): Promise<Array<CaaRecord>> => {
    if (!name) return [];
    if (ignoreTLDs && isTLD(name)) return [];
    if (recursionsLeft <= 0 || retriesLeft <= 0) return [];

    const server = servers[(retries - retriesLeft) % servers.length];
    let res;
    try {
      res = await query({questions: [{name, type: "CAA"}]}, port, server);
    } catch {
      res = null;
    }
    if (!res || (!res.answers && !okRcodes.has(res.rcode))) {
      return climb(name, recursionsLeft, retriesLeft - 1);
    }

    const caas: Array<CaaRecord> = [];
    for (const ans of res.answers || []) {
      if (ans?.type === "CAA" && ans.data) caas.push(ans.data);
    }
    if (caas.length) return caas;
    if (isTLD(name)) return [];
    return climb(parent(name), recursionsLeft - 1, retriesLeft);
  };

  const result = await climb(normalizeName(name).replace(/^\*\./, ""), recursions, retries);
  if (!opts.dnsSocket) socket.destroy();
  return result;
}

export async function caaMatches(name: string, ca: string, opts: CaaOpts = {}): Promise<boolean> {
  const wildcard = isWildcard(name);
  ca = normalizeName(ca);

  const records = await caa(name, opts);
  if (!records.length) return true;

  // RFC 8659 §4.5: an unknown Property tag with the critical flag forbids all issuance.
  if (records.some(r => r.issuerCritical && !knownTags.has(r.tag))) return false;

  const issueNames: Array<string> = [];
  const issueWildNames: Array<string> = [];
  for (const r of records) {
    if (r.tag === "issue") issueNames.push(normalizeName(r.value.split(";")[0].trim()));
    else if (r.tag === "issuewild") issueWildNames.push(normalizeName(r.value.split(";")[0].trim()));
  }

  const names = wildcard ? (issueWildNames.length ? issueWildNames : issueNames) : issueNames;
  return !names.length || names.includes(ca);
}
