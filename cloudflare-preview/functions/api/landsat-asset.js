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
  "Access-Control-Expose-Headers": "Accept-Ranges, Content-Range, Content-Length, Content-Type, ETag, Last-Modified, X-Landsat-Upstream-Status, X-Landsat-Upstream-Content-Range, X-Landsat-Upstream-Length, X-Landsat-Upstream-Method, X-Landsat-Redirects",
  "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS"
};

function reply(body, status = 200, extra = {}) {
  return new Response(body, { status, headers: { ...common, ...extra } });
}

function isAllowedHost(hostname) {
  const host = hostname.toLowerCase();
  if (host === "landsatlook.usgs.gov" || host === "earthexplorer.usgs.gov") return true;
  // Les objets Landsat peuvent être servis depuis des URL S3 présignées par USGS.
  // N'accepte que les endpoints S3 AWS, jamais un hôte arbitraire.
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
      throw new Error("Un hôte de redirection USGS non autorisé a été bloqué.");
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
    const next = validRedirect(new URL(location, current).toString());
    if (!next) throw new Error("Destination de redirection USGS non autorisée.");
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
      let method = "HEAD";
      let result = await fetchUSGS(asset.toString(), { method: "HEAD" });
      let upstream = result.response;
      let total = upstream.status === 200
        ? validTotal(upstream.headers.get("content-length"))
        : null;

      if (!total) {
        await upstream.body?.cancel();
        method = "GET Range bytes=0-0";
        result = await fetchUSGS(asset.toString(), {
          method: "GET",
          headers: {
            "Range": "bytes=0-0",
            "Accept-Encoding": "identity",
            "Accept": "image/tiff,*/*"
          }
        });
        upstream = result.response;
        const contentRange = upstream.headers.get("content-range") || "";
        const match = /^bytes 0-0\/(\d+)$/i.exec(contentRange);
        total = upstream.status === 206 && match ? validTotal(match[1]) : null;
        await upstream.body?.cancel();
      }

      const headers = {
        ...upstreamHeaders(upstream, result.redirectCount),
        "X-Landsat-Upstream-Method": method
      };
      if (!total) {
        return reply("USGS did not provide a valid complete GeoTIFF size or returned an unsupported response.", 502, headers);
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
      : String(error?.message || error).slice(0, 200);
    return reply("Unable to retrieve Landsat raster range: " + message, 502);
  }
}
