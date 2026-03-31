/**
 * app/api/graph/route.ts
 * Returns overall graph stats, top users, and top repos.
 *
 * GET /api/graph
 * GET /api/graph?search=react
 */

import { NextRequest, NextResponse } from "next/server";
import { listUsers, listTopRepos, getGraphStats, searchNodes } from "@/lib/graph-queries";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("search");
  const limit = Math.min(Number(searchParams.get("limit") ?? 50), 200);
  const skip = Number(searchParams.get("skip") ?? 0);

  try {
    if (q) {
      const results = await searchNodes(q, limit);
      return NextResponse.json({ results }, {
        headers: { "Cache-Control": "s-maxage=60" },
      });
    }

    const [stats, users, repos] = await Promise.all([
      getGraphStats(),
      listUsers(limit, skip),
      listTopRepos(20),
    ]);

    return NextResponse.json({ stats, users, repos }, {
      headers: { "Cache-Control": "s-maxage=120, stale-while-revalidate=60" },
    });
  } catch (err) {
    console.error("[/api/graph]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
