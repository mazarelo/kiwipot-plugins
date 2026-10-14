// Prints a version's entry for plugins.json: fetches the manifest and its script as Kiwipot will, and pins both by
// their SHA-256. Run it on the release you submit, and paste its output into your plugin's "versions".
//
//   node scripts/pin.mjs https://github.com/you/your-plugin/releases/download/1.0.0/kiwipot-plugin.json
import { fetchVersion, manifestProblems } from './registry.mjs';

const [manifestURL] = process.argv.slice(2);
if (!manifestURL) {
  console.error('Usage: node scripts/pin.mjs <link to kiwipot-plugin.json>');
  process.exit(1);
}

const served = await fetchVersion(manifestURL);
const problems = manifestProblems(served.manifest, served.manifest.id, served.manifest.version);
for (const problem of problems) {
  console.error(`Problem: ${problem}`);
}
console.log(
  JSON.stringify(
    {
      version: served.manifest.version,
      manifest: manifestURL,
      manifestSha256: served.manifestSha256,
      bundleSha256: served.bundleSha256,
    },
    null,
    2
  )
);
process.exit(problems.length ? 1 : 0);
