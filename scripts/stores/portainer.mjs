// Portainer (and Dockge-style tools that read the same list): App Templates v3, one JSON file. People set
// https://<pages>/portainer/templates.json under Settings → App Templates. Each entry is a git stack that
// deploys the app's own docker-compose.selfhost.yml at its release tag, so Portainer runs exactly what a
// `docker compose up` would.
import { AUTH_FIELD } from "../model.mjs";

export function portainer(model, store) {
  if (!model.composeUrl) return { template: null };
  const fields = model.auth === "builtin" ? [...model.env, AUTH_FIELD] : model.env;
  return {
    template: {
      type: 3,
      title: model.name,
      name: model.id,
      description: model.tagline,
      note: `${model.description.split(/\n\s*\n/)[0]} Open http://&lt;server&gt;:${model.hostPort} after it starts.`,
      categories: [model.category],
      platform: "linux",
      logo: `${store.pages}/portainer/${model.id}.png`,
      repository: { url: model.repo, stackfile: model.composeUrl },
      env: [
        { name: "TAG", label: "Version", default: model.version },
        { name: "PORT", label: "Web port on this server", default: String(model.hostPort) },
        ...fields.map((field) => ({ name: field.name, label: field.label, default: field.default ?? "" })),
      ],
    },
    files: { [`site/portainer/${model.id}.png`]: { copy: model.assets.icon } },
  };
}

export const portainerIndex = (templates) => ({
  "site/portainer/templates.json": `${JSON.stringify({ version: "3", templates }, null, 2)}\n`,
});
