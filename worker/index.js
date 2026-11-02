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

/** Page shown inside the popup; hands the result to the CMS and closes.
 *
 * Decap's handshake has a strict order, and getting it wrong leaves the
 * editor sitting on the loading screen forever:
 *   1. this popup posts "authorizing:github" to the opener
 *   2. only then does Decap attach its listener and echo the message back
 *   3. this popup replies with the token
 * Posting the token first means nobody is listening for it yet.
 */
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

  if (!window.opener) {
    document.body.textContent =
      'Please close this window and start the sign in from the editor again.';
    return;
  }

  function onMessage(e) {
    if (e.data !== 'authorizing:github') return;
    if (allowed.indexOf(e.origin) === -1) return;
    window.removeEventListener('message', onMessage, false);
    window.opener.postMessage(message, e.origin);
    setTimeout(function () { window.close(); }, 500);
  }

  window.addEventListener('message', onMessage, false);

  // Step 1: tell the editor we are ready. It answers, then we send the token.
  window.opener.postMessage('authorizing:github', '*');

  // If the editor never answers, say so rather than hanging silently.
  setTimeout(function () {
    document.body.textContent =
      'The editor did not respond. Close this window and try signing in again.';
  }, 15000);
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
