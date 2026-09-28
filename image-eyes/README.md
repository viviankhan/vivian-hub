# Image Eyes — your own image connector for Claude

Image Eyes lets Claude actually look at pictures. It lives in this folder,
runs free on Cloudflare Workers, and you add it to Claude as a custom
connector. Because the code is in your GitHub, it can't go missing.

## What Claude gets

| Tool | What it does |
|---|---|
| `search_images` | Searches the **whole web** (Google Images through SerpApi, or Brave) and returns the pictures plus each one's source page. Without a search key it searches Wikimedia Commons and Openverse only. |
| `view_image` | Looks at an image URL or a page. **Fandom and Wikipedia pages are read through the wiki's own API**, so fandom's 403 doesn't matter, and gallery subpages are searched too. `prefer: "2011 full body -1999"` picks which pictures come back. Thumbnails are swapped for the sharpest size Claude can use (1568 px). |
| `list_wiki_images` | Lists every picture on a wiki page and its galleries as text: filename, **caption**, **section/tab** (e.g. `2011 Anime › Full body`), size and full-size URL. Claude reads this first to pick the right version, then views only what it needs. |

## Setup (one time, about 15 minutes)

### 1. Cloudflare account and keys

1. Sign up free at **dash.cloudflare.com**.
2. **Account ID:** on the account home page, click the **⋯** next to your
   account name → **Copy account ID**. (It's also in the right sidebar of
   **Workers & Pages**.)
3. **API token:** click your profile icon (top right) → **My Profile** →
   **API Tokens** → **Create Token** → use the **Edit Cloudflare Workers**
   template → **Continue to summary** → **Create Token**. Copy the token.
   It's only shown once.
4. Open **Workers & Pages** once, so Cloudflare asks you to pick your free
   `something.workers.dev` subdomain.

### 2. (Optional, recommended) a web image search key

This is what lets Claude find anime characters, products and so on. Pick
one:

- **SerpApi** (Google Images): sign up at **serpapi.com**. The free plan
  includes a limited number of searches a month. Copy your API key from the
  dashboard.
- **Brave Search API**: sign up at **api-dashboard.search.brave.com**, pick
  a plan and copy the key. Check that your plan includes image search.

Without either, everything except web search still works.

### 3. Add GitHub secrets

In the `vivian-hub` repo: **Settings → Secrets and variables → Actions →
New repository secret**. Add:

| Name | Value |
|---|---|
| `CLOUDFLARE_API_TOKEN` | the token from step 1.3 |
| `CLOUDFLARE_ACCOUNT_ID` | the account ID from step 1.2 |
| `IMAGE_EYES_ACCESS_KEY` | any long random password you make up (letters and numbers only). It becomes part of the connector's address so nobody else can use it. |
| `SERPAPI_KEY` *or* `BRAVE_API_KEY` | from step 2 (optional) |

### 4. Deploy

**Actions** tab → **Deploy Image Eyes** → **Run workflow**. (It also runs
by itself whenever `image-eyes/` changes on `main`.) When it's done, open
the run's **Deploy to Cloudflare** step and find the
`https://image-eyes.<subdomain>.workers.dev` address.

Your connector address is:

```
https://image-eyes.<subdomain>.workers.dev/mcp/<IMAGE_EYES_ACCESS_KEY>
```

Opening `https://image-eyes.<subdomain>.workers.dev/` in a browser should
say "Image Eyes MCP server is running."

### 5. Add it to Claude

**claude.ai → Settings → Connectors → Add custom connector**. Name it
**Image Eyes** and paste the address from step 4. Leave the OAuth fields
empty. Then turn it on in your chats. If the old Image Eyes is still
listed, remove it so Claude doesn't mix them up.

## Changing it later

- **Add or change a search key:** update the GitHub secret, then run the
  workflow again.
- **Send images bigger than 2.5 MB:** raise `MAX_IMAGE_BYTES` in
  `wrangler.toml`. Anything over the limit falls back to a smaller copy.

## Troubleshooting

- **Claude says the connector can't be reached:** check the address ends
  in `/mcp/<your access key>` exactly, with no trailing spaces.
- **Web search never happens:** the result will say "no SERPAPI_KEY or
  BRAVE_API_KEY is set". Add one (step 2–3) and redeploy.
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
