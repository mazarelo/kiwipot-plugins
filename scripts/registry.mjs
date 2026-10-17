// What the registry's scripts share: reading plugins.json as Kiwipot's server reads it, and fetching a version as it
// fetches one (its manifest, then the script its "main" names), with their SHA-256s.
import { createHash } from 'node:crypto';

export const PLUGIN_ID = /^[a-z0-9][a-z0-9.-]{0,63}$/;
export const VERSION = /^\d{1,6}\.\d{1,6}\.\d{1,6}([-+][0-9A-Za-z.-]{1,32})?$/;
export const SHA256 = /^[0-9a-f]{64}$/;
// Built with the app (the server's BuiltinPluginIDs): no plugin of the registry may take these ids
export const BUILTIN_IDS = new Set(['board', 'gym', 'shopping', 'excalidraw', 'slides']);
// The protocol Kiwipot's apps speak now
export const MAX_PROTOCOL = 2;
const MAX_MANIFEST_BYTES = 64 * 1024;
const MAX_SCRIPT_BYTES = 5 * 1024 * 1024;
// The redirects the server follows for one fetch
const MAX_REDIRECTS = 3;

export const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

const httpsLink = (value) => {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password;
  } catch {
    return false;
  }
};

/** The registry's problems, as the server would refuse it (it refuses the whole file for one). */
export const registryProblems = (registry) => {
  const problems = [];
  if (!registry || !Array.isArray(registry.plugins)) {
    return ['plugins.json is { "plugins": [...] }'];
  }
  const ids = new Set();
  for (const plugin of registry.plugins) {
    const name = plugin?.id ?? '(no id)';
    if (typeof plugin?.id !== 'string' || !PLUGIN_ID.test(plugin.id) || BUILTIN_IDS.has(plugin.id)) {
      problems.push(`${name}: the id is lowercase letters, digits, dots and dashes, and not a built-in plugin's`);
    }
    if (ids.has(plugin?.id)) {
      problems.push(`${name}: listed twice`);
    }
    ids.add(plugin?.id);
    if (!httpsLink(plugin?.repository)) {
      problems.push(`${name}: "repository" is the https link to its source`);
    }
    if (!Array.isArray(plugin?.versions) || plugin.versions.length === 0) {
      problems.push(`${name}: it has no versions`);
      continue;
    }
    const versions = new Set();
    for (const version of plugin.versions) {
      const label = `${name} ${version?.version ?? '(no version)'}`;
      if (typeof version?.version !== 'string' || !VERSION.test(version.version) || versions.has(version.version)) {
        problems.push(`${label}: "version" is a new major.minor.patch`);
      }
      versions.add(version?.version);
      if (!httpsLink(version?.manifest)) {
        problems.push(`${label}: "manifest" is an https link to kiwipot-plugin.json`);
      }
      if (!SHA256.test(version?.manifestSha256 ?? '') || !SHA256.test(version?.bundleSha256 ?? '')) {
        problems.push(`${label}: "manifestSha256" and "bundleSha256" are SHA-256s (scripts/pin.mjs prints them)`);
      }
    }
  }
  return problems;
};

// Fetches as the server does, following its redirects one by one: the bytes, and every address it went through
const get = async (url, limit, what) => {
  const visited = [url];
  let response = await fetch(url, { redirect: 'manual' });
  while (response.status >= 300 && response.status < 400 && response.headers.get('location')) {
    if (visited.length > MAX_REDIRECTS) {
      throw new Error(`the ${what} at ${url} redirects more than ${MAX_REDIRECTS} times`);
    }
    visited.push(new URL(response.headers.get('location'), visited.at(-1)).href);
    response = await fetch(visited.at(-1), { redirect: 'manual' });
  }
  if (!response.ok) {
    throw new Error(`the ${what} at ${url} answered ${response.status}`);
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length > limit) {
    throw new Error(`the ${what} is over ${limit / 1024} KB`);
  }
  return { bytes, url: visited.at(-1), visited };
};

/**
 * Where a manifest's script may be, in the order the server tries them: next to the manifest's last address on the
 * link's own host (a release's link, not the storage GitHub's downloads redirect to), then next to its last address.
 */
export const scriptURLs = (main, manifestURL, visited) => {
  const host = new URL(manifestURL).host;
  const onHost = visited.findLast((address) => new URL(address).host === host) ?? visited.at(-1);
  return [...new Set([new URL(main, onHost).href, new URL(main, visited.at(-1)).href])];
};

/** A version as its host serves it: the manifest, its script, and both SHA-256s. */
export const fetchVersion = async (manifestURL) => {
  const manifest = await get(manifestURL, MAX_MANIFEST_BYTES, 'manifest');
  let parsed;
  try {
    parsed = JSON.parse(manifest.bytes.toString('utf8'));
  } catch (error) {
    throw new Error(`the manifest is not JSON: ${error.message}`);
  }
  if (typeof parsed.main !== 'string' || !parsed.main) {
    throw new Error('the manifest has no "main"');
  }
  let failure;
  for (const scriptURL of scriptURLs(parsed.main, manifestURL, manifest.visited)) {
    if (!httpsLink(scriptURL)) {
      throw new Error(`"main" is not on the web over https: ${scriptURL}`);
    }
    try {
      const script = await get(scriptURL, MAX_SCRIPT_BYTES, 'script');
      return {
        manifest: parsed,
        manifestSha256: sha256(manifest.bytes),
        bundleSha256: sha256(script.bytes),
        scriptURL,
        scriptBytes: script.bytes.length,
      };
    } catch (error) {
      failure ??= error;
      // Too large is too large wherever it is
      if (/ is over /.test(error.message)) {
        throw error;
      }
    }
  }
  throw failure;
};

/** What a reviewer should know of a manifest, or must reject. */
export const manifestProblems = (manifest, id, version) => {
  const problems = [];
  if (manifest.id !== id) {
    problems.push(`its manifest's id is ${manifest.id}, not ${id}`);
  }
  if (manifest.version !== version) {
    problems.push(`its manifest's version is ${manifest.version}, not ${version}`);
  }
  if (!Number.isInteger(manifest.protocol) || manifest.protocol < 1 || manifest.protocol > MAX_PROTOCOL) {
    problems.push(`"protocol" is ${manifest.protocol}: Kiwipot speaks 1 to ${MAX_PROTOCOL}`);
  }
  for (const key of ['name', 'author', 'description']) {
    if (typeof manifest[key] !== 'string' || !manifest[key].trim()) {
      problems.push(`"${key}" is missing`);
    }
  }
  if (typeof manifest.block?.icon !== 'string' || !/^\s*(<\?xml[^>]*>\s*)?<svg[\s>]/.test(manifest.block.icon)) {
    problems.push('"block.icon" is an SVG');
  }
  return problems;
};
