"use strict";

const dnsSocket = require("dns-socket");

const resolve = ({name, socket, server, port}) => {
  return new Promise(resolve => {
    socket.query({questions: [{name, type: "CAA"}]}, port, server, (_, res) => {
      if (res && res.answers && res.answers.length && res.answers[0].data) {
        resolve(res.answers.map(a => a.data));
      } else {
        resolve(null);
      }
    });
  });
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
  let caa;
  const socket = dnsSocket();

  while (name && !caa) {
    try {
      caa = await resolve({name, socket, server, port});
    } catch (err) {}
    name = name.split(".").splice(1).join(".");
  }

  socket.destroy();

  return caa || null;
};
