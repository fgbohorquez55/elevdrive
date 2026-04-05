// Netlify Function: route.js
exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  try {
    const body = JSON.parse(event.body || '{}');
    const { startLat, startLng, endLat, endLng } = body;
    if (!startLat || !startLng || !endLat || !endLng) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Faltan coordenadas: ' + JSON.stringify(body) }) };
    }
    const ORS_KEY = process.env.ORS_KEY;
    if (!ORS_KEY) return { statusCode: 500, headers, body: JSON.stringify({ error: 'ORS_KEY no configurada' }) };
    const url = `https://api.openrouteservice.org/v2/directions/driving-car?api_key=${ORS_KEY}&start=${startLng},${startLat}&end=${endLng},${endLat}`;
    const res = await fetch(url);
    const text = await res.text();
    if (!res.ok) return { statusCode: res.status, headers, body: JSON.stringify({ error: 'ORS error ' + res.status, detail: text.slice(0, 300) }) };
    const data = JSON.parse(text);
    const feat = data.features[0];
    const coords = feat.geometry.coordinates.map(c => [c[1], c[0]]);
    const sec = feat.properties.summary.duration;
    const distKm = feat.properties.summary.distance / 1000;
    const dur = sec > 3600 ? `${Math.floor(sec/3600)}h ${Math.floor((sec%3600)/60)}min` : `${Math.floor(sec/60)} min`;
    return { statusCode: 200, headers, body: JSON.stringify({ coords, distKm, dur }) };
  } catch (e) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: e.message, stack: e.stack }) };
  }
};
