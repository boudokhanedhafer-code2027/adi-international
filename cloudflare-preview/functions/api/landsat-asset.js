// Cloudflare Pages Function — relais HTTP Range borné pour les GeoTIFF Landsat USGS.
// Les redirections sont suivies manuellement et uniquement vers des hôtes USGS/AWS S3 autorisés.
const MAX_RANGE_BYTES = 3 * 1024 * 1024;
const TIMEOUT_MS = 25000;
const MAX_REDIRECTS = 4;

const common = {
  "Accept-Ranges": "bytes",
  "Cache-Control": "no-store",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Range, Content-Type",
  "Access-Control-Expose-Headers": "Accept-Ranges, Content-Range, Content-Length, Content-Type, ETag, Last-Modified, X-Landsat-Upstream-Status, X-Landsat-Upstream-Content-Range, X-Landsat-Upstream-Length, X-Landsat-Upstream-Method, X-Landsat-Redirects, X-Landsat-Relay-Error, X-Landsat-TIFF-Signature",
  "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS"
};

function reply(body, status = 200, extra = {}) {
  return new Response(body, { status, headers: { ...common, ...extra } });
}

function isAllowedHost(hostname) {
  const host = hostname.toLowerCase();
  if (host === "landsatlook.usgs.gov" || host === "earthexplorer.usgs.gov" || host === "ers.cr.usgs.gov") return true;
  if (/^[a-z0-9][a-z0-9.-]*\.s3\.amazonaws\.com$/.test(host)) return true;
  if (/^[a-z0-9][a-z0-9.-]*\.s3\.[a-z0-9-]+\.amazonaws\.com$/.test(host)) return true;
  return false;
}

function validAsset(value) {
  let url;
  try { url = new URL(value || ""); } catch { return null; }
  const allowed = url.protocol === "https:" &&
    url.hostname === "landsatlook.usgs.gov" &&
    !url.port && !url.username && !url.password &&
    url.pathname.startsWith("/data/collection02/level-2/standard/oli-tirs/") &&
    url.pathname.toUpperCase().endsWith(".TIF");
  return allowed ? url : null;
}

function validRedirect(value) {
  let url;
  try { url = new URL(value); } catch { return null; }
  if (url.protocol !== "https:" || url.port || url.username || url.password ||
      !isAllowedHost(url.hostname)) return null;
  return url;
}

function parseRange(value) {
  const match = /^bytes=(\d+)-(\d*)$/.exec(value || "");
  if (!match) return null;
  const start = Number(match[1]);
  const requestedEnd = match[2] === "" ? null : Number(match[2]);
  if (!Number.isSafeInteger(start) || start < 0 ||
      start > Number.MAX_SAFE_INTEGER - MAX_RANGE_BYTES) return null;
  if (requestedEnd !== null &&
      (!Number.isSafeInteger(requestedEnd) || requestedEnd < start)) return null;
  if (requestedEnd !== null && requestedEnd - start + 1 > MAX_RANGE_BYTES) {
    return { tooLarge: true };
  }
  const end = requestedEnd === null
    ? start + MAX_RANGE_BYTES - 1
    : requestedEnd;
  return { start, end };
}

async function readBounded(body, limit) {
  if (!body) return new Uint8Array();
  const reader = body.getReader();
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > limit) {
        await reader.cancel("Range response exceeds configured limit");
        throw new Error("Range response too large");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const result = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}

function upstreamHeaders(response, redirectCount = 0) {
  const out = {
    "X-Landsat-Upstream-Status": String(response.status),
    "X-Landsat-Upstream-Content-Range": response.headers.get("content-range") || "absent",
    "X-Landsat-Upstream-Length": response.headers.get("content-length") || "absent",
    "X-Landsat-Redirects": String(redirectCount)
  };
  for (const name of ["accept-ranges", "content-type", "etag", "last-modified"]) {
    const value = response.headers.get(name);
    if (value) out[name] = value;
  }
  return out;
}

async function readPrefix(body, limit) {
  if (!body) return new Uint8Array();
  const reader = body.getReader();
  const chunks = [];
  let total = 0;
  try {
    while (total < limit) {
      const { done, value } = await reader.read();
      if (done) break;
      const take = Math.min(value.byteLength, limit - total);
      chunks.push(value.slice(0, take));
      total += take;
      if (take < value.byteLength || total >= limit) {
        await reader.cancel("TIFF header prefix read");
        break;
      }
    }
  } finally {
    reader.releaseLock();
  }
  const result = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}

function tiffSignature(bytes) {
  if (!bytes || bytes.length < 4) return false;
  const classicLE = bytes[0] === 0x49 && bytes[1] === 0x49 &&
    bytes[2] === 0x2a && bytes[3] === 0x00;
  const classicBE = bytes[0] === 0x4d && bytes[1] === 0x4d &&
    bytes[2] === 0x00 && bytes[3] === 0x2a;
  const bigLE = bytes[0] === 0x49 && bytes[1] === 0x49 &&
    bytes[2] === 0x2b && bytes[3] === 0x00;
  const bigBE = bytes[0] === 0x4d && bytes[1] === 0x4d &&
    bytes[2] === 0x00 && bytes[3] === 0x2b;
  return classicLE || classicBE || bigLE || bigBE;
}

function prefixHex(bytes) {
  return Array.from(bytes || []).slice(0, 8)
    .map(value => value.toString(16).padStart(2, "0")).join(" ");
}

function validTotal(value) {
  if (!value || !/^\d+$/.test(value)) return null;
  const total = Number(value);
  return Number.isSafeInteger(total) && total > 0 ? String(total) : null;
}

// Suit les redirections une par une. Chaque destination est validée avant toute requête.
async function fetchUSGS(initialUrl, options) {
  let current = new URL(initialUrl);
  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects++) {
    if (!isAllowedHost(current.hostname) || current.protocol !== "https:" ||
        current.port || current.username || current.password) {
      throw new Error("Un hôte de redirection USGS non autorisé a été bloqué (hôte: " + current.hostname.toLowerCase() + ").");
    }
    const response = await fetch(current.toString(), {
      ...options,
      redirect: "manual",
      signal: AbortSignal.timeout(TIMEOUT_MS)
    });
    if (![301, 302, 303, 307, 308].includes(response.status)) {
      return { response, redirectCount: redirects };
    }
    const location = response.headers.get("location");
    await response.body?.cancel();
    if (!location) throw new Error("Redirection USGS sans en-tête Location.");
    if (redirects === MAX_REDIRECTS) throw new Error("Trop de redirections USGS.");
    const destination = new URL(location, current);
    const next = validRedirect(destination.toString());
    if (!next) {
      throw new Error("Destination de redirection USGS non autorisée (hôte: " +
        destination.hostname.toLowerCase() + ").");
    }
    current = next;
  }
  throw new Error("Redirection USGS impossible.");
}

export async function onRequest({ request }) {
  if (request.method === "OPTIONS") return reply(null, 204);
  if (!["GET", "HEAD"].includes(request.method)) {
    return reply("Method not allowed", 405);
  }

  const asset = validAsset(new URL(request.url).searchParams.get("url"));
  if (!asset) return reply("Asset URL not allowed", 403);

  try {
    if (request.method === "HEAD") {
      // Vérifie réellement le contenu : HEAD et Content-Length seuls ne prouvent pas un GeoTIFF.
      const method = "GET Range bytes=0-15";
      const result = await fetchUSGS(asset.toString(), {
        method: "GET",
        headers: {
          "Range": "bytes=0-15",
          "Accept-Encoding": "identity",
          "Accept": "image/tiff,*/*"
        }
      });
      const upstream = result.response;
      const headers = {
        ...upstreamHeaders(upstream, result.redirectCount),
        "X-Landsat-Upstream-Method": method
      };

      const prefix = await readPrefix(upstream.body, 16);
      headers["X-Landsat-TIFF-Signature"] = prefixHex(prefix) || "unavailable";

      const contentRange = upstream.headers.get("content-range") || "";
      const match = /^bytes 0-15\/(\d+)$/i.exec(contentRange);
      const total = match ? validTotal(match[1]) : null;
      const isPartial = upstream.status === 206;
      const hasExactPrefix = prefix.byteLength === 16;
      const isTiff = tiffSignature(prefix);

      if (!isPartial || !total || !hasExactPrefix || !isTiff) {
        const contentType = upstream.headers.get("content-type") || "absent";
        const reason = !isPartial
          ? "USGS n'a pas respecté Range : HTTP " + upstream.status
          : !total
            ? "Content-Range absent ou invalide"
            : !hasExactPrefix
              ? "En-tête raster incomplet (" + prefix.byteLength + "/16 octets)"
              : "Signature TIFF absente";
        const detail = reason + "; Content-Type=" + contentType +
          "; début=" + (headers["X-Landsat-TIFF-Signature"] || "unavailable");
        headers["X-Landsat-Relay-Error"] = detail;
        return reply("Réponse USGS non validée comme GeoTIFF : " + detail, 502, headers);
      }

      headers["Content-Length"] = total;
      return reply(null, 200, headers);
    }

    const range = parseRange(request.headers.get("Range"));
    if (!range) return reply("A single valid byte Range header is required", 416);
    if (range.tooLarge) return reply("Requested byte range exceeds the 3 MiB limit", 413);

    const result = await fetchUSGS(asset.toString(), {
      method: "GET",
      headers: {
        "Range": "bytes=" + range.start + "-" + range.end,
        "Accept-Encoding": "identity",
        "Accept": "image/tiff,*/*"
      }
    });
    const upstream = result.response;
    const headers = upstreamHeaders(upstream, result.redirectCount);
    headers["X-Landsat-Upstream-Method"] = "GET Range";

    if (upstream.status !== 206) {
      await upstream.body?.cancel();
      return reply(
        "USGS did not return partial content (expected HTTP 206); upstream HTTP " + upstream.status,
        502,
        headers
      );
    }

    const contentRange = upstream.headers.get("content-range") || "";
    const match = /^bytes (\d+)-(\d+)\/(\d+)$/i.exec(contentRange);
    if (!match) {
      await upstream.body?.cancel();
      return reply("USGS returned an invalid Content-Range header.", 502, headers);
    }

    const actualStart = Number(match[1]);
    const actualEnd = Number(match[2]);
    const totalSize = Number(match[3]);
    const expectedEnd = Number.isSafeInteger(totalSize) && totalSize > 0
      ? Math.min(range.end, totalSize - 1)
      : -1;

    if (!Number.isSafeInteger(actualStart) ||
        !Number.isSafeInteger(actualEnd) ||
        !Number.isSafeInteger(totalSize) ||
        actualStart !== range.start ||
        actualEnd !== expectedEnd ||
        actualEnd < actualStart ||
        actualEnd >= totalSize ||
        actualEnd - actualStart + 1 > MAX_RANGE_BYTES) {
      await upstream.body?.cancel();
      return reply("USGS Content-Range does not match the requested byte range.", 502, headers);
    }

    const body = await readBounded(upstream.body, MAX_RANGE_BYTES);
    if (body.byteLength !== actualEnd - actualStart + 1) {
      return reply("USGS response length does not match Content-Range.", 502, headers);
    }

    headers["Content-Range"] = contentRange;
    headers["Content-Length"] = String(body.byteLength);
    return reply(body, 206, headers);
  } catch (error) {
    const message = error?.name === "TimeoutError"
      ? "USGS request timed out."
      : String(error?.message || error).replace(/[\r\n]+/g, " ").slice(0, 200);
    return reply("Unable to retrieve Landsat raster range: " + message, 502, {
      "X-Landsat-Upstream-Status": "unavailable",
      "X-Landsat-Upstream-Content-Range": "absent",
      "X-Landsat-Upstream-Length": "absent",
      "X-Landsat-Upstream-Method": request.method,
      "X-Landsat-Relay-Error": message
    });
  }
}