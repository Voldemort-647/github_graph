#!/usr/bin/env ts-node
/**
 * scripts/import-github.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Local importer — run from your laptop, not from a serverless function.
 *
 * Usage:
 *   npm run import -- --user torvalds        # import one user
 *   npm run import:seed                      # import SEED_USERS from .env
 *   npm run import -- --user torvalds --depth 2  # pull followers' data too
 *
 * Flags:
 *   --user <login>      GitHub login to start from
 *   --seed              Read comma-separated logins from SEED_USERS env var
 *   --depth <n>         How many hops to follow (default 1, max 2)
 *   --skip-contributors Don't fetch contributor lists (saves rate limit quota)
 *   --skip-stars        Don't fetch stargazer lists
 *   --init-schema       Create Neo4j constraints/indexes before importing
 */

import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config(); // fallback to .env

import {
  getUser,
  getFollowers,
  getFollowing,
  getUserRepos,
  getRepoLanguages,
  getContributors,
} from "../src/lib/github";

import {
  upsertUser,
  upsertFollowsBatch,
  upsertRepo,
  upsertRepoLanguages,
  upsertRepoTopics,
  upsertContributors,
} from "../src/lib/graph-write";

import { initSchema, closeDriver } from "../src/lib/neo4j";

// ── CLI args ─────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const getArg = (flag: string) => {
  const i = args.indexOf(flag);
  return i !== -1 ? args[i + 1] : undefined;
};
const hasFlag = (flag: string) => args.includes(flag);

const DEPTH = Math.min(Number(getArg("--depth") ?? 1), 2);
const SKIP_CONTRIBUTORS = hasFlag("--skip-contributors");
const SKIP_STARS = hasFlag("--skip-stars");
const INIT_SCHEMA = hasFlag("--init-schema");
const MAX_PAGES = Math.min(Number(process.env.MAX_PAGES ?? 2), 10);
const MAX_REPOS = Number(process.env.MAX_REPOS_PER_USER ?? 20);
const MAX_CONTRIBUTORS = Number(process.env.MAX_CONTRIBUTORS_PER_REPO ?? 10);

// ── Entry point ───────────────────────────────────────────────────────────────

async function main() {
  const startLogins: string[] = [];

  if (hasFlag("--seed")) {
    const seed = process.env.SEED_USERS ?? "";
    startLogins.push(...seed.split(",").map((s) => s.trim()).filter(Boolean));
  } else {
    const userArg = getArg("--user");
    if (!userArg) {
      console.error("Usage: npm run import -- --user <login>  OR  npm run import:seed");
      process.exit(1);
    }
    startLogins.push(userArg);
  }

  console.log(`\n🚀 GitHub Graph Importer`);
  console.log(`   Seed users : ${startLogins.join(", ")}`);
  console.log(`   Depth      : ${DEPTH}`);
  console.log(`   Max pages  : ${MAX_PAGES}`);
  console.log(`   Max repos  : ${MAX_REPOS}`);
  console.log("");

  if (INIT_SCHEMA) await initSchema();

  const visited = new Set<string>();

  for (const login of startLogins) {
    await importUser(login, DEPTH, visited);
  }

  console.log(`\n✅ Import complete. Processed ${visited.size} unique users.`);
  await closeDriver();
}

// ── Core import logic ─────────────────────────────────────────────────────────

async function importUser(login: string, depth: number, visited: Set<string>) {
  if (visited.has(login)) return;
  visited.add(login);

  console.log(`\n👤 Importing user: ${login} (depth=${depth})`);

  // 1. Fetch & upsert user profile
  const user = await getUser(login);
  if (!user) {
    console.warn(`  ⚠️  User ${login} not found on GitHub`);
    return;
  }
  await upsertUser(user);
  console.log(`  ✓ Profile saved`);

  // 2. Followers + following (multiple pages)
  const followers = await fetchAllPages((page) => getFollowers(login, page, 30), MAX_PAGES);
  const following = await fetchAllPages((page) => getFollowing(login, page, 30), MAX_PAGES);

  await upsertFollowsBatch(login, followers, "FOLLOWED_BY");
  await upsertFollowsBatch(login, following, "FOLLOWS");
  console.log(`  ✓ ${followers.length} followers, ${following.length} following`);

  // 3. Repositories
  const repos = await fetchAllPages((page) => getUserRepos(login, page, 30, false), Math.ceil(MAX_REPOS / 30));

  let repoCount = 0;
  for (const repo of repos.slice(0, MAX_REPOS)) {
    await upsertRepo(repo);

    // Languages
    const languages = await getRepoLanguages(repo.owner.login, repo.name);
    await upsertRepoLanguages(repo.full_name, languages);

    // Topics
    if (repo.topics?.length) {
      await upsertRepoTopics(repo.full_name, repo.topics);
    }

    // Contributors
    if (!SKIP_CONTRIBUTORS) {
  const contributors = await getContributors(repo.owner.login, repo.name, 1);
  if (contributors && contributors.length > 0) {
    await upsertContributors(repo.full_name, contributors.slice(0, MAX_CONTRIBUTORS));
  }
}

    repoCount++;
  }
  console.log(`  ✓ ${repoCount} repos imported`);

  // 4. Recurse into followers/following if depth allows
  if (depth > 1) {
    const nextBatch = [...followers, ...following].slice(0, 10); // limit recursion breadth
    console.log(`  ↳ Recursing into ${nextBatch.length} neighbours (depth=${depth - 1})…`);
    for (const neighbour of nextBatch) {
      await importUser(neighbour.login, depth - 1, visited);
      await sleep(300); // be kind to the API
    }
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function fetchAllPages<T>(
  fetchPage: (page: number) => Promise<T[]>,
  maxPages: number
): Promise<T[]> {
  const all: T[] = [];
  for (let page = 1; page <= maxPages; page++) {
    const items = await fetchPage(page);
    all.push(...items);
    if (items.length < 30) break; // last page
    await sleep(200);
  }
  return all;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── Run ───────────────────────────────────────────────────────────────────────

main().catch((err) => {
  console.error("❌ Fatal error:", err);
  closeDriver().finally(() => process.exit(1));
});
