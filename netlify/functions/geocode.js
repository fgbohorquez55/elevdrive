// Netlify Function: geocode.js
exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  try {
    const body = JSON.parse(event.body || '{}');
    const { q, reverse, lat, lon } = body;
    let url;
    if (reverse) {
      url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&accept-language=es`;
    } else {
      url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q + ' Colombia')}&format=json&limit=6&countrycodes=co&addressdetails=1&accept-language=es`;
    }
    const res = await fetch(url, { headers: { 'User-Agent': 'ElevDrive/3.0' } });
    if (!res.ok) throw new Error('Nominatim HTTP ' + res.status);
    const data = await res.json();
    return { statusCode: 200, headers, body: JSON.stringify(data) };
  } catch (e) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: e.message }) };
  }
};
