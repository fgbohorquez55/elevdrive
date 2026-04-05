// Netlify Function: auth.js
// Handles login, register, logout via Supabase Auth

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY;
const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY;

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Content-Type': 'application/json'
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };

  try {
    const { action, email, password } = JSON.parse(event.body || '{}');

    if (action === 'register') {
      const res = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_PUBLISHABLE_KEY
        },
        body: JSON.stringify({ email, password })
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error.message || data.msg || 'Error al registrar');
      return { statusCode: 200, headers, body: JSON.stringify({ user: data.user, session: data.session }) };
    }

    if (action === 'login') {
      const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_PUBLISHABLE_KEY
        },
        body: JSON.stringify({ email, password })
      });
      const data = await res.json();
      if (!res.ok || data.error || data.error_description) {
        const msg = data.error_description || data.error || 'Credenciales incorrectas';
        const friendly = msg.toLowerCase().includes('invalid') ?
          'Correo o contraseña incorrectos. Si no tienes cuenta, usa Registrarse.' : msg;
        return { statusCode: 401, headers, body: JSON.stringify({ error: friendly }) };
      }
      if (!data.access_token) return { statusCode: 401, headers, body: JSON.stringify({ error: 'No se recibió sesión. Verifica tus datos.' }) };
      return { statusCode: 200, headers, body: JSON.stringify({ user: data.user, session: { access_token: data.access_token, refresh_token: data.refresh_token } }) };
    }

    if (action === 'refresh') {
      const { refresh_token } = JSON.parse(event.body || '{}');
      const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_PUBLISHABLE_KEY
        },
        body: JSON.stringify({ refresh_token })
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error_description || 'Sesión expirada');
      return { statusCode: 200, headers, body: JSON.stringify({ session: { access_token: data.access_token, refresh_token: data.refresh_token } }) };
    }

    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Acción no válida' }) };

  } catch (e) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: e.message }) };
  }
};
