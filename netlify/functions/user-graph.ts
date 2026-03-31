/**
 * netlify/functions/user-graph.ts
 * Netlify adapter for GET /api/user/:login
 *
 * Path: /.netlify/functions/user-graph?login=torvalds&hops=1
 *
 * Deploy via: netlify.toml redirect rules (see netlify.toml)
 */

import type { Handler, HandlerEvent } from "@netlify/functions";

// Netlify bundles TS; just re-use the shared lib modules
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { getUserGraph, getNeighbourhoodGraph } = require("../../src/lib/graph-queries");

export const handler: Handler = async (event: HandlerEvent) => {
  const login = event.queryStringParameters?.login;
  const hops = Math.min(Number(event.queryStringParameters?.hops ?? 1), 2);

  if (!login) {
    return { statusCode: 400, body: JSON.stringify({ error: "Missing ?login= parameter" }) };
  }

  try {
    const graph = hops > 1
      ? await getNeighbourhoodGraph(login, hops)
      : await getUserGraph(login);

    if (graph.nodes.length === 0) {
      return { statusCode: 404, body: JSON.stringify({ error: `User "${login}" not found` }) };
    }

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "s-maxage=300",
      },
      body: JSON.stringify(graph),
    };
  } catch (err) {
    console.error("[netlify/user-graph]", err);
    return { statusCode: 500, body: JSON.stringify({ error: "Internal server error" }) };
  }
};
