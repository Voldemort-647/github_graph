/**
 * app/api/repo/[owner]/[name]/route.ts
 * Returns a repo's graph neighbourhood (contributors, languages, topics, owner).
 *
 * GET /api/repo/torvalds/linux
 */

import { NextRequest, NextResponse } from "next/server";
import { runReadQuery } from "@/lib/neo4j";
import neo4j from "neo4j-driver";

export const runtime = "nodejs";

export async function GET(
  _req: NextRequest,
  { params }: { params: { owner: string; name: string } }
) {
  const fullName = `${params.owner}/${params.name}`;

  try {
    const result = await runReadQuery(
      `
      MATCH (r:Repo { fullName: $fullName })
      OPTIONAL MATCH (owner:User)-[:OWNS]->(r)
      OPTIONAL MATCH (contributor:User)-[c:CONTRIBUTED_TO]->(r)
      OPTIONAL MATCH (r)-[:USES_LANGUAGE]->(l:Language)
      OPTIONAL MATCH (r)-[:HAS_TOPIC]->(t:Topic)
      RETURN r,
             owner,
             collect(DISTINCT { login: contributor.login, avatarUrl: contributor.avatarUrl, commits: c.commits }) AS contributors,
             collect(DISTINCT l.name) AS languages,
             collect(DISTINCT t.name) AS topics
      `,
      { fullName }
    );

    if (result.records.length === 0) {
      return NextResponse.json({ error: "Repo not found" }, { status: 404 });
    }

    const rec = result.records[0];
    const repo = rec.get("r").properties;
    const owner = rec.get("owner")?.properties ?? null;
    const contributors = rec.get("contributors") as Array<Record<string, unknown>>;
    const languages = rec.get("languages") as string[];
    const topics = rec.get("topics") as string[];

    const toNum = (v: unknown) => neo4j.isInt(v) ? (v as { toNumber(): number }).toNumber() : Number(v ?? 0);

    return NextResponse.json({
      repo: {
        fullName: String(repo.fullName ?? ""),
        name: String(repo.name ?? ""),
        description: String(repo.description ?? ""),
        stars: toNum(repo.stars),
        forks: toNum(repo.forks),
        htmlUrl: String(repo.htmlUrl ?? ""),
        archived: Boolean(repo.archived),
        language: String(repo.language ?? ""),
      },
      owner: owner ? {
        login: String(owner.login ?? ""),
        name: String(owner.name ?? owner.login ?? ""),
        avatarUrl: String(owner.avatarUrl ?? ""),
      } : null,
      contributors: contributors.filter(c => c.login).map(c => ({
        login: String(c.login ?? ""),
        avatarUrl: String(c.avatarUrl ?? ""),
        commits: toNum(c.commits),
      })),
      languages: languages.filter(Boolean),
      topics: topics.filter(Boolean),
    }, {
      headers: { "Cache-Control": "s-maxage=300, stale-while-revalidate=60" },
    });
  } catch (err) {
    console.error("[/api/repo]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
