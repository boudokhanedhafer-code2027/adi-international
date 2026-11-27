// Netlify Function: proxy HTTP Range pour les GeoTIFF COG Landsat USGS.
const PROXY_VERSION = "2026-11-27-range-fix-1";

exports.handler = async (event) => {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Range, Content-Type",
    "Access-Control-Expose-Headers": "Accept-Ranges, Content-Range, Content-Length, Content-Type, ETag, X-Landsat-Upstream-Status, X-Landsat-Upstream-Content-Range, X-Landsat-Upstream-Length, X-Landsat-Upstream-Method, X-Landsat-Proxy-Version",
    "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
    "Accept-Ranges": "bytes",
    "Cache-Control": "no-store",
    "X-Landsat-Proxy-Version": PROXY_VERSION
  };
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers, body: "" };
  if (!["GET", "HEAD"].includes(event.httpMethod)) return { statusCode: 405, headers, body: "Method not allowed" };

  const target = event.queryStringParameters?.url;
  let parsed;
  try { parsed = new URL(target || ""); }
  catch { return { statusCode: 400, headers, body: "Invalid asset URL" }; }

  const allowed = parsed.protocol === "https:" &&
    parsed.hostname === "landsatlook.usgs.gov" &&
    parsed.pathname.startsWith("/data/collection02/level-2/standard/oli-tirs/") &&
    parsed.pathname.toUpperCase().endsWith(".TIF");
  if (!allowed) return { statusCode: 403, headers, body: "Asset URL not allowed" };

  const range = event.headers?.range || event.headers?.Range;
  if (event.httpMethod === "GET" && (!range || !/^bytes=\d+-\d*$/.test(range))) {
    return { statusCode: 416, headers, body: "A valid byte Range header is required" };
  }

  try {
    if (event.httpMethod === "HEAD") {
      let upstreamMethod = "HEAD";
      let upstream = await fetch(parsed.toString(), { method: "HEAD" });
      let total = null;
      let contentRange = upstream.headers.get("content-range") || "";

      // A HEAD response is usable only when it supplies the complete object size.
      if (upstream.status === 200 && upstream.headers.get("content-length")) {
        total = upstream.headers.get("content-length");
      } else {
        // Some object gateways reject HEAD. Probe a small byte range and read
        // the total size only from Content-Range, never from the partial length.
        upstreamMethod = "GET Range bytes=0-16383";
        upstream = await fetch(parsed.toString(), {
          method: "GET",
          headers: { Range: "bytes=0-16383", "Accept-Encoding": "identity", Accept: "image/tiff,*/*" }
        });
        contentRange = upstream.headers.get("content-range") || "";
        total = contentRange.match(/^bytes\s+\d+-\d+\/(\d+)$/i)?.[1] ||
                contentRange.match(/^bytes\s+\*\/(\d+)$/i)?.[1] || null;

        if (upstream.status !== 206 && upstream.status !== 416) {
          const out = { ...headers,
            "x-landsat-upstream-status": String(upstream.status),
            "x-landsat-upstream-content-range": contentRange || "absent",
            "x-landsat-upstream-length": upstream.headers.get("content-length") || "absent",
            "x-landsat-upstream-method": upstreamMethod
          };
          await upstream.body?.cancel();
          return { statusCode: 502, headers: out, body: "USGS metadata probe failed; HTTP " + upstream.status };
        }

        // Retry the smallest legal range for gateways that reject larger probes.
        if (!total && upstream.status === 416) {
          await upstream.body?.cancel();
          upstreamMethod = "GET Range bytes=0-0";
          upstream = await fetch(parsed.toString(), {
            method: "GET",
            headers: { Range: "bytes=0-0", "Accept-Encoding": "identity", Accept: "image/tiff,*/*" }
          });
          contentRange = upstream.headers.get("content-range") || "";
          total = contentRange.match(/^bytes\s+\d+-\d+\/(\d+)$/i)?.[1] ||
                  contentRange.match(/^bytes\s+\*\/(\d+)$/i)?.[1] || null;
        }
        await upstream.body?.cancel();
      }

      const out = { ...headers,
        "x-landsat-upstream-status": String(upstream.status),
        "x-landsat-upstream-content-range": contentRange || "absent",
        "x-landsat-upstream-length": upstream.headers.get("content-length") || "absent",
        "x-landsat-upstream-method": upstreamMethod
      };
      for (const name of ["accept-ranges", "content-type", "etag", "last-modified"]) {
        const value = upstream.headers.get(name);
        if (value) out[name] = value;
      }
      if (total) {
        out["content-length"] = total;
        return { statusCode: 200, headers: out, body: "" };
      }
      return {
        statusCode: 502,
        headers: out,
        body: "USGS did not provide the complete GeoTIFF size in Content-Length or Content-Range."
      };
    }

    const upstream = await fetch(parsed.toString(), {
      method: "GET",
      headers: { Range: range, "Accept-Encoding": "identity", Accept: "image/tiff,*/*" }
    });
    const outHeaders = { ...headers };
    for (const name of ["accept-ranges", "content-range", "content-length", "content-type", "etag", "last-modified"]) {
      const value = upstream.headers.get(name);
      if (value) outHeaders[name] = value;
    }
    if (upstream.status !== 206) {
      const detail = "USGS did not return partial content (expected HTTP 206); upstream HTTP " + upstream.status +
        "; Content-Range: " + (upstream.headers.get("content-range") || "absent");
      await upstream.body?.cancel();
      return { statusCode: upstream.status === 416 ? 502 : upstream.status, headers: outHeaders, body: detail };
    }

    const buffer = Buffer.from(await upstream.arrayBuffer());
    if (buffer.length > 5 * 1024 * 1024) {
      return { statusCode: 413, headers: outHeaders, body: "Range response too large" };
    }
    return { statusCode: 206, headers: outHeaders, body: buffer.toString("base64"), isBase64Encoded: true };
  } catch (error) {
    return {
      statusCode: 502,
      headers,
      body: "Unable to retrieve Landsat raster range: " + String(error?.message || error).slice(0, 240)
    };
  }
};
