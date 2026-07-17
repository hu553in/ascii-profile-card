import path from "node:path";

import { generateAsciiArt } from "./ascii";
import { loadConfig } from "./config";
import { fetchStats } from "./github";
import { renderSvg } from "./render";

// Entry point for both the GitHub Action and local runs:
//   CONFIG — the card as inline YAML (locally: CONFIG="$(cat example-config.yml)")
//   OUTPUT_DIR — where the SVGs land (default: out)
//   GITHUB_TOKEN — token for stats (placeholder stats when missing)

const outputDir = process.env["OUTPUT_DIR"] ?? "out";

const config = loadConfig(process.env["CONFIG"]);
const login = config.login ?? process.env["GITHUB_REPOSITORY_OWNER"];

if (!login) {
  throw new Error(
    'Set "login" in the config (or run in CI where GITHUB_REPOSITORY_OWNER is set).'
  );
}

const usedPlaceholders = new Set<string>();

for (const line of config.card.lines) {
  if (line.type === "kv") {
    for (const match of line.value.matchAll(/\{(?<name>\w+)\}/gu)) {
      usedPlaceholders.add(match.groups?.["name"] ?? "");
    }
  }
}

const [art, stats] = await Promise.all([
  generateAsciiArt(config),
  fetchStats(login, process.env["GITHUB_TOKEN"], usedPlaceholders),
]);

await Promise.all(
  Object.entries(config.themes).map(([themeName, theme]) => {
    const file = path.join(
      outputDir,
      config.output[themeName as keyof typeof config.output]
    );

    console.log(`Rendering ${file}`);

    return Bun.write(file, renderSvg(config, art, stats, theme));
  })
);
