"use strict";

const dnsSocket = require("dns-socket");
const parseDomain = require("parse-domain");
const util = require("util");
const noop = () => {};

function isTLD(name) {
  const parsed = parseDomain(name);
  if (!parsed) return false;
  if (parsed && parsed.tld) {
    return parsed.tld === name;
  } else {
    return false;
  }
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
const resolve = async ({name, query, server, port, opts}) => {
  if (opts.ignoreTLDs && isTLD(name)) {
    return [];
  }

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
    alias = name.replace(normalize(dest.name), normalize(dest.data));
  }

  if (alias) {
    for (const record of records.CAA) {
      if (record.name === alias && record.data) {
        return [record.data];
      }
    }
    const acaa = await query({questions: [{name: alias, type: "CAA"}]}, port, server).then(parse).catch(noop);
    if (acaa && acaa.CAA && acaa.CAA.length) {
      return acaa.CAA.map(record => record.data);
    }
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
    throw new Error("Expected a string");
  }

  let server;
  if (opts.server) {
    server = opts.server;
  } else {
    const servers = require("dns").getServers();
    server = (servers && servers[0]) ? servers[0] : "8.8.8.8";
  }

  name = normalize(name);
  const socket = opts.dnsSocket || dnsSocket();
  const query = util.promisify(socket.query.bind(socket));
  const port = opts.port || 53;
  const caa = await resolve({name, query, server, port, opts});
  if (!opts.dnsSocket) socket.destroy();
  return caa || [];
};

caa.matches = async (name, ca, opts = {}) => {
  const caas = await caa(name, opts);

  if (!caas.length) {
    return true;
  }

  const names = caas.filter(caa => caa && caa.tag === "issue").map(name => normalize(name.value));

  if (names.includes(";")) {
    return false;
  }

  return !names.length || names.includes(normalize(ca));
};
