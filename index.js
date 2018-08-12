"use strict";

const dnsSocket = require("dns-socket");
const util = require("util");
const noop = () => {};

// map answer to {type: [data]}
function parseAnswers(res) {
  const types = {};
  if (!res || !res.answers) return null;
  for (const answer of res.answers) {
    if (!answer.type || !answer.data) return;
    if (!types[answer.type]) types[answer.type] = [];
    types[answer.type].push(answer.data);
  }
  return Object.keys(types).length ? types : null;
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
  if (opts.ignoreRoot && name.split(".").length === 1) {
    return [];
  }

  const todo = [
    query({questions: [{name, type: "CAA"}]}, port, server).then(parseAnswers).catch(noop)
  ];

  if (!opts.ignoreCNAME) {
    todo.push(query({questions: [{name, type: "CNAME"}]}, port, server).then(parseAnswers).catch(noop));
  }

  if (!opts.ignoreDNAME) {
    todo.push(query({questions: [{name, type: "DNAME"}]}, port, server).then(parseAnswers).catch(noop));
  }

  const res = await Promise.all(todo);

  const caa = res[0];
  let cname, dname;
  if (!opts.ignoreCNAME && !opts.ignoreDNAME) {
    cname = res[1];
    dname = res[2];
  } else if (opts.ignoreCNAME && !opts.ignoreDNAME) {
    dname = res[1];
  } else if (opts.ignoreDNAME && !opts.ignoreCNAME) {
    cname = res[2];
  }

  // If CAA(X) is not empty, R(X) = CAA (X)
  let alias;
  if (caa && caa.CAA && caa.CAA.length) {
    return caa.CAA;
  } else if (cname && cname.CNAME.length) {
    alias = cname.CNAME[0];
  } else if (dname && dname.DNAME.length) {
    alias = dname.DNAME[0];
  }

  // If ALIAS(X) is not null, and R(A(X)) is not empty, then R(X) = R(A(X))
  if (alias) {
    const acaa = await query({questions: [{name: alias, type: "CAA"}]}, port, server).then(parseAnswers).catch(noop);
    if (acaa && acaa.CAA && acaa.CAA.length) {
      return acaa.CAA;
    }
  }

  // If X is not a top-level domain, then R(X) = R(P(X)
  const parts = name.split(".");
  if (parts.length > 1) {
    const parent = parts.splice(1).join(".");
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
  const socket = dnsSocket();
  const query = util.promisify(socket.query.bind(socket));
  const port = opts.port || 53;
  const caa = await resolve({name, query, server, port, opts});
  socket.destroy();
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
