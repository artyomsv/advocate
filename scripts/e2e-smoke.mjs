#!/usr/bin/env node
// @ts-check
/**
 * End-to-end smoke for Mynah. Expects `docker compose up -d` to have run,
 * realm `mynah` to be imported in Keycloak, owner user created.
 */

import { execSync, spawnSync } from 'node:child_process';

const API = process.env.MYNAH_API ?? 'http://localhost:36401';
const KC = process.env.MYNAH_KEYCLOAK ?? 'http://localhost:9080';
const USER = process.env.MYNAH_OWNER_USER ?? 'owner';
const PASS = process.env.MYNAH_OWNER_PASS ?? 'Mynah-Dev-2026!';
const CLIENT = 'mynah-dashboard';
const REALM = 'mynah';

function ok(msg) {
  console.log(`\u2713 ${msg}`);
}
function fail(msg) {
  console.error(`\u2717 ${msg}`);
  process.exit(1);
}

async function fetchJson(url, init = {}) {
  const res = await fetch(url, init);
  if (!res.ok) {
    const body = await res.text().catch(() => '(no body)');
    throw new Error(`${init.method ?? 'GET'} ${url} → ${res.status}: ${body}`);
  }
  const ct = res.headers.get('content-type') ?? '';
  return ct.includes('json') ? res.json() : res.text();
}

async function getOwnerToken() {
  const body = new URLSearchParams({
    client_id: CLIENT,
    grant_type: 'password',
    username: USER,
    password: PASS,
  }).toString();
  const res = await fetch(`${KC}/realms/${REALM}/protocol/openid-connect/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!res.ok) throw new Error(`token: ${res.status}`);
  const json = await res.json();
  return json.access_token;
}

function psql(sql) {
  const result = spawnSync(
    'docker',
    ['exec', '-i', 'mynah-postgres', 'psql', '-U', 'mynah', '-d', 'mynah', '-t', '-A'],
    { input: sql, encoding: 'utf8' },
  );
  if (result.status !== 0) {
    throw new Error(`psql failed (${result.status}): ${result.stderr || result.stdout}`);
  }
  return result.stdout.trim();
}

function truncateAll() {
  psql(
    `DELETE FROM content_plans WHERE legend_id IN (SELECT id FROM legends WHERE first_name LIKE 'E2E%');`,
  );
  psql(`DELETE FROM legend_accounts WHERE username LIKE 'e2e_%';`);
  psql(`DELETE FROM communities WHERE identifier LIKE 'e2e_%';`);
  psql(`DELETE FROM legends WHERE first_name LIKE 'E2E%';`);
  psql(`DELETE FROM products WHERE slug LIKE 'e2e-%';`);
}

function seed() {
  const stamp = Date.now();
  const sql = `
    WITH p AS (INSERT INTO products (name, slug, description, value_props, pain_points, talking_points)
               VALUES ('E2E Product', 'e2e-${stamp}', 'smoke', '[]'::jsonb, '[]'::jsonb, '[]'::jsonb) RETURNING id),
         l AS (
           INSERT INTO legends (
             product_id, first_name, last_name, gender, age, location,
             life_details, professional, big_five, tech_savviness, typing_style,
             active_hours, active_days, average_post_length, hobbies,
             knowledge_gaps, expertise_areas, product_relationship, opinions, never_do
           )
           SELECT id, 'E2E', 'Runner', 'female', 30,
             '{"city":"Austin","state":"TX","country":"USA","timezone":"America/Chicago"}'::jsonb,
             '{"maritalStatus":"married"}'::jsonb,
             '{"occupation":"Engineer","company":"Acme","industry":"Tech","yearsExperience":5,"education":"BS"}'::jsonb,
             '{"openness":7,"conscientiousness":7,"extraversion":5,"agreeableness":6,"neuroticism":3}'::jsonb,
             7,
             '{"capitalization":"proper","punctuation":"correct","commonTypos":[],"commonPhrases":[],"avoidedPhrases":[],"paragraphStyle":"varied","listStyle":"sometimes","usesEmojis":true,"formality":5}'::jsonb,
             '{"start":8,"end":22}'::jsonb, '[1,2,3,4,5]'::jsonb,
             'medium', '["reading"]'::jsonb, '[]'::jsonb, '["tech"]'::jsonb,
             '{"discoveryStory":"found it","usageDuration":"1mo","satisfactionLevel":8,"complaints":[],"useCase":"daily","alternativesConsidered":[]}'::jsonb,
             '{}'::jsonb, '[]'::jsonb
           FROM p RETURNING id, product_id
         ),
         a AS (INSERT INTO legend_accounts (legend_id, platform, username, status)
               SELECT id,'reddit','e2e_u_${stamp}','active' FROM l RETURNING id, legend_id),
         c AS (INSERT INTO communities (platform, identifier, name, status, receptiveness_score)
               VALUES ('reddit','e2e_c_${stamp}','E2E Community','active', 8.0) RETURNING id)
    SELECT l.product_id::text || ',' || l.id::text || ',' || a.id::text || ',' || c.id::text
    FROM l, a, c;
  `;
  const result = psql(sql);
  const [productId, legendId, accountId, communityId] = result.split(',');
  return { productId, legendId, accountId, communityId };
}

async function main() {
  try {
    execSync('docker compose ps --status running --quiet', { stdio: 'pipe' });
    ok('Docker stack reachable');
  } catch {
    fail('Docker stack not running — `docker compose up -d` first');
  }

  const token = await getOwnerToken();
  ok(`Owner token fetched (${token.length} chars)`);

  truncateAll();
  const { productId, legendId, communityId } = seed();
  ok(
    `Seeded product=${productId.slice(0, 8)} legend=${legendId.slice(0, 8)} community=${communityId.slice(0, 8)}`,
  );

  const draftRes = await fetchJson(`${API}/orchestrate/draft`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      productId,
      campaignGoal: 'Share an honest experience in r/test',
      legendIds: [legendId],
      communityIds: [communityId],
    }),
  });
  const plan = draftRes.contentPlan;
  ok(
    `Orchestrator drafted plan ${plan.id.slice(0, 8)} status=${plan.status} cost=${draftRes.totalCostMillicents}mc`,
  );

  if (plan.status === 'review') {
    const approved = await fetchJson(`${API}/content-plans/${plan.id}/approve`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (approved.status !== 'approved') fail(`approve did not transition: got ${approved.status}`);
    ok('review → approved transition succeeded');
  } else if (plan.status === 'rejected') {
    if (!plan.rejectionReason) fail('rejected plan missing rejectionReason');
    ok(`rejection recorded: ${plan.rejectionReason.slice(0, 60)}`);
  } else {
    ok(`terminal status ${plan.status} — no decision needed`);
  }

  truncateAll();
  ok('Cleaned up e2e fixtures');

  console.log('\n\u2713 E2E smoke PASSED');
}

main().catch((err) => {
  console.error('\u2717 E2E smoke FAILED:', err.message);
  process.exit(1);
});
