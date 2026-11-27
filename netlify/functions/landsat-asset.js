// Netlify Function: proxy HTTP Range pour les GeoTIFF COG Landsat USGS.
exports.handler = async (event) => {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Range, Content-Type",
    "Access-Control-Expose-Headers": "Accept-Ranges, Content-Range, Content-Length, Content-Type, ETag",
    "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
    "Accept-Ranges": "bytes",
    "Cache-Control": "public, max-age=3600"
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
    // GeoTIFF.js demande la taille du fichier avant les plages de lecture.
    // Certains serveurs répondent 416 à HEAD ou au Range initial, avec la taille
    // totale dans Content-Range: bytes */TAILLE. On récupère cette taille si disponible.
    if (event.httpMethod === "HEAD") {
      let upstream = await fetch(parsed.toString(), { method: "HEAD" });
      if (!upstream.ok || !upstream.headers.get("content-length")) {
        upstream = await fetch(parsed.toString(), { method: "GET", headers: { Range: "bytes=0-0" } });
      }

      const out = { ...headers };
      for (const name of ["accept-ranges", "content-type", "etag", "last-modified"]) {
        const value = upstream.headers.get(name);
        if (value) out[name] = value;
      }
      const contentRange = upstream.headers.get("content-range") || "";
      out["x-landsat-upstream-status"] = String(upstream.status);
      out["x-landsat-upstream-content-range"] = contentRange || "absent";
      out["x-landsat-upstream-length"] = upstream.headers.get("content-length") || "absent";
      const total = contentRange.match(/\\/(\\d+)$/)?.[1] ||
                    contentRange.match(/^bytes \\*\\/(\\d+)$/i)?.[1];
      const length = total || upstream.headers.get("content-length");
      if (length) out["content-length"] = length;
      if (contentRange) out["content-range"] = contentRange;

      if (upstream.status === 416 && length) {
        return { statusCode: 200, headers: out, body: "" };
      }
      if (!upstream.ok && upstream.status !== 206) {
        return {
          statusCode: upstream.status,
          headers: out,
          body: "USGS HEAD/range metadata failed; upstream status " + upstream.status +
                "; Content-Range: " + (contentRange || "absent")
        };
      }
      return { statusCode: 200, headers: out, body: "" };
    }

    const upstream = await fetch(parsed.toString(), {
      method: "GET",
      headers: { Range: range, Accept: "image/tiff,*/*" }
    });
    const outHeaders = { ...headers };
    for (const name of ["accept-ranges", "content-range", "content-length", "content-type", "etag", "last-modified"]) {
      const value = upstream.headers.get(name);
      if (value) outHeaders[name] = value;
    }
    if (upstream.status !== 206) {
      return {
        statusCode: upstream.status,
        headers: outHeaders,
        body: "USGS did not return partial content (expected HTTP 206)"
      };
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
