/**
 * src/lib/graph-queries.ts
 * All Cypher READ queries used by the API endpoints.
 * Returns plain JS objects (no neo4j Integer types) for JSON serialisation.
 */

import { runReadQuery } from "./neo4j";
import neo4j from "neo4j-driver";

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Convert neo4j Integer objects and Date types to plain JS. */
function toPlain(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (neo4j.isInt(v)) result[k] = (v as { toNumber(): number }).toNumber();
    else if (v !== null && typeof v === "object" && "toString" in (v as object))
      result[k] = (v as { toString(): string }).toString();
    else result[k] = v;
  }
  return result;
}

// ── Types returned to the frontend ────────────────────────────────────────────

export interface GraphNode {
  id: string;
  label: string; // "User" | "Repo" | "Language" | "Topic"
  login?: string;
  name?: string;
  avatarUrl?: string;
  stars?: number;
  forks?: number;
  htmlUrl?: string;
  description?: string;
}

export interface GraphEdge {
  source: string;
  target: string;
  type: string; // "FOLLOWS" | "OWNS" | "CONTRIBUTED_TO" | "STARRED" | "USES_LANGUAGE" | "HAS_TOPIC"
  weight?: number;
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

// ── User queries ──────────────────────────────────────────────────────────────

/** Return a single user node with their repos, languages, and first-degree connections. */
export async function getUserGraph(login: string, depth = 1): Promise<GraphData> {
  const result = await runReadQuery(
    `
    MATCH (u:User { login: $login })
    OPTIONAL MATCH (u)-[:OWNS]->(r:Repo)
    OPTIONAL MATCH (r)-[:USES_LANGUAGE]->(l:Language)
    OPTIONAL MATCH (u)-[:FOLLOWS]->(f:User)
    OPTIONAL MATCH (follower:User)-[:FOLLOWS]->(u)
    OPTIONAL MATCH (u)-[:CONTRIBUTED_TO]->(cr:Repo)

    WITH u, 
         collect(DISTINCT r)  AS repos,
         collect(DISTINCT l)  AS langs,
         collect(DISTINCT f)  AS following,
         collect(DISTINCT follower) AS followers,
         collect(DISTINCT cr) AS contributions

    RETURN u, repos, langs, following, followers, contributions
    `,
    { login }
  );

  if (result.records.length === 0) return { nodes: [], edges: [] };

  const rec = result.records[0];
  const user = rec.get("u").properties;
  const repos = rec.get("repos") as Array<{ properties: Record<string, unknown> }>;
  const langs = rec.get("langs") as Array<{ properties: Record<string, unknown> }>;
  const following = rec.get("following") as Array<{ properties: Record<string, unknown> }>;
  const followers = rec.get("followers") as Array<{ properties: Record<string, unknown> }>;
  const contributions = rec.get("contributions") as Array<{ properties: Record<string, unknown> }>;

  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const seen = new Set<string>();

  const addUser = (u: Record<string, unknown>, label = "User") => {
    const id = `user:${u.login}`;
    if (seen.has(id)) return id;
    seen.add(id);
    nodes.push({ id, label, login: String(u.login ?? ""), name: String(u.name ?? u.login ?? ""), avatarUrl: String(u.avatarUrl ?? ""), htmlUrl: String(u.htmlUrl ?? "") });
    return id;
  };

  const addRepo = (r: Record<string, unknown>) => {
    const id = `repo:${r.fullName}`;
    if (seen.has(id)) return id;
    seen.add(id);
    nodes.push({ id, label: "Repo", name: String(r.name ?? ""), stars: Number(r.stars ?? 0), forks: Number(r.forks ?? 0), htmlUrl: String(r.htmlUrl ?? ""), description: String(r.description ?? "") });
    return id;
  };

  const addLang = (l: Record<string, unknown>) => {
    const id = `lang:${l.name}`;
    if (seen.has(id)) return id;
    seen.add(id);
    nodes.push({ id, label: "Language", name: String(l.name ?? "") });
    return id;
  };

  const uid = addUser(toPlain(user));

  repos.filter(Boolean).forEach((r) => {
    const rid = addRepo(toPlain(r.properties));
    edges.push({ source: uid, target: rid, type: "OWNS" });
  });

  langs.filter(Boolean).forEach((l) => {
    addLang(toPlain(l.properties));
  });

  following.filter(Boolean).forEach((f) => {
    const fid = addUser(toPlain(f.properties));
    edges.push({ source: uid, target: fid, type: "FOLLOWS" });
  });

  followers.filter(Boolean).forEach((f) => {
    const fid = addUser(toPlain(f.properties));
    edges.push({ source: fid, target: uid, type: "FOLLOWS" });
  });

  contributions.filter(Boolean).forEach((r) => {
    const rid = addRepo(toPlain(r.properties));
    edges.push({ source: uid, target: rid, type: "CONTRIBUTED_TO" });
  });

  return { nodes, edges };
}

/** Neighbourhood graph — user + N hops. */
export async function getNeighbourhoodGraph(login: string, hops = 2): Promise<GraphData> {
  const result = await runReadQuery(
    `
    MATCH path = (start:User { login: $login })-[*1..${Math.min(hops, 3)}]-(neighbour)
    WITH nodes(path) AS ns, relationships(path) AS rels
    UNWIND ns AS n
    WITH collect(DISTINCT n) AS allNodes, rels
    UNWIND rels AS r
    RETURN allNodes, collect(DISTINCT r) AS allRels
    `,
    { login }
  );

  if (result.records.length === 0) return { nodes: [], edges: [] };

  const rec = result.records[0];
  const rawNodes = rec.get("allNodes") as Array<{ labels: string[]; properties: Record<string, unknown>; elementId: string }>;
  const rawRels = rec.get("allRels") as Array<{ type: string; startNodeElementId: string; endNodeElementId: string; properties: Record<string, unknown> }>;

  const idMap = new Map<string, string>();
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];

  rawNodes.filter(Boolean).forEach((n) => {
    const props = toPlain(n.properties);
    const label = n.labels[0] ?? "Unknown";
    let id: string;
    if (label === "User") id = `user:${props.login}`;
    else if (label === "Repo") id = `repo:${props.fullName ?? props.name}`;
    else if (label === "Language") id = `lang:${props.name}`;
    else id = `topic:${props.name}`;

    idMap.set(n.elementId, id);

    nodes.push({
      id,
      label,
      login: label === "User" ? String(props.login ?? "") : undefined,
      name: String(props.name ?? props.login ?? ""),
      avatarUrl: label === "User" ? String(props.avatarUrl ?? "") : undefined,
      stars: label === "Repo" ? Number(props.stars ?? 0) : undefined,
      htmlUrl: String(props.htmlUrl ?? ""),
    });
  });

  rawRels.filter(Boolean).forEach((r) => {
    const source = idMap.get(r.startNodeElementId);
    const target = idMap.get(r.endNodeElementId);
    if (source && target) {
      edges.push({ source, target, type: r.type, weight: Number((r.properties as Record<string, unknown>).commits ?? 1) });
    }
  });

  return { nodes, edges };
}

/** List all users in the graph (paginated). */
export async function listUsers(limit = 50, skip = 0): Promise<GraphNode[]> {
  const result = await runReadQuery(
    `
    MATCH (u:User)
    RETURN u
    ORDER BY u.followers DESC
    SKIP $skip LIMIT $limit
    `,
    { limit, skip }
  );

  return result.records.map((r) => {
    const u = toPlain(r.get("u").properties);
    return {
      id: `user:${u.login}`,
      label: "User",
      login: String(u.login ?? ""),
      name: String(u.name ?? u.login ?? ""),
      avatarUrl: String(u.avatarUrl ?? ""),
      htmlUrl: String(u.htmlUrl ?? ""),
    };
  });
}

/** List top repos by stars. */
export async function listTopRepos(limit = 20): Promise<GraphNode[]> {
  const result = await runReadQuery(
    `
    MATCH (r:Repo)
    RETURN r
    ORDER BY r.stars DESC
    LIMIT $limit
    `,
    { limit }
  );

  return result.records.map((r) => {
    const repo = toPlain(r.get("r").properties);
    return {
      id: `repo:${repo.fullName}`,
      label: "Repo",
      name: String(repo.name ?? ""),
      stars: Number(repo.stars ?? 0),
      forks: Number(repo.forks ?? 0),
      htmlUrl: String(repo.htmlUrl ?? ""),
      description: String(repo.description ?? ""),
    };
  });
}

/** Get graph stats (node counts per label). */
export async function getGraphStats(): Promise<Record<string, number>> {
  const result = await runReadQuery(`
    CALL apoc.meta.stats() YIELD labels
    RETURN labels
  `).catch(() => null);

  // Fallback if APOC not available
  const fallback = await runReadQuery(`
    MATCH (n)
    RETURN labels(n)[0] AS label, count(n) AS cnt
    ORDER BY label
  `);

  const stats: Record<string, number> = {};
  fallback.records.forEach((r) => {
    stats[r.get("label")] = Number(r.get("cnt"));
  });
  return stats;
}

/** Search nodes by name or login. */
export async function searchNodes(q: string, limit = 20): Promise<GraphNode[]> {
  const result = await runReadQuery(
    `
    CALL {
      MATCH (u:User)
      WHERE toLower(u.login) CONTAINS toLower($q) OR toLower(coalesce(u.name,'')) CONTAINS toLower($q)
      RETURN u AS node, 'User' AS label
      LIMIT $limit
    UNION
      MATCH (r:Repo)
      WHERE toLower(r.name) CONTAINS toLower($q) OR toLower(coalesce(r.description,'')) CONTAINS toLower($q)
      RETURN r AS node, 'Repo' AS label
      LIMIT $limit
    }
    RETURN node, label
    LIMIT $limit
    `,
    { q, limit }
  );

  return result.records.map((r) => {
    const n = toPlain(r.get("node").properties);
    const label = r.get("label") as string;
    return {
      id: label === "User" ? `user:${n.login}` : `repo:${n.fullName ?? n.name}`,
      label,
      login: label === "User" ? String(n.login ?? "") : undefined,
      name: String(n.name ?? n.login ?? ""),
      avatarUrl: label === "User" ? String(n.avatarUrl ?? "") : undefined,
      stars: label === "Repo" ? Number(n.stars ?? 0) : undefined,
      htmlUrl: String(n.htmlUrl ?? ""),
    };
  });
}
