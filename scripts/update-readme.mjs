// Writes the latest session-orchestrator releases and the current
// lead-session-orchestrator npm version into the marked block of README.md.
// Fail-closed: any failed fetch or empty result exits 1 and leaves README.md untouched.
import { readFileSync, writeFileSync } from 'node:fs';

const START = '<!-- recent-releases:start -->';
const END = '<!-- recent-releases:end -->';
const README = new URL('../README.md', import.meta.url);
const RELEASES_URL =
  process.env.SO_RELEASES_URL ??
  'https://api.github.com/repos/Kanevry/session-orchestrator/releases?per_page=5';
const NPM_URL = process.env.SO_NPM_URL ?? 'https://registry.npmjs.org/lead-session-orchestrator';
const NPM_PAGE = 'https://www.npmjs.com/package/lead-session-orchestrator';
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function fail(message) {
  console.error(`update-readme: ${message}`);
  process.exit(1);
}

async function getJson(url, headers = {}) {
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`GET ${url} failed with HTTP ${res.status}`);
  return res.json();
}

function formatDate(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) throw new Error(`invalid date: ${iso}`);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

// Keeps generated text free of dashes the voice rules forbid and of link-breaking brackets.
function clean(text) {
  return String(text).replace(/[–—]/g, '-').replace(/[[\]\r\n]+/g, ' ').trim();
}

let block;
try {
  const ghHeaders = { Accept: 'application/vnd.github+json' };
  if (process.env.GITHUB_TOKEN) ghHeaders.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;

  const releases = await getJson(RELEASES_URL, ghHeaders);
  if (!Array.isArray(releases)) throw new Error('releases response is not a list');
  const lines = releases
    .filter((r) => !r.draft && !r.prerelease)
    .slice(0, 5)
    .map((r) => {
      const name = clean(r.name || r.tag_name);
      const label = name.includes('session-orchestrator') ? name : `session-orchestrator ${name}`;
      return `- [${label}](${r.html_url}), ${formatDate(r.published_at)}`;
    });
  if (lines.length === 0) throw new Error('no releases returned');

  const pkg = await getJson(NPM_URL);
  const version = pkg?.['dist-tags']?.latest;
  const published = version && pkg.time?.[version];
  if (!version || !published) throw new Error('npm latest version or publish time missing');
  lines.push(`- [lead-session-orchestrator ${clean(version)}](${NPM_PAGE}), ${formatDate(published)}`);

  block = lines.join('\n');
} catch (err) {
  fail(err.message);
}

const readme = readFileSync(README, 'utf8');
const start = readme.indexOf(START);
const end = readme.indexOf(END);
if (start === -1 || end === -1 || end < start) {
  fail(`markers ${START} and ${END} not found in README.md`);
}

const next = `${readme.slice(0, start + START.length)}\n${block}\n${readme.slice(end)}`;
if (next === readme) {
  console.log('unchanged');
} else {
  writeFileSync(README, next);
  console.log('changed');
}
