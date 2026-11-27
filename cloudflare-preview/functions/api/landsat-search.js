// Cloudflare Pages Function — relais catalogue public USGS Landsat STAC.
const STAC_URL = "https://landsatlook.usgs.gov/stac-server/search";
const json = (body, status=200) => new Response(JSON.stringify(body), {
  status, headers: { "Content-Type": "application/geo+json; charset=utf-8", "Cache-Control": "no-store" }
});
export async function onRequestPost({ request }) {
  try {
    const input = await request.json();
    const bbox = input.bbox, datetime = input.datetime;
    const limit = Number(input.limit);
    const cloud = Number(input?.query?.["eo:cloud_cover"]?.lte);
    if (!Array.isArray(bbox) || bbox.length !== 4 || !bbox.every(Number.isFinite) ||
        bbox[0] < -180 || bbox[2] > 180 || bbox[1] < -90 || bbox[3] > 90 ||
        bbox[0] >= bbox[2] || bbox[1] >= bbox[3]) return json({error:"Emprise géographique invalide."},400);
    if (typeof datetime !== "string" || !/^\d{4}-\d{2}-\d{2}T00:00:00Z\/\d{4}-\d{2}-\d{2}T23:59:59Z$/.test(datetime))
      return json({error:"Période invalide."},400);
    if (!Number.isInteger(limit) || limit < 1 || limit > 50 || !Number.isFinite(cloud) || cloud < 0 || cloud > 100)
      return json({error:"Limite ou couverture nuageuse invalide."},400);
    const payload = {collections:["landsat-c2l2-sr"],bbox,datetime,limit,query:{"eo:cloud_cover":{lte:cloud}}};
    const response = await fetch(STAC_URL,{method:"POST",headers:{"Content-Type":"application/json","Accept":"application/geo+json"},body:JSON.stringify(payload),signal:AbortSignal.timeout(25000)});
    if (!response.ok) return json({error:"Le catalogue USGS a répondu avec HTTP "+response.status,upstream_status:response.status},502);
    return new Response(response.body,{status:200,headers:{"Content-Type":"application/geo+json; charset=utf-8","Cache-Control":"no-store"}});
  } catch (error) {
    return json({error:error?.name==="TimeoutError"?"Délai dépassé lors de la connexion au catalogue USGS.":"Connexion au catalogue USGS impossible."},502);
  }
}
export async function onRequest({ request }) {
  if (request.method === "OPTIONS") return new Response(null,{status:204});
  return json({error:"Méthode non autorisée. Utilise POST."},405);
}
