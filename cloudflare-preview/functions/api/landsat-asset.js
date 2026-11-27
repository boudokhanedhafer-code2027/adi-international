// Cloudflare Pages Function — proxy HTTP Range limité aux GeoTIFF Landsat USGS.
const common = {"Accept-Ranges":"bytes","Cache-Control":"public, max-age=3600","Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"Range, Content-Type","Access-Control-Expose-Headers":"Accept-Ranges, Content-Range, Content-Length, Content-Type, ETag, X-Landsat-Upstream-Status, X-Landsat-Upstream-Content-Range, X-Landsat-Upstream-Length, X-Landsat-Upstream-Method","Access-Control-Allow-Methods":"GET, HEAD, OPTIONS"};
const reply = (body,status=200,extra={}) => new Response(body,{status,headers:{...common,...extra}});
export async function onRequest({request}) {
  if (request.method==="OPTIONS") return reply(null,204);
  if (!["GET","HEAD"].includes(request.method)) return reply("Method not allowed",405);
  const target = new URL(request.url).searchParams.get("url");
  let parsed;
  try { parsed = new URL(target || ""); } catch { return reply("Invalid asset URL",400); }
  const allowed = parsed.protocol==="https:" && parsed.hostname==="landsatlook.usgs.gov" &&
    parsed.pathname.startsWith("/data/collection02/level-2/standard/oli-tirs/") && parsed.pathname.toUpperCase().endsWith(".TIF");
  if (!allowed) return reply("Asset URL not allowed",403);
  const range=request.headers.get("Range");
  if (request.method==="GET" && (!range || !/^bytes=\d+-\d*$/.test(range))) return reply("A valid byte Range header is required",416);
  try {
    if (request.method==="HEAD") {
      let method="HEAD", upstream=await fetch(parsed.toString(),{method:"HEAD"});
      if (!upstream.ok || !upstream.headers.get("content-length")) {
        method="GET Range bytes=0-0";
        upstream=await fetch(parsed.toString(),{method:"GET",headers:{Range:"bytes=0-0"}});
      }
      const cr=upstream.headers.get("content-range")||"";
      const total=cr.match(/\/(\d+)$/)?.[1] || cr.match(/^bytes \*\/(\d+)$/i)?.[1];
      const length=total||upstream.headers.get("content-length");
      const h={"X-Landsat-Upstream-Status":String(upstream.status),"X-Landsat-Upstream-Content-Range":cr||"absent","X-Landsat-Upstream-Length":upstream.headers.get("content-length")||"absent","X-Landsat-Upstream-Method":method};
      for (const n of ["accept-ranges","content-type","etag","last-modified"]) {const v=upstream.headers.get(n);if(v)h[n]=v;}
      if(length)h["Content-Length"]=length;
      if(cr)h["Content-Range"]=cr;
      if(upstream.status===416 && length) return reply(null,200,h);
      if(!upstream.ok && upstream.status!==206) return reply("USGS HEAD/range metadata failed; upstream status "+upstream.status+"; Content-Range: "+(cr||"absent"),upstream.status,h);
      return reply(null,200,h);
    }
    const upstream=await fetch(parsed.toString(),{method:"GET",headers:{Range:range,Accept:"image/tiff,*/*"}});
    const h={};
    for(const n of ["accept-ranges","content-range","content-length","content-type","etag","last-modified"]) {const v=upstream.headers.get(n);if(v)h[n]=v;}
    if(upstream.status!==206) return reply("USGS did not return partial content (expected HTTP 206)",upstream.status,h);
    const body=await upstream.arrayBuffer();
    if(body.byteLength>5*1024*1024) return reply("Range response too large",413,h);
    return reply(body,206,h);
  } catch(error) {
    return reply("Unable to retrieve Landsat raster range: "+String(error?.message||error).slice(0,240),502);
  }
}
