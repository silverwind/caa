"use strict";

const dnsSocket = require("dns-socket");
const parseDomain = require("parse-domain");
const util = require("util");

const defaults = {
  ignoreTLDs: false,
  recursions: 50,
  retries: 12,
  port: 53,
  servers: [
    "8.8.8.8",
    "8.8.4.4",
  ],
};

function isTLD(name) {
  const parsed = parseDomain(name);
  if (!parsed) return false;
  if (parsed && parsed.tld) {
    return parsed.tld === name;
  } else {
    return false;
  }
}

function isWildcard(name) {
  return /\*/.test(name);
}

// normalize a DNS name
function normalize(name) {
  name = (name || "").toLowerCase();
  if (name.endsWith(".") && name.length > 1) {
    name = name.substring(0, name.length - 1);
  }
  return name;
}

function selectServer(servers, retries, tries) {
  return servers[(tries - retries) % servers.length];
}

// resolve a CAA record, possibly via recursion
const resolve = async ({name, query, servers, port, recursions, retries, tries, ignoreTLDs, isAlias, originalDomain}) => {
  name = normalize(name);

  if (!name) {
    return [];
  }

  if (ignoreTLDs && isTLD(name)) {
    return [];
  }

  if (recursions <= 0 || retries <= 0) {
    return [];
  }

  // Given a request for a specific domain X, or a request for a wildcard
  // domain *.X, the relevant record set R(X) is determined ...
  name = name.replace(/^\*\./, "");

  const server = selectServer(servers, retries, tries);

  let res;
  try {
    res = await query({questions: [{name, type: "CAA"}]}, port, server);
  } catch (err) {
    if (retries <= 0) {
      return [];
    }

    retries -= 1;
    return await resolve({name, query, servers, port, recursions, retries, tries, ignoreTLDs});
  }

  if (!res || (!res.answers && !["NXDOMAIN", "NOERROR"].includes(res.rcode))) {
    if (retries <= 0) {
      return [];
    }

    retries -= 1;
    return await resolve({name, query, servers, port, recursions, retries, tries, ignoreTLDs});
  }

  // parse DNS answers to {type: [{name, data}]}
  const records = {};
  if (res && res.answers && res.answers.length) {
    for (const answer of res.answers) {
      if (!answer.type || !answer.data) continue;
      if (!records[answer.type]) records[answer.type] = [];
      records[answer.type].push({
        name: answer.name,
        data: answer.data,
      });
    }
  }

  // If CAA(X) is not empty, R(X) = CAA (X)
  if (records.CAA && records.CAA.length) {
    const caas = records.CAA.filter(record => record.name === name).map(record => record.data);
    if (caas.length) {
      return caas;
    }
  }

  // There was a CNAME record, but CNAME did not have a CAA record set. We now need to
  // keep searching the original domain's hierarchy
  if (isAlias) {
    const parent = originalDomain.split(".").splice(1).join(".");

    retries -= 1;
    return await resolve({name: parent, query, servers, port, recursions, retries, tries, ignoreTLDs});
  }

  // If ALIAS(X) is not null, and R(A(X)) is not empty, then R(X) = R(A(X))
  let alias;

  if (records.CNAME && records.CNAME.length) {
    const dest = records.CNAME.filter(record => record.name === name)[0];
    alias = dest.data;
  } else if (records.DNAME && records.DNAME.length) {
    const dest = records.DNAME.filter(record => record.name === name)[0];
    alias = name.replace(dest.name, dest.data);
  }

  if (alias) {
    if (records.CAA && records.CAA.length) {
      for (const record of records.CAA) {
        if (record.name === alias && record.data) {
          return [record.data];
        }
      }
    }
    recursions -= 1;
    return await resolve({name: alias, query, servers, port, recursions, retries, tries, ignoreTLDs, originalDomain: name, isAlias: true});
  }

  // If X is not a top-level domain, then R(X) = R(P(X)
  if (!isTLD(name)) {
    const parent = name.split(".").splice(1).join(".");
    return await resolve({name: parent, query, servers, port, recursions, retries, tries, ignoreTLDs});
  } else {
    return [];
  }
};

const caa = module.exports = async (name, opts = {}) => {
  if (typeof name !== "string") {
    throw new Error(`Expected a string for 'name', got ${name}`);
  }

  name = normalize(name);

  if (!opts.servers) {
    const systemServers = require("dns").getServers();
    opts.servers = (systemServers && systemServers.length) ? systemServers : defaults.servers;
  }

  opts = Object.assign({}, defaults, opts);

  const socket = opts.dnsSocket || dnsSocket();
  const query = util.promisify(socket.query.bind(socket));

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
};

caa.matches = async (name, ca, opts = {}) => {
  if (typeof name !== "string") {
    throw new Error(`Expected a string for 'name', got ${name}`);
  }
  if (typeof ca !== "string") {
    throw new Error(`Expected a string for 'ca', got ${ca}`);
  }

  name = normalize(name);
  ca = normalize(ca);

  const caas = await caa(name, opts);
  if (!caas.length) {
    return true;
  }

  const issueNames = caas
    .filter(caa => caa && caa.tag === "issue")
    .map(name => normalize(name.value.split(";")[0].trim()));
  const issueWildNames = caas
    .filter(caa => caa && caa.tag === "issuewild")
    .map(name => normalize(name.value.split(";")[0].trim()));

  const names = isWildcard(name) ? (issueWildNames.length ? issueWildNames : issueNames) : issueNames;

  if (names.includes(";")) return false;
  return !names.length || names.includes(ca);
};
