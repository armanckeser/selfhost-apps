// Runtipi: a custom app store is a git repo with apps/<id>/ (config.json, docker-compose.yml with
// x-runtipi, metadata/description.md, metadata/logo.jpg). People add https://github.com/<owner>/selfhost-apps
// under Settings → App Stores. The official Runtipi store takes no new apps, so this is the only way in.
//
// Runtipi generates secrets itself (form field type `random`) and puts no login in front of apps, so the
// install offers the app's own AUTH_PASSWORD when the app has one.
import { substitute, AUTH_FIELD } from "../model.mjs";
import { stringify } from "yaml";

export function runtipi(model, store) {
  const id = `${store.id}-${model.id}`;
  const secretVar = (name) => `${model.id}_${name}`.replace(/-/g, "_").toUpperCase();
  const resolve = (kind, name) =>
    kind === "secret" ? `\${${secretVar(name)}}`
      : kind === "host" ? `${model.id}-${name}`
      : kind === "input" ? `\${${name}}`
      : model.version;
  const inputs = model.auth === "builtin" ? [...model.env, AUTH_FIELD] : model.env;

  const services = {};
  for (const [key, service] of Object.entries(model.services)) {
    const resolved = substitute(service, resolve);
    const environment = { ...(resolved.environment ?? {}) };
    if (key === model.main && model.auth === "builtin") environment.AUTH_PASSWORD = "${AUTH_PASSWORD}";
    const entry = { image: resolved.image, container_name: `${model.id}-${key}`, restart: "unless-stopped", environment };
    if (resolved.command) entry.command = resolved.command;
    if (resolved.healthcheck) entry.healthcheck = resolved.healthcheck;
    if (resolved.depends_on) entry.depends_on = Object.fromEntries(resolved.depends_on.map((other) => [other, { condition: model.services[other].healthcheck ? "service_healthy" : "service_started" }]));
    if (resolved.volumes) {
      entry.volumes = Object.entries(resolved.volumes).map(([volume, target]) => `\${APP_DATA_DIR}/data/${volume}:${target}`);
    }
    if (key === model.main) entry["x-runtipi"] = { is_main: true, internal_port: model.port };
    services[key] = entry;
  }

  const now = Date.parse(model.releasedAt ?? "") || Date.now();
  const config = {
    name: model.name,
    id,
    available: true,
    short_desc: model.tagline,
    author: model.developer,
    port: model.hostPort,
    categories: [runtipiCategory(model.category)],
    description: model.tagline,
    tipi_version: Number(model.version.split(".").reduce((sum, part, index) => sum + Number(part) * 1000 ** (2 - index), 0)) || 1,
    version: model.version,
    source: model.repo,
    website: model.website,
    exposable: true,
    dynamic_config: true,
    supported_architectures: model.architectures,
    form_fields: [
      // Hex, so a generated password can sit in a postgresql:// URL without escaping.
      ...model.secrets.map((name) => ({ type: "random", label: `${name} secret`, min: 32, encoding: "hex", required: true, env_variable: secretVar(name) })),
      ...inputs.map((field) => ({
        type: field.type === "password" ? "password" : field.type === "url" ? "url" : field.type === "email" ? "email" : "text",
        label: field.label,
        required: Boolean(field.required),
        env_variable: field.name,
        ...(field.help ? { hint: field.help } : {}),
      })),
    ],
    created_at: now,
    updated_at: now,
  };

  return {
    files: {
      [`apps/${id}/config.json`]: `${JSON.stringify(config, null, 2)}\n`,
      [`apps/${id}/docker-compose.yml`]: stringify({ services, "x-runtipi": { schema_version: 2 } }, { lineWidth: 0 }),
      [`apps/${id}/metadata/description.md`]: `# ${model.name}\n\n${model.description}\n\nSource: ${model.repo}\n`,
      [`apps/${id}/metadata/logo.jpg`]: { copy: model.assets.icon, convert: "jpg" },
    },
  };
}

const runtipiCategory = (category) =>
  ({ productivity: "utilities", finance: "finance", media: "media", development: "development", developer: "development", home: "automation", social: "social", ai: "ai", utilities: "utilities" })[category] ?? "utilities";
