# Sign-up and sign-in: what has to be set up (once)

Sign-up is how a firm gets into LawDB Connect (claim the firm, start the free month, switch the Connect profile on), so it has to work before anything else.
The sign-in page (`/account/`, and `/account/?join=1` for sign-up) offers only what the server can really do, and says "Sign-up is opening very soon"
when nothing is set up. `GET /api/auth/providers` tells which of the three ways is on: `{ google, linkedin, email }`.

All values go in Cloudflare: Workers & Pages -> **lawdb-ai** -> Settings -> Variables and Secrets. **Never paste a key into a chat, an email or the repo.**

## 1. The email link (needed for firms to sign up without Google or LinkedIn, and for the admin)
- `BREVO_API_KEY` (**Secret**): Brevo -> your name -> SMTP & API -> API keys -> Generate a new API key.
- The sender must be verified in Brevo: Brevo -> Senders, domains & dedicated IPs.
  - Once the domain is bought: authenticate the domain `lawdb.ai` (the two DNS records Brevo shows) and use `info@lawdb.ai` (already the default, `MAIL_FROM_EMAIL`).
  - Until then: add a single sender address you own and can read (Brevo mails it a confirmation link), and set `MAIL_FROM_EMAIL` (**Text**) to that address.
- `ADMIN_EMAILS` (**Secret**): your email, comma-separated for more than one. Whoever signs in with these addresses is an admin (the admin area is `/admin/`).
- Until the real domain is live, links in the emails open the preview itself (the `*.workers.dev` address the request came to). On `lawdb.ai` they use `SITE_ORIGIN`.

## 2. Firms are approved at once when they sign up with their firm email
A claim is approved on the spot when the person's email is on the firm's own website domain (they just proved they can read mail there) and nobody else
manages the firm yet. Gmail and other free or provider addresses, social-media or site-builder websites (Facebook, Wix, ...) and a second person from the same
firm always wait for an admin (Approvals tab). The admin gets a "Claimed automatically" note, and the log says `member.claim_auto_approved`.
To turn instant approval off, add `AUTO_APPROVE_CLAIMS` = `0` (**Text**).

## 3. Optional buttons: "Continue with Google" and "Continue with LinkedIn" (once each)

The buttons appear on the sign-in page by themselves as soon as a provider's two values are in Cloudflare (until then only the email link shows).
The redirect address is the site the visitor is on: `https://lawdb.ai/api/auth/<google|linkedin>/callback`, and on the preview `https://lawdb-ai.acxelturton.workers.dev/api/auth/<google|linkedin>/callback`. Add both in the provider's console while the preview is in use.
**Never paste a client secret into a chat, an email or the repo.** Put it only in Cloudflare: Workers & Pages → lawdb-ai → Settings → Variables and Secrets.

## Google (about 10 minutes)
1. console.cloud.google.com → your **LawDB** project (the same one used for Search Console) → *APIs & Services* → **OAuth consent screen**.
   User type **External**; app name "LawDB"; support email info@lawdb.ai; authorized domain `lawdb.ai`. Scopes: `openid`, `email`, `profile` (nothing else).
   Then press **Publish app** (Testing mode only allows named test users).
2. *APIs & Services* → **Credentials** → **Create credentials** → **OAuth client ID** → type **Web application**.
   **Authorised redirect URI:** `https://lawdb.ai/api/auth/google/callback` (exactly).
3. Copy the **Client ID** and **Client secret**. In Cloudflare add:
   - `GOOGLE_CLIENT_ID` (type **Secret** is simplest)
   - `GOOGLE_CLIENT_SECRET` (type **Secret**)

## LinkedIn (about 10 minutes)
1. linkedin.com/developers → **Create app** (name "LawDB", a LinkedIn Page for LawDB is required; logo; accept terms).
2. *Products* tab → request **Sign In with LinkedIn using OpenID Connect** (approved instantly).
3. *Auth* tab → **Authorized redirect URLs for your app:** `https://lawdb.ai/api/auth/linkedin/callback` (exactly).
4. Copy the **Client ID** and **Primary Client Secret**. In Cloudflare add `LINKEDIN_CLIENT_ID` and `LINKEDIN_CLIENT_SECRET` (**Secret**).

## Check it
Open `https://lawdb.ai/account/` in a private window. The buttons show. Press one, choose an account: you land on your dashboard ("Welcome, <first name>!") and receive the welcome email.

## How it stays safe
- Standard OpenID Connect (authorization code + PKCE) done on the server; the secret never reaches the browser.
- Every attempt has a one-time `state` (hash stored, valid 10 minutes). Reused, expired or invented states are refused.
- An account is matched by email address, and only when the provider says the address is **verified**. Nothing else (no contacts, no password) is requested.
- `ADMIN_EMAILS` still decides who is an admin; disabled accounts cannot sign in; at most 150 new accounts a day.

## If LinkedIn shows "Bummer, something went wrong"
LinkedIn shows that page when it rejects the sign-in request before the person logs in. Check, in this order:
1. **Auth tab, Authorized redirect URLs:** exactly `https://lawdb.ai/api/auth/linkedin/callback` (https, no `www`, no trailing slash, no spaces).
2. **Products tab:** "Sign In with LinkedIn using OpenID Connect" must say it is added (not "Requested").
3. **Client ID** in Cloudflare must be the one on that same app's Auth tab, and the Client Secret its Primary Client Secret.
LawDB does not send PKCE parameters to LinkedIn (its web sign-in does not accept them); Google does use PKCE.
