// Netlify Function: perfiles.js
// CRUD de perfiles de conductor por usuario

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
      'Authorization': `Bearer ${SUPABASE_SECRET_KEY}`,
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

    // Obtener todos los perfiles del usuario
    if (action === 'list' || event.httpMethod === 'GET') {
      const result = await supabase(`/perfiles?usuario_id=eq.${userId}&order=created_at.asc`, 'GET', null, token);
      return { statusCode: 200, headers, body: JSON.stringify(result.data) };
    }

    // Crear perfil
    if (action === 'create') {
      // Verificar límite según plan (max 3 perfiles en familiar, 2 en personal, 1 en free)
      const existing = await supabase(`/perfiles?usuario_id=eq.${userId}&select=id,plan`, 'GET', null, token);
      const count = Array.isArray(existing.data) ? existing.data.length : 0;
      const plan = Array.isArray(existing.data) && existing.data[0]?.plan || 'free';
      const maxPerfiles = plan === 'familiar' ? 3 : plan === 'personal' ? 2 : 1;

      if (count >= maxPerfiles) {
        return { statusCode: 403, headers, body: JSON.stringify({ error: `Tu plan permite máximo ${maxPerfiles} perfil(es). Actualiza para agregar más.` }) };
      }

      const result = await supabase('/perfiles', 'POST', {
        usuario_id: userId,
        nombre: body.nombre || 'Mi perfil',
        avatar: body.avatar || '🧑',
        plan: body.plan || 'free'
      }, token);

      return { statusCode: 200, headers, body: JSON.stringify(result.data) };
    }

    // Actualizar factor de consumo (calibración)
    if (action === 'update_factor') {
      const { perfil_id, factor_consumo, viajes_count } = body;
      const result = await supabase(
        `/perfiles?id=eq.${perfil_id}&usuario_id=eq.${userId}`,
        'PATCH',
        { factor_consumo, viajes_count },
        token
      );
      return { statusCode: 200, headers, body: JSON.stringify(result.data) };
    }

    // Eliminar perfil
    if (action === 'delete') {
      await supabase(`/perfiles?id=eq.${body.perfil_id}&usuario_id=eq.${userId}`, 'DELETE', null, token);
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
    }

    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Acción no válida' }) };

  } catch (e) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: e.message }) };
  }
};
