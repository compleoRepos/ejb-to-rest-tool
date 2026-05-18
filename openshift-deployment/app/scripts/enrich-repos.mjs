/**
 * Enrich 100K GitHub repos with full metadata.
 * Uses GitHub GraphQL API via native fetch (Node 18+).
 * Processes repos in batches of 20 (GraphQL), with REST fallback.
 * 
 * Rate limits: 5000 points/hour (GraphQL), 5000 req/hour (REST).
 * With batch of 20: ~250 GraphQL calls = 5000 repos/batch-cycle.
 */

import { createConnection } from 'mysql2/promise';
import { writeFileSync, readFileSync, existsSync } from 'fs';

const GH_TOKEN = 'YOUR_GITHUB_TOKEN_HERE';
const GRAPHQL_BATCH = 20;  // repos per GraphQL query (safe limit)
const DB_BATCH = 200;      // DB updates per flush
const PROGRESS_FILE = '/tmp/enrich-progress.json';

function loadProgress() {
  if (existsSync(PROGRESS_FILE)) {
    return JSON.parse(readFileSync(PROGRESS_FILE, 'utf-8'));
  }
  return { lastProcessedId: 0, enrichedCount: 0, failedCount: 0, startedAt: new Date().toISOString() };
}

function saveProgress(progress) {
  writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2));
}

function extractFullName(gitUrl) {
  if (!gitUrl) return null;
  const match = gitUrl.match(/github\.com\/([^\/]+\/[^\/\s]+)/);
  return match ? match[1].replace(/\.git$/, '') : null;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Batch fetch using GitHub GraphQL API via native fetch.
 */
async function fetchRepoBatchGraphQL(repos) {
  const fragments = repos.map((r, i) => {
    const [owner, name] = r.fullName.split('/');
    return `repo${i}: repository(owner: "${owner}", name: "${name}") {
      stargazerCount
      forkCount
      issues(states: OPEN) { totalCount }
      watchers { totalCount }
      diskUsage
      primaryLanguage { name }
      repositoryTopics(first: 20) { nodes { topic { name } } }
      licenseInfo { spdxId }
      owner { login }
      nameWithOwner
      defaultBranchRef { name }
      isArchived
      isFork
      pushedAt
      createdAt
    }`;
  });

  const query = `{ ${fragments.join('\n')} }`;

  try {
    const response = await fetch('https://api.github.com/graphql', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GH_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query }),
    });

    if (!response.ok) {
      if (response.status === 403) {
        console.log('  Rate limited! Waiting 60s...');
        await sleep(60000);
        return null;
      }
      return null;
    }

    const json = await response.json();
    if (!json.data) {
      if (json.errors) {
        // Some repos may not exist, partial results are fine
        // console.log(`  GraphQL partial errors: ${json.errors.length}`);
      }
      if (!json.data) return null;
    }

    return repos.map((r, i) => {
      const d = json.data[`repo${i}`];
      if (!d) return null;
      return {
        id: r.id,
        stars: d.stargazerCount || 0,
        forks: d.forkCount || 0,
        openIssues: d.issues?.totalCount || 0,
        watchers: d.watchers?.totalCount || 0,
        size: d.diskUsage || 0,
        primaryLanguage: d.primaryLanguage?.name || null,
        topics: d.repositoryTopics?.nodes?.map(n => n.topic.name) || [],
        license: d.licenseInfo?.spdxId || null,
        owner: d.owner?.login || null,
        fullName: d.nameWithOwner || r.fullName,
        defaultBranch: d.defaultBranchRef?.name || 'main',
        isArchived: d.isArchived || false,
        isFork: d.isFork || false,
        lastPushAt: d.pushedAt || null,
        githubCreatedAt: d.createdAt || null,
      };
    });
  } catch (e) {
    console.error(`  GraphQL error: ${e.message}`);
    return null;
  }
}

/**
 * REST fallback for individual repos.
 */
async function fetchRepoREST(fullName) {
  try {
    const response = await fetch(`https://api.github.com/repos/${fullName}`, {
      headers: {
        'Authorization': `Bearer ${GH_TOKEN}`,
        'Accept': 'application/vnd.github+json',
      },
    });
    if (!response.ok) return null;
    const d = await response.json();
    return {
      stars: d.stargazers_count || 0,
      forks: d.forks_count || 0,
      openIssues: d.open_issues_count || 0,
      watchers: d.watchers_count || 0,
      size: d.size || 0,
      primaryLanguage: d.language || null,
      topics: d.topics || [],
      license: d.license?.spdx_id || null,
      owner: d.owner?.login || null,
      fullName: d.full_name || fullName,
      defaultBranch: d.default_branch || 'main',
      isArchived: d.archived || false,
      isFork: d.fork || false,
      lastPushAt: d.pushed_at || null,
      githubCreatedAt: d.created_at || null,
    };
  } catch (e) {
    return null;
  }
}

async function main() {
  console.log('=== GitHub Repos Enrichment Script ===');
  console.log(`Started at: ${new Date().toISOString()}`);
  console.log(`GraphQL batch size: ${GRAPHQL_BATCH}`);

  // Load .env
  try {
    const { config } = await import('dotenv');
    config({ path: '/home/ubuntu/ejb-client-modernizer/.env' });
  } catch (e) {}

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error('ERROR: Cannot find DATABASE_URL');
    process.exit(1);
  }

  const url = new URL(dbUrl);
  const conn = await createConnection({
    host: url.hostname,
    port: parseInt(url.port) || 4000,
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: url.pathname.slice(1),
    ssl: { rejectUnauthorized: true },
  });

  console.log('Connected to database');

  // Load progress
  const progress = loadProgress();
  console.log(`Resuming from id > ${progress.lastProcessedId} (${progress.enrichedCount} already enriched)`);

  // Get repos needing enrichment
  const [rows] = await conn.execute(
    `SELECT id, name, gitUrl FROM projects 
     WHERE gitUrl IS NOT NULL AND gitUrl LIKE '%github.com%' 
     AND (stars IS NULL OR stars = 0)
     AND id > ?
     ORDER BY id ASC 
     LIMIT 100000`,
    [progress.lastProcessedId]
  );

  console.log(`Found ${rows.length} repos to enrich`);

  if (rows.length === 0) {
    console.log('All repos already enriched!');
    await conn.end();
    return;
  }

  let enriched = progress.enrichedCount;
  let failed = progress.failedCount;
  let batchUpdates = [];
  let graphqlCalls = 0;

  for (let i = 0; i < rows.length; i += GRAPHQL_BATCH) {
    const batch = rows.slice(i, i + GRAPHQL_BATCH);
    const reposWithNames = batch.map(r => ({
      id: r.id,
      fullName: extractFullName(r.gitUrl),
    })).filter(r => r.fullName);

    if (reposWithNames.length === 0) {
      failed += batch.length;
      continue;
    }

    // GraphQL batch
    const results = await fetchRepoBatchGraphQL(reposWithNames);
    graphqlCalls++;

    if (results) {
      for (let j = 0; j < results.length; j++) {
        if (results[j]) {
          batchUpdates.push(results[j]);
          enriched++;
        } else {
          // Try REST fallback for failed individual repos
          const restResult = await fetchRepoREST(reposWithNames[j].fullName);
          if (restResult) {
            batchUpdates.push({ id: reposWithNames[j].id, ...restResult });
            enriched++;
          } else {
            failed++;
          }
        }
      }
    } else {
      // Entire GraphQL batch failed, try REST one by one
      for (const r of reposWithNames) {
        const restResult = await fetchRepoREST(r.fullName);
        if (restResult) {
          batchUpdates.push({ id: r.id, ...restResult });
          enriched++;
        } else {
          failed++;
        }
        await sleep(50); // Small delay for REST
      }
    }

    // Flush to DB
    if (batchUpdates.length >= DB_BATCH || i + GRAPHQL_BATCH >= rows.length) {
      for (const r of batchUpdates) {
        try {
          await conn.execute(
            `UPDATE projects SET 
              stars = ?, forks = ?, openIssues = ?, watchers = ?, size = ?,
              primaryLanguage = ?, topics = ?, license = ?, owner = ?, fullName = ?,
              defaultBranch = ?, isArchived = ?, isFork = ?, lastPushAt = ?, githubCreatedAt = ?
            WHERE id = ?`,
            [
              r.stars, r.forks, r.openIssues, r.watchers, r.size,
              r.primaryLanguage, JSON.stringify(r.topics || []), r.license, r.owner, r.fullName,
              r.defaultBranch, r.isArchived ? 1 : 0, r.isFork ? 1 : 0,
              r.lastPushAt ? new Date(r.lastPushAt) : null,
              r.githubCreatedAt ? new Date(r.githubCreatedAt) : null,
              r.id
            ]
          );
        } catch (e) {
          // Silently skip DB errors
          failed++;
        }
      }

      // Save progress
      const lastId = batch[batch.length - 1].id;
      progress.lastProcessedId = lastId;
      progress.enrichedCount = enriched;
      progress.failedCount = failed;
      saveProgress(progress);
      batchUpdates = [];
    }

    // Progress log every 20 batches (~400 repos)
    if (graphqlCalls % 20 === 0) {
      const pct = ((i + GRAPHQL_BATCH) / rows.length * 100).toFixed(1);
      console.log(`  [${pct}%] Enriched: ${enriched}, Failed: ${failed}, GraphQL calls: ${graphqlCalls}`);
    }

    // Rate limit management: 5000 points/hour for GraphQL
    // Each query costs ~1 point, so we have plenty of headroom
    // Add a small delay every 100 calls to be safe
    if (graphqlCalls % 100 === 0) {
      await sleep(2000);
    }
  }

  console.log(`\n=== Enrichment Complete ===`);
  console.log(`Enriched: ${enriched}`);
  console.log(`Failed: ${failed}`);
  console.log(`GraphQL API calls: ${graphqlCalls}`);
  console.log(`Finished at: ${new Date().toISOString()}`);

  await conn.end();
}

main().catch(e => {
  console.error('FATAL:', e);
  process.exit(1);
});
