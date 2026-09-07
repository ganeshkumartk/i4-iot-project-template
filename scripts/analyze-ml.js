import { analyzeTelemetryDataset } from "../server/ml-analysis.js";
import path from "path";
import { fileURLToPath } from "url";

function parseArgs(argv) {
  const out = { input: null, source: "auto" };

  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--input" && argv[i + 1]) {
      out.input = argv[++i];
      continue;
    }
    if (arg === "--source" && argv[i + 1]) {
      const value = argv[++i].trim().toLowerCase();
      if (["auto", "csv", "synthetic"].includes(value)) out.source = value;
    }
  }

  return out;
}

function main() {
  const args = parseArgs(process.argv);
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const repoRoot = path.resolve(__dirname, "..");
  const dataDir = path.join(repoRoot, "data");

  try {
    const result = analyzeTelemetryDataset({
      dataDir,
      inputPath: args.input ? path.resolve(process.cwd(), args.input) : undefined,
      source: args.source,
    });

    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error(error.message || String(error));
    process.exit(1);
  }
}

main();
