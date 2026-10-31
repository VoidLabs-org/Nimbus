// Writes src/schema.ts, the TypeScript types of the API contract (docs/specs/openapi.yaml), with openapi-typescript.
// With --check it writes nothing and fails when src/schema.ts is not what the contract generates, so a contract
// change can't land without its types (check-types runs it).
import { readFileSync, writeFileSync } from "node:fs";
import openapiTS, { astToString } from "openapi-typescript";

const contract = new URL("../../../docs/specs/openapi.yaml", import.meta.url);
const target = new URL("../src/schema.ts", import.meta.url);

const header =
  "// Generated from docs/specs/openapi.yaml by `pnpm --filter @repo/api generate`. Don't edit: change the contract and\n// generate again.\n\n";
const schema = header + astToString(await openapiTS(contract));

if (process.argv.includes("--check")) {
  let current = "";
  try {
    current = readFileSync(target, "utf8");
  } catch {
    // Missing counts as out of date.
  }
  if (current.replace(/\r\n/g, "\n") !== schema) {
    console.error(
      "packages/api/src/schema.ts is out of date with docs/specs/openapi.yaml. Run: pnpm --filter @repo/api generate",
    );
    process.exit(1);
  }
} else {
  writeFileSync(target, schema);
}
