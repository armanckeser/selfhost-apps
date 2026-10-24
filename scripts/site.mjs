// The Pages landing page: every app, and how to add this catalog to each store. Plain words (see the
// README): what to paste where.

const STORES = (store) => [
  ["Cosmos", `Market → Sources → Add Source → <code>${store.pages}/servapps.json</code>`],
  ["Umbrel", `App Store → ⋯ → Community App Stores → add <code>${store.url}</code>`],
  ["CasaOS / ZimaOS", `App Store → Add Source → <code>${store.url}/archive/refs/heads/casaos.zip</code>`],
  ["Runtipi", `Settings → App Stores → Add App Store → <code>${store.url}</code>`],
  ["Unraid", `Not in Community Apps yet: copy the app's XML from <code>unraid/</code> in the repo to <code>/boot/config/plugins/dockerMan/templates-user/</code>, then Docker → Add Container`],
  ["Portainer", `Settings → App Templates → URL <code>${store.pages}/portainer/templates.json</code>`],
];

const escape = (text) => String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function site(models, store) {
  const apps = models
    .map(
      (model) => `
      <li class="app">
        <img src="servapps/${model.id}/icon.png" alt="" width="56" height="56" />
        <div>
          <h3><a href="${escape(model.repo)}">${escape(model.name)}</a> <span class="version">${escape(model.version)}</span></h3>
          <p>${escape(model.tagline)}</p>
          <details>
            <summary>Docker</summary>
            <pre>${model.composeUrl ? `docker compose -f oci://${escape(model.image)}-stack:latest up -d` : ""}${model.aioImage ? `\ndocker run -d -p ${model.hostPort}:${model.port} -v ${escape(model.id)}:/data ${escape(model.image)}:aio` : ""}</pre>
          </details>
        </div>
      </li>`,
    )
    .join("");
  const stores = STORES(store)
    .map(([name, how]) => `<li><strong>${name}</strong><span>${how}</span></li>`)
    .join("");
  return {
    "site/index.html": `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escape(store.name)}</title>
<meta name="description" content="${escape(store.description)}" />
<style>
  :root { --bg: #fafaf9; --fg: #1c1917; --muted: #57534e; --line: #e7e5e4; --card: #ffffff; --accent: #2563eb; }
  @media (prefers-color-scheme: dark) { :root { --bg: #0c0a09; --fg: #f5f5f4; --muted: #a8a29e; --line: #292524; --card: #1c1917; --accent: #60a5fa; } }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--bg); color: var(--fg); font: 16px/1.55 system-ui, sans-serif; }
  main { max-width: 760px; margin: 0 auto; padding: 48px 16px 64px; }
  h1 { font-size: 28px; margin: 0 0 8px; } h2 { font-size: 18px; margin: 40px 0 12px; } h3 { font-size: 17px; margin: 0; }
  p { margin: 4px 0; color: var(--muted); } a { color: var(--accent); text-decoration: none; } a:hover { text-decoration: underline; }
  ul { list-style: none; padding: 0; margin: 0; display: grid; gap: 12px; }
  .app { display: flex; gap: 16px; padding: 16px; background: var(--card); border: 1px solid var(--line); border-radius: 14px; }
  .app img { border-radius: 12px; flex: none; }
  .app > div { min-width: 0; flex: 1; }
  .version { font-weight: 400; font-size: 13px; color: var(--muted); }
  details { margin-top: 8px; } summary { cursor: pointer; color: var(--muted); font-size: 14px; }
  pre { overflow-x: auto; font-size: 13px; background: var(--bg); border: 1px solid var(--line); border-radius: 8px; padding: 10px; }
  .stores li { display: grid; gap: 2px; padding: 12px 0; border-bottom: 1px solid var(--line); }
  .stores span { color: var(--muted); font-size: 15px; overflow-wrap: anywhere; }
  code { font-size: 13px; overflow-wrap: anywhere; }
</style>
</head>
<body>
<main>
  <h1>${escape(store.name)}</h1>
  <p>${escape(store.description)}</p>
  <h2>Apps</h2>
  <ul>${apps}</ul>
  <h2>Add these apps to your server</h2>
  <ul class="stores">${stores}</ul>
  <p style="margin-top:24px">Source and issues: <a href="${store.url}">${store.url.replace("https://", "")}</a></p>
</main>
</body>
</html>
`,
  };
}
