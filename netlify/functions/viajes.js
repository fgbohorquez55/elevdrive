// Netlify Function: viajes.js
// Guarda viajes y actualiza el modelo de calibración del perfil

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY;

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Content-Type': 'application/json'
};

async function supabase(path, method = 'GET', body = null, token) {
  const opts = {
    method,
    headers: {
      'apikey': SUPABASE_SECRET_KEY,
      'Authorization': `Bearer ${token || SUPABASE_SECRET_KEY}`,
      'Content-Type': 'application/json',
      ...(method === 'POST' ? {'Prefer': 'return=representation'} : {})
    }
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${SUPABASE_URL}/rest/v1${path}`, opts);
  const text = await res.text();
  try { return { ok: res.ok, status: res.status, data: JSON.parse(text) }; }
  catch { return { ok: res.ok, status: res.status, data: text }; }
}

async function getUserId(token) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { 'apikey': SUPABASE_SECRET_KEY, 'Authorization': `Bearer ${token}` }
  });
  const data = await res.json();
  if (!data.id) throw new Error('Token inválido o expirado');
  return data.id;
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };

  try {
    const token = (event.headers.authorization || '').replace('Bearer ', '');
    if (!token) return { statusCode: 401, headers, body: JSON.stringify({ error: 'No autenticado' }) };

    const userId = await getUserId(token);
    const body = JSON.parse(event.body || '{}');
    const { action } = body;

    // Listar viajes del perfil
    if (action === 'list') {
      const result = await supabase(
        `/viajes?perfil_id=eq.${body.perfil_id}&order=created_at.desc&limit=50`,
        'GET', null, token
      );
      return { statusCode: 200, headers, body: JSON.stringify(result.data) };
    }

    // Guardar viaje al terminar
    if (action === 'save') {
      const {
        perfil_id, vehiculo_id, origen, destino,
        distancia_km, elevacion_ganada_m, elevacion_perdida_m,
        bateria_inicio_pct, bateria_estimada_fin_pct, bateria_real_fin_pct,
        velocidad_promedio_kmh, uso_regen, ac_encendido,
        consumo_real_kwh, consumo_estimado_kwh
      } = body;

      // Calcular factor de error real/estimado
      let factor_error = 1.0;
      if (consumo_estimado_kwh && consumo_real_kwh && consumo_estimado_kwh > 0) {
        factor_error = consumo_real_kwh / consumo_estimado_kwh;
      } else if (bateria_estimada_fin_pct && bateria_real_fin_pct) {
        // Alternativa: usar diferencia de batería
        const consumido_estimado = bateria_inicio_pct - bateria_estimada_fin_pct;
        const consumido_real = bateria_inicio_pct - bateria_real_fin_pct;
        if (consumido_estimado > 0) factor_error = consumido_real / consumido_estimado;
      }

      // Guardar el viaje
      const viajeResult = await supabase('/viajes', 'POST', {
        perfil_id, vehiculo_id, origen, destino,
        distancia_km, elevacion_ganada_m, elevacion_perdida_m,
        bateria_inicio_pct, bateria_estimada_fin_pct, bateria_real_fin_pct,
        velocidad_promedio_kmh, uso_regen, ac_encendido,
        consumo_real_kwh, consumo_estimado_kwh, factor_error
      }, token);

      // Actualizar factor_consumo del perfil con promedio de últimos 10 viajes
      const historial = await supabase(
        `/viajes?perfil_id=eq.${perfil_id}&order=created_at.desc&limit=10&select=factor_error`,
        'GET', null, token
      );

      if (Array.isArray(historial.data) && historial.data.length > 0) {
        const factores = historial.data
          .map(v => v.factor_error)
          .filter(f => f && f > 0.5 && f < 2.0); // filtrar outliers

        if (factores.length > 0) {
          const factor_promedio = factores.reduce((a, b) => a + b, 0) / factores.length;
          const factor_redondeado = Math.round(factor_promedio * 1000) / 1000;

          await supabase(
            `/perfiles?id=eq.${perfil_id}`,
            'PATCH',
            {
              factor_consumo: factor_redondeado,
              viajes_count: historial.data.length
            },
            token
          );
        }
      }

      return { statusCode: 200, headers, body: JSON.stringify({ ok: true, viaje: viajeResult.data }) };
    }

    // Obtener estadísticas del perfil
    if (action === 'stats') {
      const result = await supabase(
        `/viajes?perfil_id=eq.${body.perfil_id}&select=distancia_km,consumo_real_kwh,factor_error,bateria_inicio_pct,bateria_real_fin_pct,uso_regen&order=created_at.desc&limit=20`,
        'GET', null, token
      );

      const viajes = Array.isArray(result.data) ? result.data : [];
      const totalKm = viajes.reduce((a, v) => a + (v.distancia_km || 0), 0);
      const totalKwh = viajes.reduce((a, v) => a + (v.consumo_real_kwh || 0), 0);
      const eficiencia = totalKm > 0 ? (totalKwh / totalKm * 100).toFixed(1) : null;
      const factorPromedio = viajes.length > 0
        ? (viajes.reduce((a, v) => a + (v.factor_error || 1), 0) / viajes.length).toFixed(3)
        : 1.0;

      return {
        statusCode: 200, headers,
        body: JSON.stringify({
          total_viajes: viajes.length,
          total_km: Math.round(totalKm),
          total_kwh: Math.round(totalKwh * 10) / 10,
          eficiencia_kwh100km: eficiencia,
          factor_consumo_promedio: factorPromedio
        })
      };
    }

    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Acción no válida' }) };

  } catch (e) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: e.message }) };
  }
};
