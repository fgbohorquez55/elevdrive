// Netlify Function: elevation.js
// Fixes: point sampling to avoid URL length limits, OpenTopoData as reliable fallback

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };

  try {
    const body = JSON.parse(event.body || '{}');
    const { points } = body;
    if (!points || !points.length) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Faltan puntos' }) };
    }

    // Sample points to max 200 to avoid URL length limits on Google API
    // Google limit: 512 locations per request, but URL length is the real constraint
    const MAX_POINTS = 150;
    let sampledPoints = points;
    if (points.length > MAX_POINTS) {
      const step = points.length / MAX_POINTS;
      sampledPoints = [];
      for (let i = 0; i < MAX_POINTS; i++) {
        sampledPoints.push(points[Math.round(i * step)]);
      }
      // Always include last point
      sampledPoints[sampledPoints.length - 1] = points[points.length - 1];
    }

    const GMAP_KEY = process.env.GMAP_KEY;

    // Try Google Elevation first
    if (GMAP_KEY) {
      try {
        const locs = sampledPoints.map(p => `${p[0].toFixed(5)},${p[1].toFixed(5)}`).join('|');
        const url = `https://maps.googleapis.com/maps/api/elevation/json?locations=${locs}&key=${GMAP_KEY}`;
        const res = await fetch(url);
        const data = await res.json();
        if (data.status === 'OK') {
          return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
              elevations: data.results.map(r => r.elevation),
              source: 'google',
              points_used: sampledPoints.length,
              points_original: points.length
            })
          };
        }
        console.error('Google Elevation error:', data.status, data.error_message);
      } catch (googleErr) {
        console.error('Google Elevation fetch failed:', googleErr.message);
      }
    }

    // Fallback: OpenTopoData (SRTM30 dataset - free, reliable, no key needed)
    try {
      const locs = sampledPoints.map(p => `${p[0].toFixed(5)},${p[1].toFixed(5)}`).join('|');
      const res = await fetch(`https://api.opentopodata.org/v1/srtm30m?locations=${locs}`, {
        headers: { 'Accept': 'application/json' }
      });
      if (!res.ok) throw new Error('OpenTopoData HTTP ' + res.status);
      const data = await res.json();
      if (data.status === 'OK' && data.results) {
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({
            elevations: data.results.map(r => r.elevation || 0),
            source: 'opentopodata',
            points_used: sampledPoints.length,
            points_original: points.length
          })
        };
      }
      throw new Error('OpenTopoData status: ' + data.status);
    } catch (topoErr) {
      console.error('OpenTopoData failed:', topoErr.message);
    }

    // Last fallback: Open-Elevation
    try {
      const res = await fetch('https://api.open-elevation.com/api/v1/lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          locations: sampledPoints.map(p => ({ latitude: p[0], longitude: p[1] }))
        })
      });
      if (!res.ok) throw new Error('Open-Elevation HTTP ' + res.status);
      const data = await res.json();
      if (data.results && data.results.length) {
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({
            elevations: data.results.map(r => r.elevation || 0),
            source: 'open-elevation',
            points_used: sampledPoints.length,
            points_original: points.length
          })
        };
      }
      throw new Error('Open-Elevation: no results');
    } catch (openErr) {
      console.error('Open-Elevation failed:', openErr.message);
    }

    // All APIs failed - return error with details
    return {
      statusCode: 503,
      headers,
      body: JSON.stringify({
        error: 'Todos los servicios de elevación fallaron. Intenta de nuevo en unos segundos.'
      })
    };

  } catch (e) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: e.message })
    };
  }
}
