/**
 * src/lib/neo4j.ts
 * Neo4j AuraDB connection singleton.
 * Uses the official neo4j-driver; compatible with AuraDB Free (bolt+s / neo4j+s).
 *
 * In serverless environments (Vercel/Netlify) the driver is cached on the
 * module level so it survives warm function invocations.
 */

import neo4j, { Driver, Session, QueryResult, RecordShape } from "neo4j-driver";

// ── Singleton ─────────────────────────────────────────────────────────────────

let _driver: Driver | null = null;

function getDriver(): Driver {
  if (_driver) return _driver;

  const uri = process.env.NEO4J_URI;
  const user = process.env.NEO4J_USERNAME ?? "neo4j";
  const password = process.env.NEO4J_PASSWORD;

  if (!uri || !password) {
    throw new Error(
      "Missing Neo4j credentials. Set NEO4J_URI and NEO4J_PASSWORD in your environment."
    );
  }

  _driver = neo4j.driver(uri, neo4j.auth.basic(user, password), {
  maxConnectionPoolSize: 10,
  connectionAcquisitionTimeout: 10_000,
});

  return _driver;
}

/** Close the driver — call this in scripts after all writes finish. */
export async function closeDriver(): Promise<void> {
  if (_driver) {
    await _driver.close();
    _driver = null;
  }
}

// ── Query helpers ─────────────────────────────────────────────────────────────

/**
 * Run a Cypher read query and return all records.
 * Automatically opens and closes a session.
 */
export async function runReadQuery<T extends RecordShape = RecordShape>(
  cypher: string,
  params: Record<string, unknown> = {}
): Promise<QueryResult<T>> {
  const driver = getDriver();
  const session = driver.session({ defaultAccessMode: neo4j.session.READ });
  try {
    return await session.run<T>(cypher, params);
  } finally {
    await session.close();
  }
}

/**
 * Run a Cypher write query (CREATE / MERGE / SET / DELETE).
 */
export async function runWriteQuery<T extends RecordShape = RecordShape>(
  cypher: string,
  params: Record<string, unknown> = {}
): Promise<QueryResult<T>> {
  const driver = getDriver();
  const session = driver.session({ defaultAccessMode: neo4j.session.WRITE });
  try {
    return await session.executeWrite((tx) => tx.run<T>(cypher, params));
  } finally {
    await session.close();
  }
}

/**
 * Run multiple write queries inside a single transaction for efficiency.
 * Each item in `queries` is { cypher, params }.
 */
export async function runWriteBatch(
  queries: Array<{ cypher: string; params?: Record<string, unknown> }>
): Promise<void> {
  const driver = getDriver();
  const session: Session = driver.session({ defaultAccessMode: neo4j.session.WRITE });
  try {
    await session.executeWrite(async (tx) => {
      for (const { cypher, params = {} } of queries) {
        await tx.run(cypher, params);
      }
    });
  } finally {
    await session.close();
  }
}

// ── Schema initialiser ────────────────────────────────────────────────────────

/**
 * Create indexes and constraints the first time the database is set up.
 * Safe to call multiple times (uses CREATE IF NOT EXISTS).
 */
export async function initSchema(): Promise<void> {
  const constraints = [
    "CREATE CONSTRAINT user_login_unique IF NOT EXISTS FOR (u:User) REQUIRE u.login IS UNIQUE",
    "CREATE CONSTRAINT repo_fullname_unique IF NOT EXISTS FOR (r:Repo) REQUIRE r.fullName IS UNIQUE",
    "CREATE CONSTRAINT language_name_unique IF NOT EXISTS FOR (l:Language) REQUIRE l.name IS UNIQUE",
    "CREATE CONSTRAINT topic_name_unique IF NOT EXISTS FOR (t:Topic) REQUIRE t.name IS UNIQUE",
  ];

  const driver = getDriver();
  const session: Session = driver.session({ defaultAccessMode: neo4j.session.WRITE });
  try {
    for (const stmt of constraints) {
      await session.run(stmt);
    }
    console.log("✅ Neo4j schema initialised");
  } finally {
    await session.close();
  }
}
