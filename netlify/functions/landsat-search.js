// Netlify Function: relais same-origin pour le catalogue public USGS Landsat STAC.
// Aucun identifiant secret n'est requis. Les requêtes sont limitées et validées côté serveur.
const STAC_URL = "https://landsatlook.usgs.gov/stac-server/search";

exports.handler = async (event) => {
  const headers = {
    "Content-Type": "application/geo+json; charset=utf-8",
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS"
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers, body: "" };
  }
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers, body: JSON.stringify({ error: "Méthode non autorisée. Utilise POST." }) };
  }

  try {
    const input = JSON.parse(event.body || "{}");
    const bbox = input.bbox;
    const datetime = input.datetime;
    const limit = Number(input.limit);
    const cloud = Number(input?.query?.["eo:cloud_cover"]?.lte);

    if (!Array.isArray(bbox) || bbox.length !== 4 || !bbox.every(Number.isFinite) ||
        bbox[0] < -180 || bbox[2] > 180 || bbox[1] < -90 || bbox[3] > 90 ||
        bbox[0] >= bbox[2] || bbox[1] >= bbox[3]) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: "Emprise géographique invalide." }) };
    }
    if (typeof datetime !== "string" || !/^\d{4}-\d{2}-\d{2}T00:00:00Z\/\d{4}-\d{2}-\d{2}T23:59:59Z$/.test(datetime)) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: "Période invalide." }) };
    }
    if (!Number.isInteger(limit) || limit < 1 || limit > 50 || !Number.isFinite(cloud) || cloud < 0 || cloud > 100) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: "Limite ou couverture nuageuse invalide." }) };
    }

    const payload = {
      collections: ["landsat-c2l2-sr"],
      bbox,
      datetime,
      limit,
      query: { "eo:cloud_cover": { lte: cloud } }
    };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25000);
    let upstream;
    try {
      upstream = await fetch(STAC_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "application/geo+json" },
        body: JSON.stringify(payload),
        signal: controller.signal
      });
    } finally {
      clearTimeout(timeout);
    }

    const body = await upstream.text();
    if (!upstream.ok) {
      return {
        statusCode: 502,
        headers,
        body: JSON.stringify({ error: "Le catalogue USGS a répondu avec HTTP " + upstream.status + ".", upstream_status: upstream.status })
      };
    }
    return { statusCode: 200, headers, body };
  } catch (error) {
    const message = error && error.name === "AbortError"
      ? "Délai dépassé lors de la connexion au catalogue USGS."
      : "Connexion au catalogue USGS impossible.";
    return { statusCode: 502, headers, body: JSON.stringify({ error: message }) };
  }
};
