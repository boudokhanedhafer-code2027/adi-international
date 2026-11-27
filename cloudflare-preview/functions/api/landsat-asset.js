// Cloudflare Pages Function — relais HTTP Range borné pour les GeoTIFF Landsat USGS.
const MAX_RANGE_BYTES = 3 * 1024 * 1024;
const TIMEOUT_MS = 25000;

const common = {
  "Accept-Ranges": "bytes",
  "Cache-Control": "no-store",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Range, Content-Type",
  "Access-Control-Expose-Headers": "Accept-Ranges, Content-Range, Content-Length, Content-Type, ETag, Last-Modified, X-Landsat-Upstream-Status, X-Landsat-Upstream-Content-Range, X-Landsat-Upstream-Length, X-Landsat-Upstream-Method",
  "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS"
};

function reply(body, status = 200, extra = {}) {
  return new Response(body, { status, headers: { ...common, ...extra } });
}

function validAsset(value) {
  let url;
  try { url = new URL(value || ""); } catch { return null; }
  const allowed = url.protocol === "https:" &&
    url.hostname === "landsatlook.usgs.gov" &&
    !url.username && !url.password &&
    url.pathname.startsWith("/data/collection02/level-2/standard/oli-tirs/") &&
    url.pathname.toUpperCase().endsWith(".TIF");
  return allowed ? url : null;
}

function parseRange(value) {
  const match = /^bytes=(\d+)-(\d*)$/.exec(value || "");
  if (!match) return null;
  const start = Number(match[1]);
  const requestedEnd = match[2] === "" ? null : Number(match[2]);
  if (!Number.isSafeInteger(start) || start < 0) return null;
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

function upstreamHeaders(response) {
  const out = {
    "X-Landsat-Upstream-Status": String(response.status),
    "X-Landsat-Upstream-Content-Range": response.headers.get("content-range") || "absent",
    "X-Landsat-Upstream-Length": response.headers.get("content-length") || "absent"
  };
  for (const name of ["accept-ranges", "content-type", "etag", "last-modified"]) {
    const value = response.headers.get(name);
    if (value) out[name] = value;
  }
  return out;
}

export async function onRequest({ request }) {
  if (request.method === "OPTIONS") return reply(null, 204);
  if (!["GET", "HEAD"].includes(request.method)) {
    return reply("Method not allowed", 405);
  }

  const asset = validAsset(new URL(request.url).searchParams.get("url"));
  if (!asset) return reply("Asset URL not allowed", 403);

  const controllerSignal = AbortSignal.timeout(TIMEOUT_MS);

  try {
    if (request.method === "HEAD") {
      let method = "HEAD";
      let upstream = await fetch(asset.toString(), {
        method: "HEAD",
        signal: controllerSignal
      });

      let total = upstream.status === 200
        ? upstream.headers.get("content-length")
        : null;

      if (!total) {
        method = "GET Range bytes=0-0";
        upstream = await fetch(asset.toString(), {
          method: "GET",
          headers: { "Range": "bytes=0-0", "Accept-Encoding": "identity", "Accept": "image/tiff,*/*" },
          signal: controllerSignal
        });
        const contentRange = upstream.headers.get("content-range") || "";
        const match = /^bytes 0-0\/(\d+)$/i.exec(contentRange);
        total = upstream.status === 206 && match ? match[1] : null;
        await upstream.body?.cancel();
      }

      const headers = {
        ...upstreamHeaders(upstream),
        "X-Landsat-Upstream-Method": method
      };
      if (!total || !/^\d+$/.test(total)) {
        return reply("USGS did not provide a valid complete GeoTIFF size.", 502, headers);
      }
      headers["Content-Length"] = total;
      return reply(null, 200, headers);
    }

    const range = parseRange(request.headers.get("Range"));
    if (!range) return reply("A single valid byte Range header is required", 416);
    if (range.tooLarge) return reply("Requested byte range exceeds the 3 MiB limit", 413);

    const upstream = await fetch(asset.toString(), {
      method: "GET",
      headers: {
        "Range": "bytes=" + range.start + "-" + range.end,
        "Accept-Encoding": "identity",
        "Accept": "image/tiff,*/*"
      },
      signal: controllerSignal
    });

    const headers = upstreamHeaders(upstream);
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
    if (!Number.isSafeInteger(actualStart) ||
        !Number.isSafeInteger(actualEnd) ||
        !Number.isSafeInteger(totalSize) ||
        actualStart !== range.start ||
        actualEnd < actualStart ||
        actualEnd > range.end ||
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
