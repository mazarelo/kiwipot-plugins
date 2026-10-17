# Kiwipot plugins

The reviewed plugins of [Kiwipot](https://kiwipot.com): `plugins.json` lists them, and Kiwipot offers them in **Settings → Plugins**. Each version is pinned by the SHA-256 of its manifest and of its script, so what was reviewed is exactly what people install.

To write a plugin, start with [the plugin guide](https://kiwipot.com/developers/plugins) and try it in [the playground](https://kiwipot.com/developers/playground).

## Submitting a plugin

1. **Publish a release** with your `kiwipot-plugin.json` and its built script, at links that don't change: a GitHub release's files are best (`https://github.com/you/your-plugin/releases/download/1.0.0/kiwipot-plugin.json`). Its `"main"` can be a path such as `"plugin.js"`: Kiwipot looks for it next to your link first, though GitHub's download links redirect to signed storage elsewhere, then next to where the manifest was in the end. [kiwipot-habits](https://github.com/mazarelo/kiwipot-habits) has a release workflow.
2. **Pin it:** `node scripts/pin.mjs <link to your kiwipot-plugin.json>` prints the version's entry.
3. **Open a pull request** that adds your plugin to `plugins.json`:

   ```json
   {
     "id": "tally",
     "repository": "https://github.com/you/kiwipot-tally",
     "versions": [
       {
         "version": "1.0.0",
         "manifest": "https://github.com/you/kiwipot-tally/releases/download/1.0.0/kiwipot-plugin.json",
         "manifestSha256": "…",
         "bundleSha256": "…"
       }
     ]
   }
   ```

   - `id` is your manifest's id. It is yours once merged: no other plugin can be installed under it.
   - `repository` is your plugin's source. Reviews read it: the script must be built from it, readable (minified is fine, obfuscated is not), and the repository must say how to build it.

The pull request's check fetches your release, makes sure it is what you pinned, and lists what your plugin may use and how large it is.

## Updating a plugin

Add the new version at the end of your plugin's `versions` (keep the old ones), pinned the same way, in a pull request. Once it is merged:

- **It installs by itself** for everyone who has your plugin, within minutes, if it asks for no more than they granted.
- **If it asks for more** (the account, another host), people see it in Settings → Plugins and choose to update.

## What a review looks for

- The script does what the plugin says, and nothing else.
- Nothing leaves the user's device that they wouldn't expect: no network use beyond the hosts it names and needs, no data sent where the plugin doesn't say.
- No tricks with the sandbox: no navigating its frame away (that can carry data out), no code from strings, no code fetched to run later.
- The account permission, if it asks for one, is needed for what it does, and `read` where `write` isn't needed.
- Its picture (the SVG it saves for public pages) shows the block, not something else.

## Pulling a version

A version found to be harmful or broken is pulled: `"pulled": true` on it, with a `"reason"`. Kiwipot then turns it off for everyone within minutes; their blocks keep their data and show their picture. Those who have an earlier version that isn't pulled get that one back. Taking a plugin off the list pulls all of it.

## How Kiwipot reads this

Kiwipot's server reads `plugins.json` every 5 minutes. It fetches each plugin's latest version once, keeps it only if it is exactly the pinned one, and serves it to people's devices from then on. A `plugins.json` it can't read changes nothing: an outage or a bad edit never turns plugins off. The format is checked by `scripts/check.mjs`, as the server checks it.
