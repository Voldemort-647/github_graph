/**
 * netlify/functions/graph-overview.ts
 * Netlify adapter for GET /api/graph
 *
 * Path: /.netlify/functions/graph-overview?search=react&limit=50
 */

import type { Handler, HandlerEvent } from "@netlify/functions";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { listUsers, listTopRepos, getGraphStats, searchNodes } = require("../../src/lib/graph-queries");

export const handler: Handler = async (event: HandlerEvent) => {
  const q = event.queryStringParameters?.search;
  const limit = Math.min(Number(event.queryStringParameters?.limit ?? 50), 200);
  const skip = Number(event.queryStringParameters?.skip ?? 0);

  try {
    if (q) {
      const results = await searchNodes(q, limit);
      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json", "Cache-Control": "s-maxage=60" },
        body: JSON.stringify({ results }),
      };
    }

    const [stats, users, repos] = await Promise.all([
      getGraphStats(),
      listUsers(limit, skip),
      listTopRepos(20),
    ]);

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "s-maxage=120, stale-while-revalidate=60",
      },
      body: JSON.stringify({ stats, users, repos }),
    };
  } catch (err) {
    console.error("[netlify/graph-overview]", err);
    return { statusCode: 500, body: JSON.stringify({ error: "Internal server error" }) };
  }
};
