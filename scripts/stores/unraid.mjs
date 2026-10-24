// Unraid Community Apps: one XML template per container, in a public repo with ca_profile.xml at its root,
// registered once at https://ca.unraid.net/submit. Community Apps installs one container per template, so
// these use the app's all-in-one image (Postgres, Electric and the app together, everything under /data),
// or, for an app that is one container already (`aio: false`), its own image.
//
// Unraid puts no login in front of apps, so the template offers the app's own AUTH_PASSWORD.
import { AUTH_FIELD } from "../model.mjs";

// Settings the app can't start without, shown above the install form.
const requires = (model) => {
  const needed = model.env.filter((field) => field.required);
  return needed.length ? `
  <Requires>${xml(needed.map((field) => `${field.label}.${field.help ? ` ${field.help}` : ""}`).join(" "))}</Requires>` : "";
};

export function unraid(model, store) {
  const single = Object.values(model.services);
  const own = model.aioImage === null && single.length === 1 ? single[0] : null;
  if (model.aioImage === null && !own) return { files: {} };
  const image = own ? `${model.image}:latest` : model.aioImage.replace("${version}-aio", "aio");
  const dataTarget = own ? (Object.values(own.volumes ?? {})[0] ?? "/data") : "/data";
  const fields = model.auth === "builtin" ? [...model.env, AUTH_FIELD] : model.env;
  const raw = `https://raw.githubusercontent.com/${store.repo}/main`;
  const config = [
    `  <Config Name="Web UI" Target="${model.port}" Default="${model.hostPort}" Mode="tcp" Description="Port for the web app." Type="Port" Display="always" Required="true" Mask="false">${model.hostPort}</Config>`,
    `  <Config Name="Data" Target="${dataTarget}" Default="/mnt/user/appdata/${model.id}" Mode="rw" Description="Everything the app keeps: its database and settings. Back this up." Type="Path" Display="always" Required="true" Mask="false">/mnt/user/appdata/${model.id}</Config>`,
    ...fields.map(
      (field) =>
        `  <Config Name="${xml(field.label)}" Target="${field.name}" Default="${xml(field.default ?? "")}" Description="${xml(field.help ?? field.label)}" Type="Variable" Display="always" Required="${field.required ? "true" : "false"}" Mask="${field.type === "password" ? "true" : "false"}">${xml(field.default ?? "")}</Config>`,
    ),
    `  <Config Name="Time zone" Target="TZ" Default="UTC" Description="Time zone, e.g. America/New_York." Type="Variable" Display="advanced" Required="false" Mask="false">UTC</Config>`,
  ];

  const template = `<?xml version="1.0"?>
<Container version="2">
  <Name>${xml(model.name)}</Name>
  <Repository>${image}</Repository>
  <Registry>https://${model.image}</Registry>
  <Network>bridge</Network>
  <Shell>bash</Shell>
  <Privileged>false</Privileged>
  <Support>${xml(model.support)}</Support>
  <Project>${xml(model.repo)}</Project>
  <Overview>${xml(`${model.tagline}\n\n${model.description}`)}</Overview>
  <Category>${unraidCategory(model.category)}</Category>
  <WebUI>http://[IP]:[PORT:${model.port}]${model.path || "/"}</WebUI>
  <TemplateURL>${raw}/unraid/${model.id}.xml</TemplateURL>
  <Icon>${raw}/unraid/icons/${model.id}.png</Icon>
  <Changes>${xml(`${model.version}${model.releaseNotes ? `: ${model.releaseNotes.split("\n")[0]}` : ""}`)}</Changes>
  <License>${xml(model.license)}</License>${requires(model)}
${model.assets.screenshots.map((_, index) => `  <Screenshot>${raw}/unraid/screenshots/${model.id}-${index + 1}.png</Screenshot>`).join("\n")}
${config.join("\n")}
</Container>
`;
  return {
    files: {
      [`unraid/${model.id}.xml`]: template,
      [`unraid/icons/${model.id}.png`]: { copy: model.assets.icon },
      ...Object.fromEntries(model.assets.screenshots.map((file, index) => [`unraid/screenshots/${model.id}-${index + 1}.png`, { copy: file }])),
    },
  };
}

export const caProfile = (store) => `<?xml version="1.0"?>
<CommunityApplications>
  <Profile>${xml(store.description)} Every app here is an all-in-one container: map one appdata folder and open the web UI. Support for each app is on its GitHub issues page.</Profile>
  <Icon>${xml(store.icon)}</Icon>
  <WebPage>${store.url}</WebPage>
</CommunityApplications>
`;

const xml = (text) => String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const unraidCategory = (category) =>
  ({ productivity: "Productivity:", finance: "Tools:Utilities", media: "MediaApp:Other", development: "Tools:Utilities", home: "HomeAutomation:", social: "Network:Other", ai: "Tools:Utilities", utilities: "Tools:Utilities" })[category] ?? "Tools:Utilities";
