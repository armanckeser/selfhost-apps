// The catalog's one model of an app: what every store package is generated from.
//
// An app's selfhost/app.yaml either names a preset (`stack: agent-first`: app + Postgres + Electric, the
// agent-first-apps template's shape) or lists its services. Values may carry placeholders that each store
// translates into its own idiom:
//
//   ${secret:NAME}   a random value generated once per install (database passwords, signing keys)
//   ${host:SERVICE}  the hostname another service of this app answers on
//   ${input:NAME}    a value the person types into the install form (declared under `env:`)
//   ${version}       the release being packaged, without its leading v
//
// A volume is a name → container path; every store keeps it in that store's place for app data.

const PLACEHOLDER = /\$\{(secret|host|input|version)(?::([A-Za-z0-9_-]+))?\}/g;

const agentFirstServices = (manifest) => ({
  app: {
    image: `${manifest.image}:\${version}`,
    port: manifest.port ?? 8080,
    environment: {
      DATABASE_URL: "postgresql://postgres:${secret:db}@${host:postgres}:5432/app",
      ELECTRIC_URL: "http://${host:electric}:3000",
    },
    depends_on: ["postgres", "electric"],
  },
  postgres: {
    image: "postgres:16-alpine",
    environment: { POSTGRES_DB: "app", POSTGRES_USER: "postgres", POSTGRES_PASSWORD: "${secret:db}" },
    command: ["postgres", "-c", "wal_level=logical", "-c", "max_replication_slots=10", "-c", "max_wal_senders=10"],
    healthcheck: { test: ["CMD-SHELL", "pg_isready -U postgres"], interval: "5s", timeout: "5s", retries: 20 },
    volumes: { pgdata: "/var/lib/postgresql/data" },
  },
  electric: {
    image: "electricsql/electric:1.7.6",
    environment: {
      DATABASE_URL: "postgresql://postgres:${secret:db}@${host:postgres}:5432/app?sslmode=disable",
      ELECTRIC_INSECURE: "true",
      ELECTRIC_STORAGE_DIR: "/var/lib/electric/persistent",
    },
    volumes: { electricdata: "/var/lib/electric/persistent" },
    depends_on: ["postgres"],
  },
});

const required = (manifest, field) => {
  if (manifest[field] === undefined || manifest[field] === "" || manifest[field] === "TODO") {
    throw new Error(`${manifest.id ?? "app"}: selfhost/app.yaml needs ${field}`);
  }
  return manifest[field];
};

/** Normalize a manifest + release into the shape every store emitter reads. */
export function buildModel(manifest, release) {
  const id = required(manifest, "id");
  const services = manifest.stack === "agent-first" ? agentFirstServices(manifest) : required(manifest, "services");
  const main = manifest.main ?? (services.app ? "app" : Object.keys(services)[0]);
  if (!services[main]) throw new Error(`${id}: main service "${main}" is not in services`);
  const env = manifest.env ?? [];
  const secrets = new Set();
  const visit = (value) => {
    if (typeof value === "string") {
      for (const match of value.matchAll(PLACEHOLDER)) {
        if (match[1] === "secret") secrets.add(match[2]);
        if (match[1] === "host" && !services[match[2]]) throw new Error(`${id}: \${host:${match[2]}} names no service`);
        if (match[1] === "input" && !env.some((field) => field.name === match[2])) {
          throw new Error(`${id}: \${input:${match[2]}} is not declared under env`);
        }
      }
    } else if (Array.isArray(value)) value.forEach(visit);
    else if (value && typeof value === "object") Object.values(value).forEach(visit);
  };
  visit(services);

  // Inputs reach the main service as plain environment variables.
  services[main].environment = { ...(services[main].environment ?? {}) };
  for (const field of env) services[main].environment[field.name] ??= `\${input:${field.name}}`;

  return {
    id,
    name: required(manifest, "name"),
    tagline: required(manifest, "tagline"),
    description: required(manifest, "description").trim(),
    category: manifest.category ?? "utilities",
    developer: manifest.developer ?? "",
    website: manifest.website ?? manifest.repo,
    repo: required(manifest, "repo"),
    support: manifest.support ?? `${manifest.repo}/issues`,
    license: manifest.license ?? "AGPL-3.0-or-later",
    image: manifest.image,
    aioImage: manifest.aio === false ? null : `${manifest.image}:\${version}-aio`,
    version: release.version,
    releaseNotes: release.notes,
    releasedAt: release.publishedAt,
    port: services[main].port ?? manifest.port ?? 8080,
    hostPort: manifest.host_port ?? 8080,
    path: manifest.path ?? "",
    // `auth: builtin` (the template's default) means the app has its own optional login, so stores that
    // put nothing in front of an app offer AUTH_PASSWORD on the install form. `none` means it has none.
    auth: manifest.auth ?? (manifest.stack === "agent-first" ? "builtin" : "none"),
    env,
    // `umbrel: false` when the app needs a setting Umbrel has no install form for and the app cannot
    // take it in its own UI yet. Umbrel installs must work with zero configuration.
    stores: { umbrel: true, cosmos: true, casaos: true, runtipi: true, unraid: true, portainer: true, ...(manifest.stores ?? {}) },
    main,
    services,
    secrets: [...secrets],
    architectures: manifest.architectures ?? ["amd64", "arm64"],
    composeUrl: manifest.compose_url,
    assets: release.assets,
  };
}

/**
 * Replace placeholders in every string of `value`. `resolve(kind, name)` returns the store's text for
 * one placeholder.
 */
export function substitute(value, resolve) {
  if (typeof value === "string") return value.replace(PLACEHOLDER, (_, kind, name) => resolve(kind, name));
  if (Array.isArray(value)) return value.map((item) => substitute(item, resolve));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, substitute(item, resolve)]));
  }
  return value;
}

/** The auth input every store without its own login offers. */
export const AUTH_FIELD = {
  name: "AUTH_PASSWORD",
  label: "Password for the app (leave empty for no login)",
  type: "password",
  required: false,
  help: "Set one if anyone else on your network can reach this server.",
};

/** Plain paragraphs → a single line for stores that take one string. */
export const firstParagraph = (text) => text.split(/\n\s*\n/)[0].replace(/\s+/g, " ").trim();
