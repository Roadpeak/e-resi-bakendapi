/**
 * Copy the three.js runtime the panorama renderer needs out of node_modules.
 *
 * The renderer is a real browser page, so it loads three.js over HTTP as ES
 * modules rather than importing it through Node — which means the files have to
 * sit next to renderer.html where the asset server can reach them.
 *
 * They are copied rather than committed. Three megabytes of vendored library in
 * source control would drift from the version in package.json the first time
 * anyone upgraded, and a bake that silently renders against a different three.js
 * than the viewer is exactly the class of bug that takes a day to find.
 *
 * Runs from `pnpm build`, and deliberately NOT from `postinstall`.
 *
 * postinstall looks like the tidier hook and breaks the Docker build. The deps
 * stage copies only package.json and the lockfile before installing, so this
 * file does not exist yet when the hook fires — and `pnpm prune --prod` runs
 * install hooks a second time, in a stage that has no reason to carry scripts/
 * either. Tying it to the build is both sufficient (the build is the only thing
 * that needs the assets) and honest about when it can actually run.
 */
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));
const dest = join(here, '..', 'src', 'twins', 'panorama');
// Resolved from the package entry point rather than from 'three/package.json':
// three.js does not export package.json, so the usual trick of resolving that
// and taking its directory throws ERR_PACKAGE_PATH_NOT_EXPORTED. The entry
// resolves to build/three.module.js, two levels below the package root.
const three = dirname(dirname(require.resolve('three')));

/** Only what renderer.html actually imports, plus what those import in turn. */
const files = [
  ['build/three.module.js', 'three.module.js'],
  // Newer three.js splits the core out of the module entry point; three.module.js
  // imports it by relative path, so it must land beside it under the same name.
  ['build/three.core.js', 'three.core.js'],
  ['examples/jsm/loaders/GLTFLoader.js', 'addons/loaders/GLTFLoader.js'],
  ['examples/jsm/loaders/DRACOLoader.js', 'addons/loaders/DRACOLoader.js'],
  ['examples/jsm/environments/RoomEnvironment.js', 'addons/environments/RoomEnvironment.js'],
  // GLTFLoader's own imports.
  ['examples/jsm/utils/BufferGeometryUtils.js', 'addons/utils/BufferGeometryUtils.js'],
  ['examples/jsm/utils/SkeletonUtils.js', 'addons/utils/SkeletonUtils.js'],
];

for (const [from, to] of files) {
  const src = join(three, from);
  if (!existsSync(src)) throw new Error(`three.js asset missing: ${from}`);
  const target = join(dest, to);
  await mkdir(dirname(target), { recursive: true });
  await cp(src, target);
}

// The Draco decoder, for compressed meshes.
await cp(join(three, 'examples/jsm/libs/draco'), join(dest, 'draco'), { recursive: true });

/**
 * Fail loudly on an unresolved import.
 *
 * The list above is hand-maintained, and a three.js upgrade that adds an import
 * to one of these files would otherwise show up as a bake that times out with
 * no explanation — the page 404s, never sets __ready, and the wait expires.
 * Checking here turns that into a build error naming the missing file.
 */
const missing = [];
for (const [, to] of files) {
  const text = await readFile(join(dest, to), 'utf8');
  for (const [, spec] of text.matchAll(/from\s+['"](\.\.?\/[^'"]+)['"]/g)) {
    const resolved = join(dirname(join(dest, to)), spec);
    if (!existsSync(resolved)) missing.push(`${to} → ${spec}`);
  }
}
if (missing.length) {
  throw new Error(
    `Unresolved three.js imports after sync — add them to scripts/sync-panorama-assets.mjs:\n  ${missing.join('\n  ')}`,
  );
}

// Keep the copies out of source control wherever this lands.
await writeFile(
  join(dest, '.gitignore'),
  ['# Synced from node_modules by scripts/sync-panorama-assets.mjs', 'three.module.js', 'three.core.js', 'addons/', 'draco/', ''].join('\n'),
);

const { version } = JSON.parse(await readFile(join(three, 'package.json'), 'utf8'));
console.log(`Synced panorama renderer assets from three@${version}`);
