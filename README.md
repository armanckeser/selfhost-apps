# Armanc's self-hosted apps

One-click installs of my self-hosted apps for Cosmos, Umbrel, CasaOS/ZimaOS, Runtipi, Unraid and Portainer.
Add this catalog to your server once, and every app shows up in its app store, updated when a new
version is released.

**The apps, with screenshots and plain `docker` commands: [armanckeser.github.io/selfhost-apps](https://armanckeser.github.io/selfhost-apps)**

## Add the catalog to your server

| Server | Where | Paste |
| --- | --- | --- |
| Cosmos | Market → Sources → Add | `https://armanckeser.github.io/selfhost-apps/servapps.json` |
| Umbrel | App Store → ⋯ → Community App Stores | `https://github.com/armanckeser/selfhost-apps` |
| CasaOS / ZimaOS | App Store → Add source | `https://github.com/armanckeser/selfhost-apps/archive/refs/heads/casaos.zip` |
| Runtipi | Settings → App Stores → Add | `https://github.com/armanckeser/selfhost-apps` |
| Unraid | Apps (Community Apps) | search for the app's name |
| Portainer | Settings → App Templates → URL | `https://armanckeser.github.io/selfhost-apps/portainer/templates.json` |

Plain Docker works too: every app publishes its compose file to ghcr, so one command installs it with no
checkout.

```bash
docker compose -f oci://ghcr.io/armanckeser/<app>-stack:latest up -d
```

Cosmos and Umbrel ask who you are before a request reaches an app. CasaOS, Runtipi, Unraid and Portainer
don't, so their install forms offer the app's own password (`AUTH_PASSWORD`). Set one if anyone else on
your network can reach the server.

## How it works

Each app's repo carries `selfhost/app.yaml`: its name, description, images, port and the settings the
install form asks for. `npm run generate` reads that file from every app's latest release and writes each
store's format:

| Output | Store |
| --- | --- |
| `armanckeser-<app>/` and `umbrel-app-store.yml` | Umbrel community store (read from the default branch) |
| `apps/armanckeser-<app>/` | Runtipi app store |
| `unraid/` and `ca_profile.xml` | Unraid Community Apps (all-in-one `:aio` images) |
| `casaos/Apps/` → `casaos` branch | CasaOS / ZimaOS store |
| `site/servapps.json`, `site/servapps/` | Cosmos market source |
| `site/portainer/templates.json` | Portainer App Templates |

Everything outside `catalog.yaml`, `scripts/` and this README is generated. CI regenerates it daily and
when an app's release workflow sends `repository_dispatch` (`app-released`).

```bash
npm install
npm run generate                                # from each app's latest release
npm run generate -- --local kumbara=../kumbara  # try a local manifest before releasing it
```

### An app's manifest

Apps built from the agent-first-apps template use the preset, which is the app image + Postgres + Electric:

```yaml
id: kumbara
name: Kumbara
tagline: Budgeting that opens instantly on your phone.
description: |
  Paragraphs, plain text.
stack: agent-first
auth: builtin
image: ghcr.io/armanckeser/kumbara
icon: selfhost/icon.png
screenshots: [img/screenshot-1.png]
host_port: 5182
env:
  - name: SIMPLEFIN_TOKEN
    label: SimpleFIN setup token
    type: password
```

Any other app lists its services. Values may use `${secret:name}` (generated per install), `${host:service}`,
`${input:NAME}` (a field under `env`) and `${version}`:

```yaml
services:
  app:
    image: ghcr.io/armanckeser/jellymeme:${version}
    port: 8080
    environment:
      JELLYFIN_URL: ${input:JELLYFIN_URL}
    volumes:
      data: /data
```

`stores: { umbrel: false }` leaves an app out of one store, for example when it needs a setting that Umbrel
(which has no install form) cannot ask for.

## Official stores

The goal is to get each app into the official stores too, once it has run well here. The same generated
files are what those pull requests need.

| Store | Status |
| --- | --- |
| Cosmos (`azukaar/cosmos-servapps-official`) | not submitted |
| Umbrel (`getumbrel/umbrel-apps`) | not submitted |
| CasaOS (`IceWhaleTech/CasaOS-AppStore`) | not submitted |
| TrueNAS (`truenas/apps`, community train) | not submitted |
| Runtipi | closed to new apps; this catalog is the way in |

## License

The catalog's scripts and metadata are MIT. Each app has its own license (all AGPL-3.0 today).
