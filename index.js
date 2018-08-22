"use strict";

const dnsSocket = require("dns-socket");
const parseDomain = require("parse-domain");
const util = require("util");
const noop = () => {};

const MAX_RECURSION = 50;

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

// parse DNS answers to {type: [{name, data}]}
function parse(res) {
  const types = {};
  if (res && res.answers && res.answers.length) {
    for (const answer of res.answers) {
      if (!answer.type || !answer.data) continue;
      if (!types[answer.type]) types[answer.type] = [];
      types[answer.type].push({
        name: answer.name,
        data: answer.data,
      });
    }
  }
  return types;
}

// normalize a DNS name
function normalize(name) {
  name = (name || "").toLowerCase();
  if (name.endsWith(".") && name.length > 1) {
    name = name.substring(0, name.length - 1);
  }
  return name;
}

// resolve a CAA record, possibly via recursion
const resolve = async ({name, query, server, port, recursion = MAX_RECURSION, opts}) => {
  name = normalize(name);

  if (!name) {
    return [];
  }

  if (opts.ignoreTLDs && isTLD(name)) {
    return [];
  }

  if (recursion < 0) {
    return [];
  }

  // Given a request for a specific domain X, or a request for a wildcard
  // domain *.X, the relevant record set R(X) is determined ...
  name = name.replace(/^\*\./, "");

  const records = parse(await query({questions: [{name, type: "CAA"}]}, port, server).catch(noop));

  // If CAA(X) is not empty, R(X) = CAA (X)
  if (records.CAA && records.CAA.length) {
    const caas = records.CAA.filter(record => record.name === name).map(record => record.data);
    if (caas.length) {
      return caas;
    }
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
    recursion -= 1;
    return await resolve({name: alias, query, server, port, recursion, opts});
  }

  // If X is not a top-level domain, then R(X) = R(P(X)
  if (!isTLD(name)) {
    const parent = name.split(".").splice(1).join(".");
    return await resolve({name: parent, query, server, port, opts});
  } else {
    return [];
  }
};

const caa = module.exports = async (name, opts = {}) => {
  if (typeof name !== "string") {
    throw new Error(`Expected a string for 'name', got ${name}`);
  }

  name = normalize(name);

  let server;
  if (opts.server) {
    server = opts.server;
  } else {
    const servers = require("dns").getServers();
    server = (servers && servers[0]) ? servers[0] : "8.8.8.8";
  }

  const socket = opts.dnsSocket || dnsSocket();
  const query = util.promisify(socket.query.bind(socket));
  const port = opts.port || 53;
  const caa = await resolve({name, query, server, port, opts});
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

  const issueNames = caas.filter(caa => caa && caa.tag === "issue").map(name => normalize(name.value));
  const issueWildNames = caas.filter(caa => caa && caa.tag === "issuewild").map(name => normalize(name.value));
  const names = isWildcard(name) ? (issueWildNames.length ? issueWildNames : issueNames) : issueNames;

  if (names.includes(";")) return false;
  return !names.length || names.includes(ca);
};
