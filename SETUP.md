# Website editing setup

How Ashlee and Michelle update sipartsfoundation.org without touching
the server.

## How it works

1. They go to **sipartsfoundation.org/admin** and sign in with GitHub.
2. They make their change and click Save.
3. That becomes a pull request. Nothing is live yet.
4. Shauna reviews it on GitHub and merges if it looks right.
5. Merging to `main` uploads the changed files to InterServer.

Nobody can push straight to `main` — the branch ruleset requires a
pull request with one approval.

## Remaining setup

### 1. GitHub OAuth app

<https://github.com/settings/developers> → New OAuth App

| Field | Value |
|---|---|
| Application name | SIP Website Editor |
| Homepage URL | https://sipartsfoundation.org |
| Authorization callback URL | https://sip-decap-oauth.sipartsfoundation.workers.dev/callback |

Keep the Client ID and generate a Client Secret.

### 2. Deploy the Worker

```
cd worker
npx wrangler deploy
npx wrangler secret put GITHUB_CLIENT_ID
npx wrangler secret put GITHUB_CLIENT_SECRET
```

Confirm it is up: the `/health` path should return `ok`.

If the deployed Worker URL differs from the one above, update
`base_url` in `admin/config.yml` and the callback URL in the GitHub
OAuth app to match.

### 3. Repository secrets

Repo → Settings → Secrets and variables → Actions

| Secret | What it is |
|---|---|
| `SFTP_HOST` | InterServer SFTP hostname |
| `SFTP_USER` | SFTP username |
| `SFTP_PASSWORD` | SFTP password |
| `SFTP_PORT` | SFTP port |
| `SFTP_REMOTE_PATH` | `/domains/sipartsfoundation.org/public_html` |

Ask InterServer support for a **restricted SFTP account scoped to that
one directory** rather than using the main hosting login.

### 4. Add the editors

Repo → Settings → Collaborators and teams → Add people.
Give Ashlee and Michelle **Write**. They each need their own GitHub
account with two-factor turned on, which the organization requires.

Write access lets them open pull requests. It does not let them merge,
because the ruleset still demands your approval.

## How a page edit actually reaches the site

Pages managed by the CMS carry markers in their HTML:

```html
<!-- cms:start unmasking -->   ...generated...   <!-- cms:end unmasking -->
```

Editing in the CMS writes `content/unmasking.md`. On deploy,
`tools/build.py` renders that markdown into the marked region and
nothing else on the page is touched — design, nav, forms and scripts
all stay as they are.

To put another page under CMS control:

1. Add the two markers where the editable text should go
2. Add an entry to `PAGES` in `tools/build.py`
3. Add a matching file to `admin/config.yml`

## Recovering an old page

Backups taken off the server are in git history:

```
git checkout 401e4a1 -- _archive/
```
