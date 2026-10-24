// Generate every store package from the apps in catalog.yaml.
//
//   npm run generate                       read each app's selfhost/app.yaml at its latest release
//   npm run generate -- --local id=../app  use a local checkout's manifest instead (to try a change)
//   npm run generate -- --catalog file     another catalog file (tests)
//   npm run check                          generate, then fail if the committed output differs
//
// Output (all generated; never edit by hand):
//   <store>-<app>/          Umbrel community store (umbrelOS reads */umbrel-app.yml on the default branch)
//   apps/<store>-<app>/     Runtipi app store
//   unraid/                 Unraid Community Apps templates (all-in-one images); ca_profile.xml at the root
//   casaos/Apps/            CasaOS / ZimaOS store, pushed to the `casaos` branch by CI
//   site/                   GitHub Pages: Cosmos market source, Portainer templates, icons, index.html
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, rm, writeFile, copyFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { parse } from "yaml";
import sharp from "sharp";
import { buildModel } from "./model.mjs";
import { cosmos, cosmosIndex } from "./stores/cosmos.mjs";
import { umbrel, umbrelStoreFile } from "./stores/umbrel.mjs";
import { casaos } from "./stores/casaos.mjs";
import { runtipi } from "./stores/runtipi.mjs";
import { unraid, caProfile } from "./stores/unraid.mjs";
import { portainer, portainerIndex } from "./stores/portainer.mjs";
import { site } from "./site.mjs";

const ROOT = resolve(dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..");
const CACHE = join(ROOT, ".cache");
const args = process.argv.slice(2);
const check = args.includes("--check");
const locals = new Map(
  args.flatMap((arg, index) => (args[index - 1] === "--local" ? [arg.split("=")] : [])).map(([id, path]) => [id, resolve(path)]),
);

const github = async (path) => {
  const response = await fetch(`https://api.github.com/${path}`, {
    headers: {
      Accept: "application/vnd.github+json",
      ...(process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}),
    },
  });
  if (!response.ok) throw new Error(`GitHub ${path}: ${response.status}`);
  return response.json();
};

const download = async (url, to) => {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url}: ${response.status}`);
  await mkdir(dirname(to), { recursive: true });
  await writeFile(to, Buffer.from(await response.arrayBuffer()));
  return to;
};

/** The manifest, release and local asset paths for one catalog entry. */
async function loadApp(entry) {
  const [owner, name] = entry.repo.split("/");
  const local = [...locals.entries()].find(([id]) => id === name || id === entry.id)?.[1];
  let release;
  let read;
  if (local) {
    const pkg = existsSync(join(local, "package.json")) ? JSON.parse(await readFile(join(local, "package.json"), "utf8")) : {};
    release = { version: pkg.version ?? "0.0.0", notes: "", publishedAt: new Date().toISOString(), tag: "main" };
    read = async (path, to) => {
      await mkdir(dirname(to), { recursive: true });
      await copyFile(join(local, path), to);
      return to;
    };
  } else {
    const latest = await github(`repos/${entry.repo}/releases/latest`);
    release = {
      version: latest.tag_name.replace(/^v/, ""),
      notes: (latest.body ?? "").trim(),
      publishedAt: latest.published_at,
      tag: latest.tag_name,
    };
    read = (path, to) => download(`https://raw.githubusercontent.com/${entry.repo}/${latest.tag_name}/${path}`, to);
  }
  const dir = join(CACHE, name);
  const manifest = parse(await readFile(await read(entry.manifest ?? "selfhost/app.yaml", join(dir, "app.yaml")), "utf8"));
  const icon = await read(manifest.icon, join(dir, "icon-source"));
  const screenshots = [];
  for (const [index, path] of (manifest.screenshots ?? []).entries()) {
    screenshots.push(await read(path, join(dir, `screenshot-${index + 1}-source`)));
  }
  const composeFile = manifest.compose ?? "docker-compose.selfhost.yml";
  const hasCompose = local ? existsSync(join(local, composeFile)) : (await fetch(`https://raw.githubusercontent.com/${entry.repo}/${release.tag}/${composeFile}`, { method: "HEAD" })).ok;
  manifest.compose_url ??= hasCompose ? composeFile : undefined;
  manifest.repo ??= `https://github.com/${owner}/${name}`;
  return buildModel(manifest, { ...release, assets: { icon, screenshots } });
}

async function writeOutput(path, content) {
  const target = join(ROOT, path);
  await mkdir(dirname(target), { recursive: true });
  if (typeof content === "string") return writeFile(target, content);
  // Icons are squared and sized for stores; screenshots keep their shape, capped in width.
  const isIcon = /icon|logo|\/portainer\//.test(path);
  let image = sharp(content.copy);
  image = isIcon ? image.resize(512, 512, { fit: "cover" }) : image.resize({ width: 1600, withoutEnlargement: true });
  await (content.convert === "jpg" ? image.flatten({ background: "#ffffff" }).jpeg({ quality: 90 }) : image.png()).toFile(target);
}

const GENERATED = async () => [
  ...(await readdir(ROOT)).filter((entry) => /^[a-z0-9]+-[a-z0-9-]+$/.test(entry) && existsSync(join(ROOT, entry, "umbrel-app.yml"))),
  "apps",
  "unraid",
  "casaos",
  "site",
];

const catalogFile = args[args.indexOf("--catalog") + 1] && args.includes("--catalog") ? resolve(args[args.indexOf("--catalog") + 1]) : join(ROOT, "catalog.yaml");
const catalog = parse(await readFile(catalogFile, "utf8"));
const store = { ...catalog.store, repo: catalog.store.url.replace("https://github.com/", "") };

const outputs = new Map();
const cosmosListings = [];
const portainerTemplates = [];
const models = [];
for (const entry of catalog.apps) {
  let model;
  try {
    model = await loadApp(entry);
  } catch (error) {
    // An app without a release or manifest yet is left out, not a failed build.
    console.warn(`skip ${entry.repo}: ${error.message}`);
    continue;
  }
  models.push(model);
  const add = (files) => Object.entries(files ?? {}).forEach(([path, content]) => outputs.set(path, content));
  if (model.stores.cosmos) {
    const result = cosmos(model, store);
    add(result.files);
    cosmosListings.push(result.listing);
  }
  if (model.stores.umbrel) add(umbrel(model, store).files);
  if (model.stores.casaos) add(casaos(model, store).files);
  if (model.stores.runtipi) add(runtipi(model, store).files);
  if (model.stores.unraid) add(unraid(model, store).files);
  if (model.stores.portainer) {
    const result = portainer(model, store);
    if (result.template) {
      portainerTemplates.push(result.template);
      add(result.files);
    }
  }
  console.log(`ok   ${model.id} ${model.version}`);
}
for (const [path, content] of Object.entries({
  ...cosmosIndex(cosmosListings, store),
  ...portainerIndex(portainerTemplates),
  "umbrel-app-store.yml": umbrelStoreFile(store),
  "ca_profile.xml": caProfile(store),
  ...site(models, store),
  "site/.nojekyll": "",
})) {
  outputs.set(path, content);
}

for (const path of await GENERATED()) await rm(join(ROOT, path), { recursive: true, force: true });
for (const [path, content] of outputs) await writeOutput(path, content);
console.log(`wrote ${outputs.size} files for ${models.length} apps`);

if (check) {
  const status = execFileSync("git", ["status", "--porcelain"], { cwd: ROOT, encoding: "utf8" });
  if (status.trim()) {
    console.error(`Generated output is out of date:\n${status}`);
    process.exit(1);
  }
}
