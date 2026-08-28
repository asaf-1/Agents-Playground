// Who is this request from, for rate-limiting purposes.
//
// This is a small file with one large trap in it, so the whole rationale is
// here rather than spread over the call sites.
//
// A rate limiter is only as good as its key. Key it on something the caller
// chooses and it stops counting anything at all, while still looking - in code,
// in logs, in a demo - exactly like a working limiter. That is worse than no
// limiter, because nobody goes looking for a control they believe they have.
// So:
//
//   * The socket address is the default, because it is the one address the
//     caller cannot choose: it is where our TCP connection actually goes back
//     to.
//   * X-Forwarded-For is honoured only when the operator says a proxy is in
//     front (TR_TRUST_PROXY=true). Without a proxy that overwrites the header,
//     trusting it lets any caller pick their own bucket by sending a different
//     value each time.
//   * When it is honoured, we take the LAST hop, never the first. Getting that
//     backwards is the bypass: see forwardedAddress() below.

const { config } = require("./config.js");

// One shared bucket for requests whose address we cannot determine. Returning
// "" or something request-specific would let those requests escape the limiter
// entirely, and "cannot tell who this is" is precisely when we want them
// counted. A destroyed socket does this, and so does a unix-socket deployment.
const UNKNOWN_IP = "unknown";

// Long enough for an IPv6 address with a zone index, short enough that a header
// value cannot be turned into a large limiter key or a long log line.
const MAX_ADDRESS_LENGTH = 64;

// Not a full address parser, and not trying to be. The only job is to refuse
// anything that is not address-shaped, so a header cannot smuggle arbitrary
// text - newlines included - into a Map key or a log record.
const ADDRESS_PATTERN = /^[A-Za-z0-9.:%_-]+$/;

const IPV4_MAPPED_PATTERN = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i;

// Returns a usable address or "" - never a partially cleaned one, so a caller
// can treat any non-empty result as safe to use as a key.
function normalize(value) {
  const raw = typeof value === "string" ? value.trim() : "";

  if (!raw || raw.length > MAX_ADDRESS_LENGTH) return "";

  let address = raw;

  // Proxies write both "[2001:db8::1]:443" and "1.2.3.4:5678". Strip the port,
  // or one client on two source ports would count as two callers.
  if (address.startsWith("[")) {
    const close = address.indexOf("]");

    if (close > 1) address = address.slice(1, close);
  } else if (address.split(":").length === 2) {
    // Exactly one colon is host:port. Two or more is an IPv6 address, which
    // never carries a bare port without the brackets handled above.
    address = address.slice(0, address.indexOf(":"));
  }

  // Node reports an IPv4 peer on a dual-stack listener as "::ffff:1.2.3.4".
  // Folding it back means one client gets one bucket however it connected.
  const mapped = IPV4_MAPPED_PATTERN.exec(address);

  if (mapped) address = mapped[1];

  if (!address || !ADDRESS_PATTERN.test(address)) return "";

  // Lower-cased so "2001:DB8::1" and "2001:db8::1" cannot hold two separate
  // budgets against the same host. IPv4 is unaffected.
  return address.toLowerCase();
}

function socketAddress(request) {
  if (!request || typeof request !== "object") return "";

  // `connection` is the pre-Node-13 name and still turns up in hand-rolled test
  // doubles, which is exactly what calls into this module in a unit test.
  const socket = request.socket || request.connection;

  return socket ? normalize(socket.remoteAddress) : "";
}

function forwardedAddress(request) {
  const headers = request && request.headers ? request.headers : null;
  const header = headers ? headers["x-forwarded-for"] : undefined;
  // Node joins repeated X-Forwarded-For headers with ", " into one string, but
  // an array shows up in test doubles and in some HTTP/2 shims.
  const value = Array.isArray(header) ? header.join(",") : header;

  if (typeof value !== "string" || !value) return "";

  const hops = value.split(",");

  // The LAST hop, not the first.
  //
  // X-Forwarded-For is a list the client is free to start and each proxy
  // appends to. The leftmost entry is therefore whatever the client typed: an
  // attacker sends "X-Forwarded-For: 1.2.3.4", increments it every request, and
  // a limiter keyed on that entry counts nothing while appearing to count
  // everything. The rightmost entry is the one our own proxy wrote, and it is
  // the address the proxy actually accepted the connection from.
  //
  // This assumes exactly one trusted proxy in front of the app, which is what
  // TR_TRUST_PROXY means. Behind two, the rightmost entry is the inner proxy -
  // still not client-controlled, so still safe as a key, but no longer the
  // client, and such a deployment wants a configured hop count instead.
  //
  // Only that one entry is considered. Scanning leftwards for the first
  // parseable value would walk straight into the client-supplied part of the
  // list the moment a proxy wrote something we did not expect.
  return normalize(hops[hops.length - 1]);
}

function clientIp(request) {
  if (config().trustProxy) {
    const forwarded = forwardedAddress(request);

    // Falling through on an unusable header rather than failing: a request that
    // reached us without the proxy's header still has a socket address, and
    // that address is the stricter key of the two.
    if (forwarded) return forwarded;
  }

  return socketAddress(request) || UNKNOWN_IP;
}

module.exports = { clientIp, UNKNOWN_IP };
