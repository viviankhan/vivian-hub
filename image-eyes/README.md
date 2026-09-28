# Image Eyes — your own image connector for Claude

Image Eyes lets Claude actually look at pictures. It lives in this folder,
runs free on Cloudflare Workers, and you add it to Claude as a custom
connector. Because the code is in your GitHub, it can't go missing.

## What Claude gets

| Tool | What it does |
|---|---|
| `search_images` | Searches the **whole web** (Google Images through Serper or SerpApi, or Brave) and returns the pictures plus each one's source page. Without a search key it searches Wikimedia Commons and Openverse only. |
| `view_image` | Looks at an image URL or a page. **Fandom and Wikipedia pages are read through the wiki's own API**, so fandom's 403 doesn't matter, and gallery subpages are searched too. `prefer: "2011 full body -1999"` picks which pictures come back. Thumbnails are swapped for the sharpest size Claude can use (1568 px). |
| `list_wiki_images` | Lists every picture on a wiki page and its galleries as text: filename, **caption**, **section/tab** (e.g. `2011 Anime › Full body`), size and full-size URL. Claude reads this first to pick the right version, then views only what it needs. |

## Easiest update: paste it into Cloudflare (5 minutes)

This puts the new code on your existing `image-eyes` Worker. The address
and its secret stay the same, so the connector in Claude keeps working.

1. Log in at **dash.cloudflare.com** → **Workers & Pages** → **image-eyes**.
2. Click **Edit code** (the **</>** button, top right).
3. Open `paste-into-cloudflare.js` from this folder, copy all of it, and in
   the editor replace everything in the worker's file with it.
4. Click **Deploy**.
5. For web search: on the Worker's **Settings → Variables and Secrets**,
   click **Add**, choose type **Secret**, name it `SERPER_API_KEY` (or
   `BRAVE_API_KEY`), paste your key, and **Deploy** (see the next section
   for where to get one).
6. Start a new chat with Image Eyes on. Claude should list three tools,
   including `list_wiki_images`.

To go back, paste `archive/v2.1-worker.js` the same way.

The rest of this section is the automatic route instead: GitHub deploys it
for you whenever the code changes.

## Automatic route: replacing the old Image Eyes (about 10 minutes)

The first Image Eyes (v2.1, saved in `archive/`) runs as the Worker
`image-eyes` at `image-eyes.lumiaxolotl.workers.dev`. This version uses
the same name and the same `SECRET_PATH` secret, so deploying it
**replaces the old one at the same address**. The connector you already
have in Claude keeps working. You don't need to know the secret or
change anything in Claude.

### 1. Two values from Cloudflare

Log in at **dash.cloudflare.com** with the account that has the
`image-eyes` Worker (**Workers & Pages** lists it).

1. **Account ID:** in **Workers & Pages**, it's in the right-hand sidebar
   (or click **⋯** next to the account name → **Copy account ID**).
2. **API token:** profile icon (top right) → **My Profile** → **API
   Tokens** → **Create Token** → **Edit Cloudflare Workers** template →
   **Continue to summary** → **Create Token**. Copy it; it's shown once.

### 2. (Optional, recommended) a web image search key

This is what lets Claude find anime characters, products and so on. Pick
one:

- **Serper** (Google Images, easiest): sign up at **serper.dev** (a Google
  account works). New accounts get free searches to start. Copy the key
  from **API Key** in the dashboard. Secret name: `SERPER_API_KEY`.
- **Brave Search API**: sign up at **api-dashboard.search.brave.com**, pick
  a plan that includes image search and copy the key. Secret name:
  `BRAVE_API_KEY`.
- **SerpApi** (Google Images): **serpapi.com**. Secret name: `SERPAPI_KEY`.

If more than one is set, Serper is used first, then SerpApi, then Brave.

Without any, everything except web search still works.

### 3. Add GitHub secrets

In the `vivian-hub` repo: **Settings → Secrets and variables → Actions →
New repository secret**:

| Name | Value |
|---|---|
| `CLOUDFLARE_API_TOKEN` | the token from step 1 |
| `CLOUDFLARE_ACCOUNT_ID` | the account ID from step 1 |
| `SERPER_API_KEY`, `SERPAPI_KEY` *or* `BRAVE_API_KEY` | from step 2 (optional) |
| `IMAGE_EYES_SECRET_PATH` | **leave this out** to keep the current address. Only set it to change the address (then update the connector in Claude to `…/mcp/<new value>`). |

### 4. Deploy

**Actions** tab → **Deploy Image Eyes** → **Run workflow**. (It also runs
by itself whenever `image-eyes/` changes on `main`.) Then start a new chat
with the Image Eyes connector on. Claude should now list three tools,
including `list_wiki_images`.

### Starting fresh instead

On a Cloudflare account without the old Worker, also set
`IMAGE_EYES_SECRET_PATH` (any long random string of letters and numbers),
deploy, then in **claude.ai → Settings → Connectors → Add custom
connector** paste `https://image-eyes.<subdomain>.workers.dev/mcp/<that string>`.

## Changing it later

- **Add or change a search key:** update the GitHub secret, then run the
  workflow again.
- **Send images bigger than 2.5 MB:** raise `MAX_IMAGE_BYTES` in
  `wrangler.toml`. Anything over the limit falls back to a smaller copy.

## Troubleshooting

- **Claude says the connector can't be reached:** check the address ends
  in `/mcp/<SECRET_PATH>` exactly, with no trailing spaces.
- **Want the old version back:** paste `archive/v2.1-worker.js` into the
  Worker's **Edit code** screen in Cloudflare and deploy it there.
- **Web search never happens:** the result will say "no SERPER_API_KEY,
  SERPAPI_KEY or BRAVE_API_KEY is set". Add one (step 2–3) and redeploy.
- **Errors mentioning CPU time on very large pictures:** Cloudflare's free
  plan has a small CPU allowance per request. Lower `MAX_IMAGE_BYTES`, or
  switch to the $5/month Workers Paid plan.

## Development

```
cd image-eyes
npm install
npm test          # runs against a fake internet, no network needed
npx wrangler dev  # local server at http://localhost:8787/mcp
```
