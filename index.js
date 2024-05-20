import {getServers} from "node:dns";
import {promisify} from "node:util";
import dnsSocket from "dns-socket";
import tlds from "tlds" with { type: 'json' };

const defaults = {
  ignoreTLDs: false,
  recursions: 50,
  retries: 12,
  port: 53,
  servers: ["8.8.8.8", "8.8.4.4"], // these are only used as fallback to system's servers
  dnsSocket: undefined,
};

const tldSet = new Set(tlds);
const isTLD = name => tldSet.has(name);
const isWildcard = name => /\*/.test(name);
const parent = name => name.split(".").splice(1).join(".");
const selectServer = (servers, retries, tries) => servers[(tries - retries) % servers.length];

function normalizeName(name = "") {
  name = name.toLowerCase();
  return (name.endsWith(".") && name.length > 1) ? name.substring(0, name.length - 1) : name;
}

// resolve a CAA record, possibly via recursion
const resolve = async ({name, query, servers, port, recursions, retries, tries, ignoreTLDs}) => {
  name = normalizeName(name);
  if (!name) return [];
  if (ignoreTLDs && isTLD(name)) return [];
  if (recursions <= 0 || retries <= 0) return [];

  // Given a request for a specific domain X, or a request for a wildcard
  // domain *.X, the relevant record set R(X) is determined ...
  name = name.replace(/^\*\./, "");

  let res;
  try {
    res = await query({questions: [{name, type: "CAA"}]}, port, selectServer(servers, retries, tries));
  } catch {
    if (retries <= 0) return [];
    retries -= 1;
    return await resolve({name, query, servers, port, recursions, retries, tries, ignoreTLDs});
  }

  if (!res || (!res.answers && !["NXDOMAIN", "NOERROR"].includes(res.rcode))) {
    if (retries <= 0) return [];
    retries -= 1;
    return await resolve({name, query, servers, port, recursions, retries, tries, ignoreTLDs});
  }

  // parse DNS answers to {type: [{name, data}]}
  const records = {};
  if (res?.answers?.length) {
    for (const {name, type, data} of res.answers || {}) {
      if (!name || !type || !data) continue;
      if (!records[type]) records[type] = [];
      records[type].push({name, data});
    }
  }

  // If CAA(X) is not empty, R(X) = CAA (X)
  if (records.CAA?.length) {
    const caas = records.CAA.filter(record => record.name === name).map(record => record.data);
    if (caas.length) return caas;
  }

  let alias;
  if (records.CNAME?.length) {
    const dest = records.CNAME.find(record => record.name === name);
    alias = dest.data;
  } else if (records.DNAME?.length) {
    const dest = records.DNAME.find(record => record.name === name);
    alias = name.replace(dest.name, dest.data);
  }

  // If A(X) is not null, and CAA(A(X)) is not empty, then R(X) = CAA(A(X)), otherwise
  if (alias && records.CAA?.length) {
    return records.CAA.filter(record => record.name === alias && record.data).map(record => record.data);
  }

  // If X is not a top-level domain, then R(X) = R(P(X)
  if (!isTLD(name)) {
    recursions -= 1;
    return await resolve({name: parent(name), query, servers, port, recursions, retries, tries, ignoreTLDs});
  } else {
    return [];
  }
};

export async function caa(name, opts = {}) {
  if (typeof name !== "string") throw new Error(`Expected a string for 'name', got ${name}`);
  name = normalizeName(name);

  if (!opts.servers) {
    const systemServers = getServers();
    opts.servers = systemServers?.length ? systemServers : defaults.servers;
  }

  opts = {...defaults, ...opts};

  const socket = opts.dnsSocket || dnsSocket();
  const query = promisify(socket.query.bind(socket));

  const caa = await resolve({
    name, query,
    servers: opts.servers,
    port: opts.port,
    recursions: opts.recursions,
    retries: opts.retries,
    tries: opts.retries,
    ignoreTLDs: opts.ignoreTLDs,
  });

  if (!opts.dnsSocket) socket.destroy();
  return caa || [];
}

export async function caaMatches(name, ca, opts = {}) {
  if (typeof name !== "string") throw new Error(`Expected a string for 'name', got ${name}`);
  if (typeof ca !== "string") throw new Error(`Expected a string for 'ca', got ${ca}`);

  name = normalizeName(name);
  ca = normalizeName(ca);

  const caas = await caa(name, opts);
  if (!caas.length) return true;

  const issueNames = caas
    .filter(caa => caa?.tag === "issue")
    .map(name => normalizeName(name.value.split(";")[0].trim()));
  const issueWildNames = caas
    .filter(caa => caa?.tag === "issuewild")
    .map(name => normalizeName(name.value.split(";")[0].trim()));

  const names = isWildcard(name) ? (issueWildNames.length ? issueWildNames : issueNames) : issueNames;

  if (names.includes(";")) return false;
  return !names.length || names.includes(ca);
}
