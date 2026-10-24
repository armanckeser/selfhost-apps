// Umbrel: a community app store is a git repo with umbrel-app-store.yml at its root and one
// `<store-id>-<app>/` folder per app (umbrel-app.yml, docker-compose.yml, exports.sh). umbrelOS globs
// `*/umbrel-app.yml` on the default branch, so these folders sit at this repo's root next to everything
// else. People add https://github.com/<owner>/selfhost-apps under App Store → Community App Stores.
//
// Umbrel has no install form, and its own login sits in front of the app (app_proxy), so the app's auth
// stays off. An app that needs a setting it cannot take in its own UI is skipped (`stores.umbrel: false`).
import { stringify } from "yaml";
import { substitute } from "../model.mjs";

export function umbrel(model, store) {
  const appId = `${store.id}-${model.id}`;
  const secretVar = (name) => `APP_${appId.replace(/-/g, "_").toUpperCase()}_${name.replace(/-/g, "_").toUpperCase()}`;
  const resolve = (kind, name) =>
    kind === "secret" ? `\${${secretVar(name)}}`
      // Container names, as the official apps write them (linkwarden_postgres_1): a bare service name
      // like "postgres" can resolve to another app's container on a network Umbrel shares.
      : kind === "host" ? `${appId}_${name}_1`
      : kind === "input" ? ""
      : model.version;

  const services = {
    app_proxy: {
      environment: {
        APP_HOST: `${appId}_${model.main}_1`,
        APP_PORT: model.port,
      },
    },
  };
  for (const [key, service] of Object.entries(model.services)) {
    const resolved = substitute(service, resolve);
    const entry = { image: resolved.image, restart: "on-failure", stop_grace_period: "1m" };
    if (resolved.environment) entry.environment = resolved.environment;
    if (resolved.command) entry.command = resolved.command;
    if (resolved.healthcheck) entry.healthcheck = resolved.healthcheck;
    // Wait for a dependency's healthcheck where it has one, like the official apps do.
    if (resolved.depends_on) {
      entry.depends_on = Object.fromEntries(resolved.depends_on.map((other) => [
        other,
        { condition: model.services[other]?.healthcheck ? "service_healthy" : "service_started" },
      ]));
    }
    if (resolved.volumes) {
      entry.volumes = Object.entries(resolved.volumes).map(([volume, target]) => `\${APP_DATA_DIR}/data/${volume}:${target}`);
    }
    services[key] = entry;
  }

  const manifest = {
    manifestVersion: 1,
    id: appId,
    category: umbrelCategory(model.category),
    name: model.name,
    version: model.version,
    tagline: model.tagline,
    icon: `${store.pages}/umbrel/${model.id}/icon.png`,
    description: model.description,
    developer: model.developer,
    website: model.website,
    submitter: store.maintainer,
    submission: store.url,
    repo: model.repo,
    support: model.support,
    port: model.hostPort,
    gallery: model.assets.screenshots.map((_, index) => `${store.pages}/umbrel/${model.id}/${index + 1}.png`),
    path: model.path,
    releaseNotes: model.releaseNotes ?? "",
    dependencies: [],
    defaultUsername: "",
    defaultPassword: "",
  };

  // derive_entropy gives each secret a stable value per install, from the Umbrel's own seed; keyed by
  // ${app_entropy_identifier} as the official apps do (murmur, tandoor).
  const exports = model.secrets
    .map((name) => `export ${secretVar(name)}="$(derive_entropy "\${app_entropy_identifier}-${name}")"`)
    .join("\n");

  return {
    files: {
      [`${appId}/umbrel-app.yml`]: stringify(manifest, { lineWidth: 0 }),
      [`${appId}/docker-compose.yml`]: stringify({ version: "3.7", services }, { lineWidth: 0 }),
      ...(exports ? { [`${appId}/exports.sh`]: `${exports}\n` } : {}),
      [`site/umbrel/${model.id}/icon.png`]: { copy: model.assets.icon },
      ...Object.fromEntries(model.assets.screenshots.map((file, index) => [`site/umbrel/${model.id}/${index + 1}.png`, { copy: file }])),
    },
  };
}

export const umbrelStoreFile = (store) => stringify({ id: store.id, name: store.name });

const umbrelCategory = (category) =>
  ({ productivity: "files", finance: "finance", media: "media", development: "developer", developer: "developer", home: "automation", social: "social", ai: "ai", utilities: "files" })[category] ?? "files";
