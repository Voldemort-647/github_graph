# GitHub Graph Explorer

> Visualise GitHub social & contribution networks stored in Neo4j AuraDB,
> served through thin Vercel/Netlify serverless functions.

```
repo/
  src/
    lib/
      github.ts          ← GitHub REST API client (read-only, public data)
      neo4j.ts           ← Neo4j AuraDB driver singleton + query helpers
      graph-write.ts     ← Cypher MERGE operations (importer uses these)
      graph-queries.ts   ← Cypher READ operations (API endpoints use these)
    ui/
      components/
        GraphCanvas.tsx  ← D3 force-directed graph (client-side)
        SearchBar.tsx
        StatsBar.tsx
        NodeDetail.tsx
        Sidebar.tsx
  scripts/
    import-github.ts     ← Local importer — run from your laptop
  app/
    api/
      user/[login]/route.ts    ← GET /api/user/:login
      graph/route.ts           ← GET /api/graph
      repo/[owner]/[name]/route.ts  ← GET /api/repo/:owner/:name
    page.tsx             ← Main React UI
    layout.tsx
    globals.css
  netlify/
    functions/
      user-graph.ts      ← Netlify adapter for user graph
      graph-overview.ts  ← Netlify adapter for graph overview
  vercel.json
  netlify.toml
  .env.example
```

---

## Prerequisites

| Tool | Version |
|------|---------|
| Node.js | ≥ 20 |
| npm | ≥ 9 |

---

## Quick start

### 1. Clone and install

```bash
git clone <your-repo>
cd github-graph-explorer
npm install
```

### 2. Configure environment

```bash
cp .env.example .env.local
```

Open `.env.local` and fill in:

| Variable | Where to get it |
|----------|----------------|
| `GITHUB_TOKEN` | [github.com/settings/tokens](https://github.com/settings/tokens) — no scopes needed for public data |
| `NEO4J_URI` | [console.neo4j.io](https://console.neo4j.io) → Create Free Instance → copy URI |
| `NEO4J_USERNAME` | From AuraDB instance credentials (default: `neo4j`) |
| `NEO4J_PASSWORD` | From AuraDB instance credentials |
| `SEED_USERS` | Comma-separated GitHub logins (e.g. `torvalds,gaearon`) |

### 3. Initialise the Neo4j schema

```bash
npm run import -- --user torvalds --init-schema
```

This creates uniqueness constraints for User, Repo, Language, Topic nodes.
It's safe to run multiple times.

### 4. Import data

```bash
# Import a single user (1 hop = user + their direct neighbours)
npm run import -- --user torvalds

# Import from SEED_USERS in .env.local
npm run import:seed

# Import with 2 hops (fetches followers-of-followers — uses more rate limit)
npm run import -- --user torvalds --depth 2

# Skip contributor fetching to save rate limit quota
npm run import -- --user torvalds --skip-contributors
```

> **Rate limits:** Authenticated requests get 5 000 req/hr.
> A single-user import at depth 1 typically uses ~50–200 requests depending
> on follower count and repo count.

### 5. Run the dev server

```bash
npm run dev
# → http://localhost:3000
```

Search any imported username to explore their graph.

---

## Graph Schema

```
(:User   { login, name, avatarUrl, htmlUrl, bio, company, location,
           publicRepos, followers, following, createdAt })

(:Repo   { fullName, name, htmlUrl, description, stars, forks,
           language, archived, createdAt })

(:Language { name })

(:Topic    { name })

(:User)-[:FOLLOWS]->(:User)
(:User)-[:OWNS]->(:Repo)
(:User)-[:CONTRIBUTED_TO { commits }]->(:Repo)
(:User)-[:STARRED]->(:Repo)
(:Repo)-[:USES_LANGUAGE { bytes }]->(:Language)
(:Repo)-[:HAS_TOPIC]->(:Topic)
```

---

## API Reference

All endpoints are read-only and return JSON.
They query Neo4j directly — no direct GitHub API calls unless `?refresh=1`.

### `GET /api/user/:login`

Returns graph nodes + edges centred on a user.

| Param | Default | Description |
|-------|---------|-------------|
| `hops` | `1` | Neighbourhood depth (1 or 2) |
| `refresh` | `0` | Set to `1` to pull fresh data from GitHub |

```json
{
  "nodes": [
    { "id": "user:torvalds", "label": "User", "login": "torvalds", "name": "Linus Torvalds", "avatarUrl": "...", "htmlUrl": "..." },
    { "id": "repo:torvalds/linux", "label": "Repo", "name": "linux", "stars": 170000, "forks": 52000 }
  ],
  "edges": [
    { "source": "user:torvalds", "target": "repo:torvalds/linux", "type": "OWNS" }
  ]
}
```

### `GET /api/graph`

Returns overall graph statistics plus paginated user/repo lists.

| Param | Default | Description |
|-------|---------|-------------|
| `search` | — | Full-text search across users and repos |
| `limit` | `50` | Max nodes to return |
| `skip` | `0` | Pagination offset |

### `GET /api/repo/:owner/:name`

Returns detailed data for a single repository including contributors, languages, and topics.

---

## Deployment

### Vercel (recommended)

1. Push your repo to GitHub.
2. Import it at [vercel.com/new](https://vercel.com/new).
3. Add the environment variables from `.env.example` in the Vercel dashboard.
4. Deploy. Vercel auto-detects Next.js and wires up the `/app/api` route handlers.

**Free tier limits to be aware of:**
- Function duration: 10s (Hobby) — Neo4j queries are typically <1s
- Bandwidth: 100 GB/month
- Serverless invocations: 100 000/month

### Netlify (alternative)

1. Connect your repo at [app.netlify.com](https://app.netlify.com).
2. Set the publish directory to `.next`.
3. Add environment variables in Site settings → Environment variables.
4. The `netlify.toml` redirect rules map `/api/*` to the functions in `netlify/functions/`.

**Free tier limits:**
- 125 000 function invocations/month
- 100 GB bandwidth/month
- Background functions not available on free tier (not needed here)

---

## Architecture decisions

| Decision | Rationale |
|----------|-----------|
| **Local importer, not a server job** | GitHub rate limits + AuraDB Free connection limits make bulk imports unsuitable for serverless functions. Running from your laptop on-demand is safer and simpler. |
| **Neo4j AuraDB Free** | Managed, no credit card required, sufficient for a personal graph of a few thousand nodes. |
| **MERGE everywhere** | All Cypher writes use MERGE so re-running the importer is fully idempotent. |
| **Thin API layer** | The browser never touches GitHub or Neo4j directly — secrets stay server-side. |
| **D3 force graph client-side** | Offloads graph layout computation to the client, keeping serverless functions fast. |
| **Shared lib modules** | `src/lib/` is platform-agnostic; Vercel route handlers and Netlify functions are tiny adapters that just call the shared code. |

---

## Rate limit tips

- Always set `GITHUB_TOKEN` — it raises your limit from 60 to 5 000 req/hr.
- Keep `MAX_PAGES=1` or `MAX_PAGES=2` for large accounts.
- Use `--skip-contributors` when you only care about the social graph.
- The `?refresh=1` endpoint param only refreshes one user's first page of followers/repos (~10 calls), not a full re-import.
