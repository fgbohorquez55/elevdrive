// Netlify Function: route.js
// Calls OpenRouteService server-side â€” no CORS issues
const ORS_KEY = process.env.ORS_KEY;

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  try {
    const { startLng, startLat, endLng, endLat } = JSON.parse(event.body || '{}');
    if (!startLat || !startLng || !endLat || !endLng) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Faltan coordenadas' }) };
    }

    const url = `https://api.openrouteservice.org/v2/directions/driving-car?api_key=${ORS_KEY}&start=${startLng},${startLat}&end=${endLng},${endLat}`;
    const res = await fetch(url);
    const data = await res.json();

    if (!res.ok) {
      return { statusCode: res.status, headers, body: JSON.stringify({ error: data.error || 'ORS error', detail: data }) };
    }

    const feat = data.features[0];
    const coords = feat.geometry.coordinates.map(c => [c[1], c[0]]);
    const sec = feat.properties.summary.duration;
    const distKm = feat.properties.summary.distance / 1000;
    const dur = sec > 3600
      ? `${Math.floor(sec / 3600)}h ${Math.floor((sec % 3600) / 60)}min`
      : `${Math.floor(sec / 60)} min`;

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ coords, distKm, dur })
    };
  } catch (e) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: e.message })
    };
  }
};
