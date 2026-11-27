// Netlify Function: proxy HTTP Range strict pour les GeoTIFF COG Landsat USGS.
// Seules les ressources TIFF du dépôt public Landsat Collection 2 Level-2 sont autorisées.
exports.handler = async (event) => {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Range, Content-Type",
    "Access-Control-Expose-Headers": "Accept-Ranges, Content-Range, Content-Length, Content-Type",
    "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
    "Cache-Control": "public, max-age=3600"
  };
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers, body: "" };
  if (!["GET", "HEAD"].includes(event.httpMethod)) return { statusCode: 405, headers, body: "Method not allowed" };
  const target = event.queryStringParameters?.url;
  let parsed;
  try { parsed = new URL(target || ""); } catch { return { statusCode: 400, headers, body: "Invalid asset URL" }; }
  const allowed = parsed.protocol === "https:" &&
    parsed.hostname === "landsatlook.usgs.gov" &&
    parsed.pathname.startsWith("/data/collection02/level-2/standard/oli-tirs/") &&
    parsed.pathname.toUpperCase().endsWith(".TIF");
  if (!allowed) return { statusCode: 403, headers, body: "Asset URL not allowed" };
  const range = event.headers?.range || event.headers?.Range;
  if (event.httpMethod === "GET" && (!range || !/^bytes=\\d+-\\d*$/.test(range))) {
    return { statusCode: 416, headers, body: "A valid byte Range header is required" };
  }
  try {
    const upstream = await fetch(parsed.toString(), { method: event.httpMethod, headers: range ? { Range: range } : {} });
    const outHeaders = { ...headers };
    for (const name of ["accept-ranges", "content-range", "content-length", "content-type", "etag", "last-modified"]) {
      const value = upstream.headers.get(name);
      if (value) outHeaders[name] = value;
    }
    if (event.httpMethod === "HEAD") return { statusCode: upstream.status, headers: outHeaders, body: "" };
    if (![206, 200].includes(upstream.status)) return { statusCode: upstream.status, headers: outHeaders, body: "Upstream asset request failed" };
    const buffer = Buffer.from(await upstream.arrayBuffer());
    if (buffer.length > 5 * 1024 * 1024) return { statusCode: 413, headers, body: "Range response too large" };
    return { statusCode: upstream.status, headers: outHeaders, body: buffer.toString("base64"), isBase64Encoded: true };
  } catch {
    return { statusCode: 502, headers, body: "Unable to retrieve Landsat raster range" };
  }
};
