// Netlify Function: elevation.js
// Calls Google Elevation API server-side â€” no CORS issues
const GMAP_KEY = process.env.GMAP_KEY;

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
    const { points } = JSON.parse(event.body || '{}');
    if (!points || !points.length) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Faltan puntos' }) };
    }

    // Try Google Elevation first
    try {
      const locs = points.map(p => `${p[0].toFixed(5)},${p[1].toFixed(5)}`).join('|');
      const res = await fetch(`https://maps.googleapis.com/maps/api/elevation/json?locations=${locs}&key=${GMAP_KEY}`);
      const data = await res.json();
      if (data.status === 'OK') {
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({ elevations: data.results.map(r => r.elevation) })
        };
      }
      throw new Error('Google status: ' + data.status);
    } catch (googleErr) {
      // Fallback: Open-Elevation
      const res2 = await fetch('https://api.open-elevation.com/api/v1/lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ locations: points.map(p => ({ latitude: p[0], longitude: p[1] })) })
      });
      const data2 = await res2.json();
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ elevations: data2.results.map(r => r.elevation) })
      };
    }
  } catch (e) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: e.message })
    };
  }
};
