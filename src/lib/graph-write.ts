/**
 * src/lib/graph-write.ts
 * All Cypher MERGE/CREATE operations that persist GitHub data into Neo4j.
 * Called by the importer script (and optionally by the /api/refresh endpoint).
 *
 * Design principles:
 *  - Use MERGE everywhere so re-imports are idempotent
 *  - Batch related writes into single transactions for speed
 *  - Avoid storing private or sensitive data (public API only)
 */

import { runWriteQuery, runWriteBatch } from "./neo4j";
import type { GHUser, GHRepo, GHContributor, GHFollower } from "./github";

// ── User ──────────────────────────────────────────────────────────────────────

export async function upsertUser(user: GHUser): Promise<void> {
  await runWriteQuery(
    `
    MERGE (u:User { login: $login })
    SET
      u.name       = $name,
      u.avatarUrl  = $avatarUrl,
      u.htmlUrl    = $htmlUrl,
      u.bio        = $bio,
      u.company    = $company,
      u.location   = $location,
      u.publicRepos = $publicRepos,
      u.followers  = $followers,
      u.following  = $following,
      u.createdAt  = $createdAt,
      u.updatedAt  = datetime()
    `,
    {
      login: user.login,
      name: user.name ?? user.login,
      avatarUrl: user.avatar_url,
      htmlUrl: user.html_url,
      bio: user.bio,
      company: user.company,
      location: user.location,
      publicRepos: user.public_repos,
      followers: user.followers,
      following: user.following,
      createdAt: user.created_at,
    }
  );
}

/** Upsert a minimal user stub (from follower lists where we only have login+avatar). */
export async function upsertUserStub(login: string, avatarUrl: string): Promise<void> {
  await runWriteQuery(
    `
    MERGE (u:User { login: $login })
    ON CREATE SET u.avatarUrl = $avatarUrl, u.updatedAt = datetime()
    `,
    { login, avatarUrl }
  );
}

// ── Follow relationships ──────────────────────────────────────────────────────

export async function upsertFollows(
  followerLogin: string,
  followedLogin: string
): Promise<void> {
  await runWriteQuery(
    `
    MERGE (a:User { login: $from })
    MERGE (b:User { login: $to })
    MERGE (a)-[:FOLLOWS]->(b)
    `,
    { from: followerLogin, to: followedLogin }
  );
}

/** Batch version — more efficient when writing many follow edges at once. */
export async function upsertFollowsBatch(
  sourceLogin: string,
  targets: GHFollower[],
  direction: "FOLLOWS" | "FOLLOWED_BY"
): Promise<void> {
  if (targets.length === 0) return;

  const queries = targets.map(({ login, avatar_url }) => {
    const [from, to] =
      direction === "FOLLOWS" ? [sourceLogin, login] : [login, sourceLogin];
    return {
      cypher: `
        MERGE (a:User { login: $from })
        MERGE (b:User { login: $to })
        ON CREATE SET b.avatarUrl = $avatar
        MERGE (a)-[:FOLLOWS]->(b)
      `,
      params: { from, to, avatar: avatar_url },
    };
  });

  await runWriteBatch(queries);
}

// ── Repository ────────────────────────────────────────────────────────────────

export async function upsertRepo(repo: GHRepo): Promise<void> {
  await runWriteQuery(
    `
    MERGE (r:Repo { fullName: $fullName })
    SET
      r.name        = $name,
      r.htmlUrl     = $htmlUrl,
      r.description = $description,
      r.stars       = $stars,
      r.forks       = $forks,
      r.language    = $language,
      r.archived    = $archived,
      r.createdAt   = $createdAt,
      r.updatedAt   = datetime()
    WITH r
    MERGE (u:User { login: $ownerLogin })
    MERGE (u)-[:OWNS]->(r)
    `,
    {
      fullName: repo.full_name,
      name: repo.name,
      htmlUrl: repo.html_url,
      description: repo.description,
      stars: repo.stargazers_count,
      forks: repo.forks_count,
      language: repo.language,
      archived: repo.archived,
      createdAt: repo.created_at,
      ownerLogin: repo.owner.login,
    }
  );
}

// ── Languages ─────────────────────────────────────────────────────────────────

export async function upsertRepoLanguages(
  repoFullName: string,
  languages: Record<string, number>
): Promise<void> {
  if (Object.keys(languages).length === 0) return;

  const queries = Object.entries(languages).map(([lang, bytes]) => ({
    cypher: `
      MERGE (r:Repo { fullName: $fullName })
      MERGE (l:Language { name: $lang })
      MERGE (r)-[rel:USES_LANGUAGE]->(l)
      SET rel.bytes = $bytes
    `,
    params: { fullName: repoFullName, lang, bytes },
  }));

  await runWriteBatch(queries);
}

// ── Topics ────────────────────────────────────────────────────────────────────

export async function upsertRepoTopics(
  repoFullName: string,
  topics: string[]
): Promise<void> {
  if (topics.length === 0) return;

  const queries = topics.map((topic) => ({
    cypher: `
      MERGE (r:Repo { fullName: $fullName })
      MERGE (t:Topic { name: $topic })
      MERGE (r)-[:HAS_TOPIC]->(t)
    `,
    params: { fullName: repoFullName, topic },
  }));

  await runWriteBatch(queries);
}

// ── Contributors ──────────────────────────────────────────────────────────────

export async function upsertContributors(
  repoFullName: string,
  contributors: GHContributor[]
): Promise<void> {
  if (contributors.length === 0) return;

  const queries = contributors.map(({ login, avatar_url, contributions }) => ({
    cypher: `
      MERGE (u:User { login: $login })
      ON CREATE SET u.avatarUrl = $avatar
      MERGE (r:Repo { fullName: $fullName })
      MERGE (u)-[rel:CONTRIBUTED_TO]->(r)
      SET rel.commits = $contributions
    `,
    params: { login, avatar: avatar_url, fullName: repoFullName, contributions },
  }));

  await runWriteBatch(queries);
}

// ── Stars ─────────────────────────────────────────────────────────────────────

export async function upsertStargazers(
  repoFullName: string,
  stargazers: GHFollower[]
): Promise<void> {
  if (stargazers.length === 0) return;

  const queries = stargazers.map(({ login, avatar_url }) => ({
    cypher: `
      MERGE (u:User { login: $login })
      ON CREATE SET u.avatarUrl = $avatar
      MERGE (r:Repo { fullName: $fullName })
      MERGE (u)-[:STARRED]->(r)
    `,
    params: { login, avatar: avatar_url, fullName: repoFullName },
  }));

  await runWriteBatch(queries);
}
