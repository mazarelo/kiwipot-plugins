// Checks plugins.json as Kiwipot's server will read it, and every version that isn't pulled as its host serves it now:
// its manifest and script must be the ones pinned. Prints what a reviewer reads (what each plugin may do, its size, its
// source), to the job's summary on GitHub. Exits 1 on any problem.
//
//   node scripts/check.mjs
import { appendFileSync, readFileSync } from 'node:fs';

import { fetchVersion, manifestProblems, registryProblems } from './registry.mjs';

const registry = JSON.parse(readFileSync(new URL('../plugins.json', import.meta.url), 'utf8'));
const problems = registryProblems(registry);
const rows = [];

if (problems.length === 0) {
  for (const plugin of registry.plugins) {
    for (const version of plugin.versions) {
      if (version.pulled) {
        rows.push(`| ${plugin.id} | ${version.version} | pulled${version.reason ? `: ${version.reason}` : ''} | | |`);
        continue;
      }
      const label = `${plugin.id} ${version.version}`;
      try {
        const served = await fetchVersion(version.manifest);
        if (served.manifestSha256 !== version.manifestSha256) {
          problems.push(`${label}: its host serves a manifest with SHA-256 ${served.manifestSha256}, not the pinned one`);
        }
        if (served.bundleSha256 !== version.bundleSha256) {
          problems.push(`${label}: its host serves a script with SHA-256 ${served.bundleSha256}, not the pinned one`);
        }
        problems.push(...manifestProblems(served.manifest, plugin.id, version.version).map((p) => `${label}: ${p}`));
        const permissions = served.manifest.permissions ?? {};
        const may = [
          permissions.account ? `account: ${permissions.account}` : '',
          permissions.network?.length ? `network: ${permissions.network.join(', ')}` : '',
        ].filter(Boolean);
        rows.push(
          `| ${plugin.id} | ${version.version} | ${may.join('; ') || 'its blocks only'} | ${Math.ceil(served.scriptBytes / 1024)} KB | [source](${plugin.repository}) |`
        );
      } catch (error) {
        problems.push(`${label}: ${error.message}`);
      }
    }
  }
}

const report = [
  '## Plugin registry',
  '',
  ...(rows.length ? ['| Plugin | Version | May use | Script | |', '|---|---|---|---|---|', ...rows, ''] : []),
  ...(problems.length ? ['**Problems**', '', ...problems.map((problem) => `- ${problem}`)] : ['Every version is as pinned.']),
  '',
].join('\n');

console.log(report);
if (process.env.GITHUB_STEP_SUMMARY) {
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, report);
}
process.exit(problems.length ? 1 : 0);
