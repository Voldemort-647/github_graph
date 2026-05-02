/**
 * app/api/user/[login]/route.ts
 * Returns a user's graph neighbourhood from Neo4j.
 * If the user is not in Neo4j, automatically imports them from GitHub.
 * Optionally does a live refresh from GitHub if ?refresh=1 is passed.
 *
 * GET /api/user/torvalds
 * GET /api/user/torvalds?refresh=1
 * GET /api/user/torvalds?hops=2
 */

import { NextRequest, NextResponse } from "next/server";
import { getUserGraph, getNeighbourhoodGraph } from "@/lib/graph-queries";
import { getUser, getFollowers, getFollowing, getUserRepos, getRepoLanguages, getContributors } from "@/lib/github";
import { upsertUser, upsertFollowsBatch, upsertRepo, upsertRepoLanguages, upsertRepoTopics, upsertContributors } from "@/lib/graph-write";
import { initSchema } from "@/lib/neo4j";

export const runtime = "nodejs"; // neo4j-driver requires Node.js runtime

export async function GET(
  request: NextRequest,
  { params }: { params: { login: string } }
) {
  const { login } = params;
  const { searchParams } = new URL(request.url);
  const shouldRefresh = searchParams.get("refresh") === "1";
  const hops = Math.min(Number(searchParams.get("hops") ?? 1), 2);

  try {
    // Optional: refresh a slice of this user's data from GitHub
    if (shouldRefresh) {
      await refreshUserSlice(login);
    }

    let graph = hops > 1
      ? await getNeighbourhoodGraph(login, hops)
      : await getUserGraph(login);

    // ── Auto-import: if user not in Neo4j, fetch from GitHub and import ──
    if (graph.nodes.length === 0) {
      console.log(`[/api/user] User "${login}" not in Neo4j — attempting live import from GitHub…`);

      const imported = await importUserLive(login);

      if (!imported) {
        return NextResponse.json(
          { error: `User "${login}" not found on GitHub.` },
          { status: 404 }
        );
      }

      // Re-query after import
      graph = hops > 1
        ? await getNeighbourhoodGraph(login, hops)
        : await getUserGraph(login);

      if (graph.nodes.length === 0) {
        return NextResponse.json(
          { error: `User "${login}" was imported but graph is empty. Try again.` },
          { status: 404 }
        );
      }

      return NextResponse.json(graph, {
        headers: {
          "Cache-Control": "s-maxage=300, stale-while-revalidate=60",
          "X-Graph-Source": "imported",
        },
      });
    }

    return NextResponse.json(graph, {
      headers: {
        "Cache-Control": "s-maxage=300, stale-while-revalidate=60",
      },
    });
  } catch (err) {
    console.error("[/api/user]", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// ── Live import: fetch user from GitHub API and write to Neo4j ──────────────

/**
 * Import a user's profile, followers, following, and repos from GitHub into Neo4j.
 * This is a lightweight version of the CLI importer, designed to run within
 * serverless function time limits (~10s on Vercel Hobby, ~30s on Pro).
 *
 * Returns true if the user was found and imported, false if not found on GitHub.
 */
async function importUserLive(login: string): Promise<boolean> {
  // 1. Fetch user profile from GitHub
  const user = await getUser(login);
  if (!user) return false;

  // Ensure schema constraints exist (safe to call multiple times)
  try {
    await initSchema();
  } catch {
    // Schema might already exist, that's fine
  }

  // 2. Upsert user profile
  await upsertUser(user);
  console.log(`  ✓ Profile imported for @${login}`);

  // 3. Fetch followers + following (1 page each to stay fast)
  const [followers, following] = await Promise.all([
    getFollowers(login, 1, 30).catch(() => []),
    getFollowing(login, 1, 30).catch(() => []),
  ]);

  // 4. Write follow relationships
  await Promise.all([
    upsertFollowsBatch(login, followers, "FOLLOWED_BY"),
    upsertFollowsBatch(login, following, "FOLLOWS"),
  ]);
  console.log(`  ✓ ${followers.length} followers, ${following.length} following`);

  // 5. Fetch repos (first page, max 10 to stay within time limits)
  const repos = await getUserRepos(login, 1, 10, false).catch(() => []);

  for (const repo of repos.slice(0, 10)) {
    try {
      await upsertRepo(repo);

      // Languages
      const languages = await getRepoLanguages(repo.owner.login, repo.name).catch(() => ({}));
      if (Object.keys(languages).length > 0) {
        await upsertRepoLanguages(repo.full_name, languages);
      }

      // Topics
      if (repo.topics?.length) {
        await upsertRepoTopics(repo.full_name, repo.topics);
      }

      // Contributors (first page only, max 5)
      const contributors = await getContributors(repo.owner.login, repo.name, 1).catch(() => []);
      if (contributors && contributors.length > 0) {
        await upsertContributors(repo.full_name, contributors.slice(0, 5));
      }
    } catch (err) {
      console.warn(`  ⚠️ Failed to import repo ${repo.full_name}:`, err);
      // Continue with other repos
    }
  }
  console.log(`  ✓ ${repos.length} repos imported for @${login}`);

  return true;
}

/** Refresh one user's profile + repos from GitHub (lightweight, ~10 API calls). */
async function refreshUserSlice(login: string) {
  const user = await getUser(login);
  if (!user) return;

  await upsertUser(user);

  const [followers, following, repos] = await Promise.all([
    getFollowers(login, 1, 30),
    getFollowing(login, 1, 30),
    getUserRepos(login, 1, 10),
  ]);

  await upsertFollowsBatch(login, followers, "FOLLOWED_BY");
  await upsertFollowsBatch(login, following, "FOLLOWS");

  for (const repo of repos.slice(0, 5)) {
    await upsertRepo(repo);
    const langs = await getRepoLanguages(repo.owner.login, repo.name);
    await upsertRepoLanguages(repo.full_name, langs);
    if (repo.topics?.length) await upsertRepoTopics(repo.full_name, repo.topics);
  }
}
