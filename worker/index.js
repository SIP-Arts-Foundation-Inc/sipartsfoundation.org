/**
 * Decap CMS OAuth handler for SIP Arts Foundation.
 *
 * Decap opens /auth in a popup. We bounce the user to GitHub, GitHub
 * returns to /callback with a code, we trade that code for an access
 * token, then postMessage the token back to the CMS window and close.
 *
 * Secrets live in Worker secrets, never in this file:
 *   GITHUB_CLIENT_ID
 *   GITHUB_CLIENT_SECRET
 */

const ALLOWED_ORIGINS = [
  'https://sipartsfoundation.org',
  'https://www.sipartsfoundation.org',
];

function htmlResponse(body, status = 200) {
  return new Response(body, {
    status,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'no-referrer',
    },
  });
}

/** Page shown inside the popup; hands the result to the CMS and closes. */
function handshakePage(status, payload) {
  const message = `authorization:github:${status}:${JSON.stringify(payload)}`;
  return htmlResponse(`<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>Signing in…</title></head>
<body>
<p>Completing sign in…</p>
<script>
(function () {
  var message = ${JSON.stringify(message)};
  var allowed = ${JSON.stringify(ALLOWED_ORIGINS)};
  function send(origin) {
    try { window.opener && window.opener.postMessage(message, origin); } catch (e) {}
  }
  // Decap's handshake: it pings us, we answer, then it reads the token.
  function onMessage(e) {
    if (allowed.indexOf(e.origin) === -1) return;
    send(e.origin);
    window.removeEventListener('message', onMessage);
    setTimeout(function () { window.close(); }, 300);
  }
  window.addEventListener('message', onMessage, false);
  allowed.forEach(function (o) { send(o); });
  setTimeout(function () { window.close(); }, 4000);
})();
</script>
</body>
</html>`);
}

function randomState() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (!env.GITHUB_CLIENT_ID || !env.GITHUB_CLIENT_SECRET) {
      return htmlResponse('<h1>OAuth is not configured</h1>', 500);
    }

    // Step 1 — send the user to GitHub.
    if (url.pathname === '/auth') {
      const state = randomState();
      const redirectUri = `${url.origin}/callback`;
      const authorize = new URL('https://github.com/login/oauth/authorize');
      authorize.searchParams.set('client_id', env.GITHUB_CLIENT_ID);
      authorize.searchParams.set('redirect_uri', redirectUri);
      authorize.searchParams.set('scope', 'repo,user');
      authorize.searchParams.set('state', state);

      return new Response(null, {
        status: 302,
        headers: {
          Location: authorize.toString(),
          'Set-Cookie': `oauth_state=${state}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=600`,
          'Cache-Control': 'no-store',
        },
      });
    }

    // Step 2 — GitHub sends the user back here with a code.
    if (url.pathname === '/callback') {
      const code = url.searchParams.get('code');
      const state = url.searchParams.get('state');
      const cookie = request.headers.get('Cookie') || '';
      const expected = (cookie.match(/(?:^|;\s*)oauth_state=([^;]+)/) || [])[1];

      if (!code) return handshakePage('error', { message: 'No code returned from GitHub' });
      if (!state || !expected || state !== expected) {
        return handshakePage('error', { message: 'State mismatch — please try signing in again' });
      }

      const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          client_id: env.GITHUB_CLIENT_ID,
          client_secret: env.GITHUB_CLIENT_SECRET,
          code,
          redirect_uri: `${url.origin}/callback`,
        }),
      });

      if (!tokenRes.ok) {
        return handshakePage('error', { message: `GitHub returned ${tokenRes.status}` });
      }

      const data = await tokenRes.json();
      if (data.error || !data.access_token) {
        return handshakePage('error', { message: data.error_description || data.error || 'No token returned' });
      }

      return handshakePage('success', { token: data.access_token, provider: 'github' });
    }

    if (url.pathname === '/health') {
      return new Response('ok', { headers: { 'Content-Type': 'text/plain' } });
    }

    return new Response('Not found', { status: 404 });
  },
};
