/**
 * src/lib/github.ts
 * Thin wrapper around the GitHub REST API.
 * All functions are read-only and work with public data.
 * Authenticated requests get 5 000 req/hr (vs 60 for anonymous).
 */

const BASE = "https://api.github.com";

// ── Types ────────────────────────────────────────────────────────────────────

export interface GHUser {
  login: string;
  id: number;
  name: string | null;
  avatar_url: string;
  html_url: string;
  bio: string | null;
  company: string | null;
  location: string | null;
  public_repos: number;
  followers: number;
  following: number;
  created_at: string;
}

export interface GHRepo {
  id: number;
  name: string;
  full_name: string;
  html_url: string;
  description: string | null;
  stargazers_count: number;
  forks_count: number;
  language: string | null;
  topics: string[];
  owner: { login: string };
  fork: boolean;
  archived: boolean;
  created_at: string;
  updated_at: string;
}

export interface GHContributor {
  login: string;
  avatar_url: string;
  contributions: number;
}

export interface GHFollower {
  login: string;
  avatar_url: string;
}

// ── Fetch helper ─────────────────────────────────────────────────────────────

async function ghFetch<T>(path: string, params: Record<string, string | number> = {}): Promise<T> {
  const url = new URL(`${BASE}${path}`);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, String(v)));

  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };

  const token = process.env.GITHUB_TOKEN;
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(url.toString(), { headers });

  // Surface rate-limit information for debugging
  const remaining = res.headers.get("x-ratelimit-remaining");
  const reset = res.headers.get("x-ratelimit-reset");
  if (remaining !== null && Number(remaining) < 10) {
    const resetDate = reset ? new Date(Number(reset) * 1000).toISOString() : "unknown";
    console.warn(`⚠️  GitHub rate limit low: ${remaining} remaining, resets at ${resetDate}`);
  }

  if (res.status === 404) return null as T;
 if (!res.ok) {
  const body = await res.text().catch(() => "");
  // 403 on contributors = repo too large, caller should handle gracefully
  if (res.status === 403) {
    console.warn(`  ⚠️  Skipping ${path} (403: too large or rate limited)`);
    return null as T;
  }
  throw new Error(`GitHub API error ${res.status} on ${path}: ${body}`);
}

  return res.json() as Promise<T>;
}

// ── Public API ────────────────────────────────────────────────────────────────

/** Fetch a single user's public profile. Returns null if not found. */
export async function getUser(login: string): Promise<GHUser | null> {
  return ghFetch<GHUser>(`/users/${login}`);
}

/** Fetch one page of followers (max 100 per page). */
export async function getFollowers(login: string, page = 1, perPage = 30): Promise<GHFollower[]> {
  return ghFetch<GHFollower[]>(`/users/${login}/followers`, { per_page: perPage, page });
}

/** Fetch one page of following. */
export async function getFollowing(login: string, page = 1, perPage = 30): Promise<GHFollower[]> {
  return ghFetch<GHFollower[]>(`/users/${login}/following`, { per_page: perPage, page });
}

/** Fetch public repositories for a user (excludes forks by default). */
export async function getUserRepos(
  login: string,
  page = 1,
  perPage = 30,
  includeForks = false
): Promise<GHRepo[]> {
  const repos = await ghFetch<GHRepo[]>(`/users/${login}/repos`, {
    per_page: perPage,
    page,
    sort: "updated",
  });
  if (!repos) return [];
  return includeForks ? repos : repos.filter((r) => !r.fork);
}

/** Fetch language bytes breakdown for a repo. Returns map of { Language: bytes }. */
export async function getRepoLanguages(owner: string, repo: string): Promise<Record<string, number>> {
  const data = await ghFetch<Record<string, number>>(`/repos/${owner}/${repo}/languages`);
  return data ?? {};
}

/** Fetch top contributors for a repo. */
export async function getContributors(
  owner: string,
  repo: string,
  maxPages = 1
): Promise<GHContributor[]> {
  const all: GHContributor[] = [];
  for (let page = 1; page <= maxPages; page++) {
    const page_data = await ghFetch<GHContributor[] | null>(`/repos/${owner}/${repo}/contributors`, {
      per_page: 30,
      page,
      anon: 0,
    });
    if (!page_data || page_data.length === 0) break;
    all.push(...page_data);
  }
  return all;
}

/** Fetch users who starred a repo (first page only to avoid rate exhaustion). */
export async function getStargazers(
  owner: string,
  repo: string,
  page = 1,
  perPage = 30
): Promise<GHFollower[]> {
  return ghFetch<GHFollower[]>(`/repos/${owner}/${repo}/stargazers`, {
    per_page: perPage,
    page,
  }) ?? [];
}

/** Search public repositories by query string. */
export async function searchRepos(q: string, perPage = 10): Promise<GHRepo[]> {
  const data = await ghFetch<{ items: GHRepo[] }>(`/search/repositories`, {
    q,
    per_page: perPage,
    sort: "stars",
    order: "desc",
  });
  return data?.items ?? [];
}
