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

const resolve = async ({name, socket, server, port}) => {
  const query = util.promisify(socket.query.bind(socket));

  const [cname, dname, caa] = await Promise.all([
    query({questions: [{name, type: "CNAME"}]}, port, server).then(parseAnswers).catch(noop),
    query({questions: [{name, type: "DNAME"}]}, port, server).then(parseAnswers).catch(noop),
    query({questions: [{name, type: "CAA"}]}, port, server).then(parseAnswers).catch(noop),
  ]);

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

  // If X is not a top-level domain, then R(X) = R(P(X))
  if (name.split(".").length > 1) {
    const parent = name.split(".").splice(1).join(".");
    return await resolve({name: parent, socket, server, port});
  } else {
    return [];
  }
};

module.exports = async (name, opts = {}) => {
  if (typeof name !== "string") {
    throw new Error("Expected a string");
  }

  // obtain server from options or system
  let server;
  if (opts.server) {
    server = opts.server;
  } else {
    const servers = require("dns").getServers();
    server = (servers && servers[0]) ? servers[0] : "8.8.8.8";
  }

  const port = opts.port || 53;

  // trim trailing dot if present
  if (name.endsWith(".")) {
    name = name.substring(0, name.length - 1);
  }

  // climb up the DNS name tree
  const socket = dnsSocket();
  const caa = await resolve({name, socket, server, port});
  socket.destroy();
  return caa || [];
};
