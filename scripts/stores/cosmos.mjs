// Cosmos Cloud: a market source is { source, showcase, all } (index.json; Cosmos's src/market/update.go
// decodes exactly that), and each app points at its own cosmos-compose.json. People add
// https://<pages>/servapps.json (or index.json, the same) under Market → Sources → Add Source.
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
    // A string, which Cosmos splits on whitespace (strings.Fields), so no argument may contain a space.
    if (resolved.command) {
      const args = [resolved.command].flat();
      if (args.some((arg) => /\s/.test(arg))) throw new Error(`Cosmos: ${model.id} ${key} has a command argument with a space`);
      entry.command = args.join(" ");
    }
    // Cosmos decodes these into Go structs (src/docker/api_blueprint.go), not compose: healthcheck
    // durations are whole seconds, and depends_on is a map of service → { condition }. A compose-style
    // "5s" or a list makes the install request fail to decode.
    if (resolved.healthcheck) entry.healthcheck = cosmosHealthcheck(resolved.healthcheck);
    if (resolved.depends_on) {
      entry.depends_on = Object.fromEntries(resolved.depends_on.map((other) => [
        serviceName(model, other),
        { condition: model.services[other]?.healthcheck ? "service_healthy" : "service_started" },
      ]));
    }
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
    checkCosmosTypes(`${model.id} ${key}`, entry);
    services[name] = entry;
  }

  const compose = {
    "cosmos-installer": {
      // A field's help goes in an `info` row above it, the one place Cosmos's form shows extra text
      // (client/src/pages/servapps/containers/docker-compose.jsx).
      form: fields.flatMap((field) => [
        ...(field.help ? [{ name: `${field.name}_help`, label: field.help, type: "info" }] : []),
        {
          name: field.name,
          label: field.label,
          initialValue: field.default ?? "",
          type: field.type === "password" ? "password" : "text",
        },
      ]),
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
    // Both names hold the same source: servapps.json is the URL already given out.
    "site/servapps.json": json({ source: `${store.pages}/servapps.json`, showcase: [], all: servapps }),
    "site/index.json": json({ source: `${store.pages}/index.json`, showcase: [], all: servapps }),
  };
}

const seconds = (value) => {
  if (typeof value === "number") return value;
  const match = /^(\d+)(ms|s|m|h)?$/.exec(String(value));
  if (!match) throw new Error(`Cosmos: cannot read the duration ${value}`);
  const amount = Number(match[1]);
  return { ms: amount / 1000, s: amount, m: amount * 60, h: amount * 3600 }[match[2] ?? "s"];
};

const cosmosHealthcheck = ({ test, interval, timeout, retries, start_period }) => ({
  test,
  ...(interval !== undefined ? { interval: seconds(interval) } : {}),
  ...(timeout !== undefined ? { timeout: seconds(timeout) } : {}),
  ...(retries !== undefined ? { retries } : {}),
  ...(start_period !== undefined ? { start_period: seconds(start_period) } : {}),
});

// The field types of Cosmos's ContainerCreateRequestContainer (src/docker/api_blueprint.go) for every
// field written above. Go's decoder refuses a mismatch, and Cosmos then fails the install, so a mismatch
// fails the build here instead.
const isStrings = (value) => Array.isArray(value) && value.every((item) => typeof item === "string");
const isStringMap = (value) => value && typeof value === "object" && !Array.isArray(value) && Object.values(value).every((item) => typeof item === "string");
const isObjectMap = (value) => value && typeof value === "object" && !Array.isArray(value) && Object.values(value).every((item) => item && typeof item === "object" && !Array.isArray(item));
const COSMOS_TYPES = {
  image: (v) => typeof v === "string",
  container_name: (v) => typeof v === "string",
  hostname: (v) => typeof v === "string",
  restart: (v) => typeof v === "string",
  command: (v) => typeof v === "string",
  environment: isStrings,
  labels: isStringMap,
  networks: isObjectMap,
  depends_on: isObjectMap,
  volumes: (v) => Array.isArray(v) && v.every((m) => typeof m.source === "string" && typeof m.target === "string" && typeof m.type === "string"),
  routes: Array.isArray,
  healthcheck: (v) => isStrings(v.test) && ["interval", "timeout", "retries", "start_period"].every((k) => v[k] === undefined || Number.isInteger(v[k])),
};
function checkCosmosTypes(where, entry) {
  for (const [field, value] of Object.entries(entry)) {
    const check = COSMOS_TYPES[field];
    if (!check) throw new Error(`Cosmos: ${where} writes ${field}, which has no type check here`);
    if (!check(value)) throw new Error(`Cosmos: ${where} ${field} is not the type Cosmos decodes`);
  }
}

const json = (value) => `${JSON.stringify(value, null, 2)}\n`;
const escapeHtml = (text) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
