/**
 * app/api/user/[login]/route.ts
 * Returns a user's graph neighbourhood from Neo4j.
 * Optionally does a live refresh from GitHub if ?refresh=1 is passed.
 *
 * GET /api/user/torvalds
 * GET /api/user/torvalds?refresh=1
 * GET /api/user/torvalds?hops=2
 */

import { NextRequest, NextResponse } from "next/server";
import { getUserGraph, getNeighbourhoodGraph } from "@/lib/graph-queries";
import { getUser, getFollowers, getFollowing, getUserRepos, getRepoLanguages } from "@/lib/github";
import { upsertUser, upsertFollowsBatch, upsertRepo, upsertRepoLanguages, upsertRepoTopics } from "@/lib/graph-write";

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

    const graph = hops > 1
      ? await getNeighbourhoodGraph(login, hops)
      : await getUserGraph(login);

    if (graph.nodes.length === 0) {
      return NextResponse.json(
        { error: `User "${login}" not found in graph. Run the importer first.` },
        { status: 404 }
      );
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
