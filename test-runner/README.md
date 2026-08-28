# Test Runner

A standalone web app. People sign in here, click a test flow, and it runs in the
pipeline. They get no GitHub account, no repository access, and no pipeline
access.

This is **not** part of the demo website in this repository. Different app,
different port, different UI, its own login. The demo website (`../server.js`) is
the thing being _tested_; this is the thing that _starts_ the tests.

```
   person  ──►  test runner (this app)  ──►  GitHub Actions  ──►  runs the specs
  (login)         holds the token            remote-test-runner     against a fresh
                                                                    copy of the site
```

Nothing here depends on your machine being on. Once this app is deployed, the
runs happen on GitHub's infrastructure.

## Run it locally

```bash
cd test-runner
node server.js
```

Open **http://127.0.0.1:4300**.

With no configuration you get the UI and the sign-up form, but starting a run is
refused with an explanation — it needs a GitHub token. That is deliberate: an
unconfigured checkout can never fire real CI runs by accident.

## Configure it

Copy `.env.example` and fill it in, or set the variables however your host does.
The two that matter:

| Variable          | What it does                                                               |
| ----------------- | -------------------------------------------------------------------------- |
| `TR_GITHUB_TOKEN` | Fine-grained PAT, **one repo**, **Actions: read and write**, nothing else. |
| `TR_REPO`         | `owner/repo` holding the tests and the workflow.                           |

Everything else has a working default. Full list with comments in
`.env.example`.

## How people get accounts

Set `TR_SIGNUP_MODE`:

- **`invite`** (default) — there is a sign-up form, but it requires
  `TR_INVITE_CODE`. Hand the code to whoever should get in; change it to cut off
  anyone who has not registered yet. This is the sane setting for a team. Make
  the code at least 24 random characters — the runner reports a configuration
  error below that, because a guessed code on a fresh deployment is an admin
  account.
- **`open`** — anyone who can reach the page can create an account. Only use
  this if the page is already behind something else (VPN, company SSO proxy,
  private network).
- **`off`** — no sign-up form at all. You create accounts yourself.

The **first account created becomes admin** — counting accounts from `TR_USERS`
below, so a runner that already has an operator-declared admin does not hand
admin to the next person who signs up. Passwords are stored only as salted scrypt
hashes. Sessions are httpOnly, `SameSite=Strict` cookies.

Accounts live in `TR_USERS_FILE` (`./data/users.json` by default). In Docker,
mount a volume at `/app/data` or every redeploy wipes the accounts.

### Accounts with no disk (`TR_USERS`)

Some hosts have no persistent disk at all — Render's free tier replaces the
filesystem on every restart and redeploy. There, a file-only store means every
account disappears and the first person to sign up becomes admin again. Declare
the accounts in the environment instead:

```
TR_USERS=alice:admin:scrypt$16384$8$1$<salt>$<derived>
bob:scrypt$16384$8$1$<salt>$<derived>
```

- Entries are separated by newlines **or** commas; `#` lines are comments.
- `username:hash` or `username:role:hash`, role being `admin` or `user`
  (defaults to `user`). Give at least one entry `admin`, or nobody can manage
  accounts — the runner reports a configuration error if none does.
- Usernames follow the sign-in rule: 3–32 characters, letters, digits, dot,
  underscore, hyphen. An entry the login form could not accept is refused with a
  reason rather than becoming an account nobody can use.
- Generate an entry with the account tool, one per person:

  ```bash
  cd test-runner
  npm run passwd -- --username alice --role admin --generate
  ```

These accounts are **immutable from inside the app**: the UI marks them `env`,
and delete, role change and password reset all answer `409` telling you to change
`TR_USERS` and restart. They are never written to the user store file. Where a
name exists in both places, `TR_USERS` wins.

With `TR_USERS` set, an unwritable or missing user store costs you **self-signup
only** — those accounts sign in, start runs and administer normally.

## Where the flow list comes from

The runner does not read your repository. It fetches the flow catalog that the
pipeline commits (`scripts/test-runner/flow-catalog.json`) through the GitHub
API, and caches it for a minute.

That means **the list updates itself**: push a new spec, the `flow-catalog`
workflow regenerates the catalog, and the new flow shows up here on the next
load. Nobody edits a list.

For local development, point `TR_LOCAL_CATALOG` at the file on disk instead.

## Deploy it

It has no dependencies and no build step, so anywhere that runs a container
works:

```bash
docker build -t test-runner ./test-runner
docker run -d -p 4300:4300 \
  -e TR_GITHUB_TOKEN=... \
  -e TR_REPO=asaf-1/Agents-Playground \
  -e TR_INVITE_CODE=... \
  -e TR_SECURE_COOKIE=true \
  -v test-runner-data:/app/data \
  test-runner
```

Put it behind HTTPS and set `TR_SECURE_COOKIE=true`. Without HTTPS the session
cookie travels in the clear.

Login, sign-up and invite-code attempts are rate limited per client address, and
password hashing is bounded so a burst of anonymous attempts cannot starve the
process. Repeated failed sign-ins lock the **(account + address)** pair, never
the account alone, so no stranger can lock a colleague — or the only
administrator — out of their own runner. A far higher per-account threshold
catches a spray spread across many addresses, and it is applied only to attempts
that have already failed, so a correct password from an address that is not
itself locked always works.

Configuration problems are reported twice: signed-in users see a summary that
names the variable, and the value behind it (a path, a URL, how short the invite
code is) goes only to the server log and to administrators. If a reverse proxy you control terminates TLS in front of the runner,
set `TR_TRUST_PROXY=true` so those limits count the real client rather than the
proxy. Leave it unset otherwise — trusting `X-Forwarded-For` with no proxy in
front lets any caller pick their own rate-limit bucket.

## API

Same-origin JSON. The session is a cookie; the browser never handles a token.

| Method | Path            | Auth | Purpose                               |
| ------ | --------------- | ---- | ------------------------------------- |
| GET    | `/api/health`   | —    | Liveness.                             |
| GET    | `/api/session`  | —    | Who am I, and is sign-up available.   |
| POST   | `/api/signup`   | —    | Create an account and sign in.        |
| POST   | `/api/login`    | —    | Sign in.                              |
| POST   | `/api/logout`   | —    | Sign out.                             |
| GET    | `/api/flows`    | user | The flow catalog plus dispatch state. |
| POST   | `/api/runs`     | user | Start a run.                          |
| GET    | `/api/runs`     | user | Recent runs.                          |
| GET    | `/api/runs/:id` | user | One run, with jobs and artifacts.     |

`/api/flows` needs a login too: flow entries name internal spec paths.

## What it deliberately does not do

- **No repository access for users.** They cannot read code, push, see secrets,
  or open the Actions tab. Only start a catalogued flow and read its status.
- **No token in the browser.** It is never sent to the client, echoed in a
  response, or logged.
- **No artifact proxying.** Downloading run artifacts needs GitHub auth, so the
  UI links to the run page rather than streaming files through this server.

## Known limits

- Sessions are in memory: restarting signs everyone out, and running more than
  one instance needs a shared session store.
- `workflow_dispatch` returns no run id, so the runner polls for the newest run
  created after dispatch. Under simultaneous dispatches of the same flow the
  reported run could be someone else's; the run page is authoritative.
- The account store is a JSON file. Fine for a team; not for thousands of users.
- `TR_USERS` is parsed on every request, so it is capped at 100 accounts. Past a
  handful of colleagues, use the file store on a real disk.
