import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { renderArt } from "./art";
import type { Config } from "./config";

// Renders the generative art into a temp dir (it is an intermediate — only
// the SVGs get published), then converts it to ASCII with
// ascii-image-converter (https://github.com/TheZoraiz/ascii-image-converter).
// Install locally: `brew install TheZoraiz/ascii-image-converter/ascii-image-converter`.
export const generateAsciiArt = async (
  config: Config,
  rows: number
): Promise<string[]> => {
  const workDir = mkdtempSync(
    path.join(os.tmpdir(), "ascii-profile-card-art-")
  );
  const artFile = path.join(workDir, "art.png");

  try {
    await renderArt(config.art, rows, artFile);

    const proc = Bun.spawn(
      [
        "ascii-image-converter",
        artFile,
        "--dimensions",
        `${String(config.art.columns)},${String(rows)}`,
        ...config.ascii.flags,
      ],
      {
        stderr: "pipe",
        stdout: "pipe",
      }
    );
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ]);

    if (exitCode !== 0) {
      throw new Error(
        `ascii-image-converter failed (${String(exitCode)}):\n${stderr}`
      );
    }

    // The converter prints some errors to stdout and still exits 0.
    if (stdout.startsWith("Error")) {
      throw new Error(`ascii-image-converter failed:\n${stdout}`);
    }

    // Trim only trailing newlines: space-only rows are real art content
    // (dark regions of the field) and must keep their place.
    return stdout.replace(/\n+$/u, "").split("\n");
  } finally {
    rmSync(workDir, { force: true, recursive: true });
  }
};
