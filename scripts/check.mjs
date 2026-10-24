// Validates the generated packages against the stores' own published schemas, so a field a store would
// reject fails the build instead of someone's install. Cosmos's field types are checked as each file is
// written (stores/cosmos.mjs), since Cosmos publishes no schema.
import { readdirSync, readFileSync } from "node:fs";
import Ajv from "ajv";

const RUNTIPI_SCHEMA = "https://raw.githubusercontent.com/runtipi/runtipi-appstore/master/apps/app-info-schema.json";

const schema = await (await fetch(RUNTIPI_SCHEMA)).json();
const validate = new Ajv({ allErrors: true, strict: false }).compile(schema);

let failed = false;
for (const app of readdirSync("apps")) {
  const config = JSON.parse(readFileSync(`apps/${app}/config.json`, "utf8"));
  if (validate(config)) {
    console.log(`ok   runtipi ${app}`);
  } else {
    failed = true;
    console.error(`FAIL runtipi ${app}: ${validate.errors.map((error) => `${error.instancePath} ${error.message}`).join("; ")}`);
  }
}
if (failed) process.exit(1);
