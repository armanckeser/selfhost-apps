// Cosmos Cloud: a market source is a JSON list of apps (servapps.json) that points at one
// cosmos-compose.json per app. People add https://<pages>/servapps.json under Market → Sources.
// The same folders are what a PR to azukaar/cosmos-servapps-official needs (description.json, icon.png,
// screenshots/, cosmos-compose.json).
//
// Cosmos puts its own login and HTTPS in front of every app (route mode SERVAPP, AuthEnabled). That login
// redirects, which breaks an app installed to a phone's home screen (its service worker and background
// requests get the login page). So an app with its own login (`auth: builtin`) also offers AUTH_PASSWORD:
// set it, then turn the route's Cosmos login off.
import { substitute, firstParagraph, AUTH_FIELD } from "../model.mjs";

const serviceName = (model, service) => (service === model.main ? "{ServiceName}" : `{ServiceName}-${service}`);

export function cosmos(model, { pages }) {
  const passwords = new Map(model.secrets.map((name, index) => [name, `{Passwords.${index}}`]));
  if (passwords.size > 5) throw new Error(`${model.id}: Cosmos generates at most 5 passwords`);
  const resolve = (kind, name) =>
    kind === "secret" ? passwords.get(name)
      : kind === "host" ? serviceName(model, name)
      : kind === "input" ? `{Context.${name}}`
      : model.version;

  const fields = model.auth === "builtin" ? [...model.env, AUTH_FIELD] : model.env;
  const services = {};
  for (const [key, service] of Object.entries(model.services)) {
    const name = serviceName(model, key);
    const resolved = substitute(service, resolve);
    if (key === model.main && model.auth === "builtin") {
      resolved.environment = { ...(resolved.environment ?? {}), AUTH_PASSWORD: "{Context.AUTH_PASSWORD}" };
    }
    const environment = Object.entries(resolved.environment ?? {}).map(([variable, value]) => `${variable}=${value}`);
    const entry = {
      image: resolved.image,
      container_name: name,
      hostname: name,
      restart: "unless-stopped",
      environment,
      labels: {
        "cosmos-stack": "{ServiceName}",
        "cosmos-stack-main": "{ServiceName}",
        "cosmos-force-network-secured": "true",
        "cosmos-auto-update": "true",
        // Keep generated passwords across Cosmos updates of the container.
        "cosmos-persistent-env": Object.keys(resolved.environment ?? {}).join(", "),
        ...(key === model.main ? { "cosmos-icon": `${pages}/servapps/${model.id}/icon.png` } : {}),
      },
      networks: { "{ServiceName}": {} },
    };
    if (resolved.command) entry.command = resolved.command;
    if (resolved.healthcheck) entry.healthcheck = resolved.healthcheck;
    if (resolved.depends_on) entry.depends_on = resolved.depends_on.map((other) => serviceName(model, other));
    if (resolved.volumes) {
      entry.volumes = Object.entries(resolved.volumes).map(([volume, target]) => ({
        source: `{ServiceName}-${volume}`,
        target,
        type: "volume",
      }));
    }
    if (key === model.main) {
      entry.routes = [
        {
          name: "{ServiceName}",
          description: `${model.name} web app`,
          useHost: true,
          target: `http://{ServiceName}:${model.port}`,
          mode: "SERVAPP",
          AuthEnabled: true,
          // Electric's live requests hold for about 20 seconds; leave room for them.
          Timeout: 120000,
          ThrottlePerMinute: 6000,
          BlockCommonBots: true,
          SmartShield: { Enabled: true },
        },
      ];
    }
    services[name] = entry;
  }

  const compose = {
    "cosmos-installer": {
      form: fields.map((field) => ({
        name: field.name,
        label: field.label,
        initialValue: field.default ?? "",
        type: field.type === "password" ? "password" : "text",
      })),
      "post-install": [
        { type: "info", label: `${model.name} is installed. It may take a minute to start the first time.` },
        ...(model.auth === "builtin"
          ? [{ type: "info", label: `Cosmos asks you to sign in before ${model.name}. If you add ${model.name} to a phone's home screen, set its own password and turn off Cosmos's login on its URL: the redirect breaks home-screen apps.` }]
          : []),
      ],
    },
    minVersion: "0.8.0",
    services,
    networks: { "{ServiceName}": {} },
  };

  const description = {
    name: model.name,
    description: model.tagline,
    longDescription: model.description
      .split(/\n\s*\n/)
      .map((paragraph) => `<p>${escapeHtml(paragraph.replace(/\s+/g, " ").trim())}</p>`)
      .join(""),
    tags: [model.category, "self-hosted"],
    repository: model.repo,
    image: `${model.image}:${model.version}`,
    supported_architectures: model.architectures,
  };

  const listing = {
    ...description,
    id: model.id,
    description: firstParagraph(model.tagline),
    icon: `${pages}/servapps/${model.id}/icon.png`,
    screenshots: model.assets.screenshots.map((_, index) => `${pages}/servapps/${model.id}/screenshots/${index + 1}.png`),
    compose: `${pages}/servapps/${model.id}/cosmos-compose.json`,
    artefacts: {},
  };

  return {
    files: {
      [`site/servapps/${model.id}/cosmos-compose.json`]: json(compose),
      [`site/servapps/${model.id}/description.json`]: json(description),
      [`site/servapps/${model.id}/icon.png`]: { copy: model.assets.icon },
      ...Object.fromEntries(model.assets.screenshots.map((file, index) => [`site/servapps/${model.id}/screenshots/${index + 1}.png`, { copy: file }])),
    },
    listing,
  };
}

export function cosmosIndex(listings, store) {
  const servapps = listings.map((listing) => listing);
  return {
    "site/servapps.json": json(servapps),
    "site/index.json": json({ source: `${store.pages}/servapps.json`, showcase: [], all: servapps }),
  };
}

const json = (value) => `${JSON.stringify(value, null, 2)}\n`;
const escapeHtml = (text) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
