// CasaOS / ZimaOS: a third-party store is a zip whose top folder holds Apps/<App>/docker-compose.yml
// (with x-casaos metadata) plus an icon. CI pushes these folders to this repo's `casaos` branch, and people
// add https://github.com/<owner>/selfhost-apps/archive/refs/heads/casaos.zip under App Store → Add source.
//
// CasaOS has no secret generator and no login in front of apps. Rather than ship a fixed password, Postgres
// runs with trust auth: it is reachable only on the app's own network and publishes no port. Any other kind
// of secret has nowhere safe to come from, so it fails the build. The install offers the app's own
// AUTH_PASSWORD when the app has one.
import { stringify } from "yaml";
import { AUTH_FIELD, substitute } from "../model.mjs";

const folder = (model) => model.name.replace(/[^A-Za-z0-9]/g, "");

// The Install button takes the compose defaults; only Custom Installation shows the environment
// variables, so a value the app needs is spelled out before install.
function installTip(requiredFields, builtinAuth) {
  const lines = [
    ...requiredFields.map((field) => `Use Custom Installation and set ${field.name}: ${field.label}.${field.help ? ` ${field.help}` : ""}`),
    ...(builtinAuth ? ["Set AUTH_PASSWORD if anyone else on your network can reach this server; leave it empty for no login."] : []),
  ];
  return lines.length ? { before_install: { en_US: lines.join("\n\n") } } : {};
}

export function casaos(model, store) {
  // Plain names, as the official apps use (actualbudget, not <store>-actualbudget).
  const appId = model.id;
  for (const secret of model.secrets) {
    const isDbPassword = Object.values(model.services).some((service) =>
      service.image.startsWith("postgres:") && service.environment?.POSTGRES_PASSWORD === `\${secret:${secret}}`);
    if (!isDbPassword) throw new Error(`CasaOS: ${model.id} secret ${secret} is not a Postgres password, and CasaOS cannot generate one`);
  }
  const resolve = (kind, name) =>
    kind === "secret" ? ""
      : kind === "host" ? `${appId}-${name}`
      : kind === "input" ? ""
      : model.version;
  const fields = model.auth === "builtin" ? [...model.env, AUTH_FIELD] : model.env;

  const services = {};
  for (const [key, service] of Object.entries(model.services)) {
    const resolved = substitute(service, resolve);
    const environment = { ...(resolved.environment ?? {}) };
    if (resolved.image.startsWith("postgres:") && environment.POSTGRES_PASSWORD === "") {
      delete environment.POSTGRES_PASSWORD;
      environment.POSTGRES_HOST_AUTH_METHOD = "trust";
    }
    if (key === model.main) for (const field of fields) environment[field.name] = field.default ?? "";
    const entry = {
      image: resolved.image,
      container_name: `${appId}-${key}`,
      restart: "unless-stopped",
      environment,
    };
    if (resolved.command) entry.command = resolved.command;
    if (resolved.healthcheck) entry.healthcheck = resolved.healthcheck;
    // Wait for a dependency's healthcheck where it has one, as the official apps do (Linkwarden).
    if (resolved.depends_on) {
      entry.depends_on = Object.fromEntries(resolved.depends_on.map((other) => [
        other,
        { condition: model.services[other]?.healthcheck ? "service_healthy" : "service_started" },
      ]));
    }
    if (resolved.volumes) {
      entry.volumes = Object.entries(resolved.volumes).map(([volume, target]) => ({
        type: "bind",
        source: `/DATA/AppData/$AppID/${volume}`,
        target,
      }));
    }
    if (key === model.main) {
      entry.ports = [{ target: model.port, published: String(model.hostPort), protocol: "tcp" }];
      entry["x-casaos"] = {
        // The install form shows the description, so it carries the help text (e.g. where to make a token).
        envs: fields.map((field) => ({ container: field.name, description: { en_US: field.help ? `${field.label}. ${field.help}` : field.label } })),
        ports: [{ container: String(model.port), description: { en_US: "Web UI" } }],
      };
    }
    services[key] = entry;
  }

  const base = `https://cdn.jsdelivr.net/gh/${store.repo}@casaos/Apps/${folder(model)}`;
  const compose = {
    name: appId,
    services,
    "x-casaos": {
      // ZimaOS's store protocol (v2) wants a reverse-domain id; the validator rejects anything else.
      id: `com.${store.id}.${model.id}`,
      architectures: model.architectures,
      main: model.main,
      author: store.maintainer,
      developer: model.developer,
      category: casaCategory(model.category),
      icon: `${base}/icon.png`,
      thumbnail: model.assets.screenshots.length > 0 ? `${base}/screenshot-1.png` : `${base}/icon.png`,
      screenshot_link: model.assets.screenshots.map((_, index) => `${base}/screenshot-${index + 1}.png`),
      title: { en_US: model.name },
      tagline: { en_US: model.tagline },
      description: { en_US: model.description },
      tips: installTip(model.env.filter((field) => field.required), model.auth === "builtin"),
      index: "/",
      port_map: String(model.hostPort),
      scheme: "http",
      version: model.version,
      ...(model.releasedAt ? { update_at: model.releasedAt.slice(0, 10) } : {}),
      ...(model.releaseNotes ? { release_notes: { en_US: model.releaseNotes } } : {}),
      website: model.website,
      repo: model.repo,
      support: model.support,
    },
  };

  return {
    files: {
      [`casaos/Apps/${folder(model)}/docker-compose.yml`]: stringify(compose, { lineWidth: 0 }),
      [`casaos/Apps/${folder(model)}/icon.png`]: { copy: model.assets.icon },
      ...Object.fromEntries(model.assets.screenshots.map((file, index) => [`casaos/Apps/${folder(model)}/screenshot-${index + 1}.png`, { copy: file }])),
    },
  };
}

const casaCategory = (category) =>
  ({ productivity: "Productivity", finance: "Finance", media: "Media", development: "Developer", home: "Home Automation", social: "Social", ai: "AI", utilities: "Utilities" })[category] ?? "Utilities";
