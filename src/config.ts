import { z } from "zod";
import { prettifyError } from "zod/v4/core";

// Config schema for the consumer-provided YAML document. Every knob has a
// default, so `{ "card": { "lines": [...] } }` is a complete config; guards
// are bounds and formats, not policy.

const hexColor = z
  .string()
  .regex(/^#[0-9a-f]{6}$/iu, "expected a #rrggbb color");
// No path separators: output files always land inside the output directory.
const svgFileName = z
  .string()
  .regex(/^[\w.-]+\.svg$/u, "expected a plain *.svg file name");

const lineSchema = z.discriminatedUnion("type", [
  z.object({ text: z.string().min(1).max(80), type: z.literal("header") }),
  z.object({ title: z.string().min(1).max(80), type: z.literal("section") }),
  z.object({ type: z.literal("blank") }),
  z.object({
    key: z.string().min(1).max(40),
    type: z.literal("kv"),
    value: z.string().min(1).max(120),
  }),
]);

const themeSchema = z.object({
  added: hexColor,
  background: hexColor,
  deleted: hexColor,
  dots: hexColor,
  key: hexColor,
  text: hexColor,
  value: hexColor,
});

const configSchema = z.object({
  art: z
    .object({
      bands: z.number().min(0.5).max(16).default(3.4),
      // Character columns of the rendered art.
      columns: z.int().min(8).max(256).default(42),
      contrast: z.number().min(0.2).max(8).default(2.6),
      octaves: z.int().min(1).max(8).default(4),
      // MINIMUM rows: the art grows to match the info column when the card
      // has more lines.
      rows: z.int().min(8).max(256).default(24),
      scale: z.number().min(0.5).max(16).default(2.4),
      seed: z.string().min(1).max(64).default("daily"),
      warp: z.number().min(0).max(8).default(2.4),
      width: z.int().min(64).max(2048).default(420),
    })
    .prefault({}),

  ascii: z
    .object({
      // Extra ascii-image-converter flags, passed as-is (argv array, no
      // shell); --dimensions is derived from art.columns/rows.
      flags: z
        .array(z.string().min(1).max(64))
        .max(16)
        .default([])
        .refine((flags) => !flags.includes("--dimensions"), {
          message: "use art.columns / art.rows instead of --dimensions",
        }),
    })
    .prefault({}),

  card: z.object({
    // "left" pads values to a shared column; "right" pads them flush to
    // the line end, like the classic neofetch cards.
    align: z.enum(["left", "right"]).default("left"),
    lines: z.array(lineSchema).min(1).max(48),
    // Render every card text lowercase (dynamic API values included).
    lowercase: z.boolean().default(false),
  }),

  layout: z
    .object({
      charWidthPx: z.number().min(4).max(24).default(9.9),
      columnGapPx: z.number().min(0).max(96).default(24),
      cornerRadiusPx: z.number().min(0).max(48).default(15),
      fontFamily: z
        .string()
        .max(200)
        .default("'JetBrains Mono', 'Cascadia Code', Consolas, monospace"),
      fontSizePx: z.number().min(8).max(32).default(16),
      paddingPx: z.number().min(0).max(64).default(16),
      rowHeightPx: z.number().min(10).max(48).default(20),
      ruleWidth: z.int().min(16).max(120).default(56),
      valueColumn: z.int().min(8).max(64).default(20),
    })
    .prefault({}),

  // Defaults to the repository owner in CI (GITHUB_REPOSITORY_OWNER).
  login: z
    .string()
    .regex(
      /^[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?$/iu,
      "expected a GitHub username"
    )
    .optional(),

  output: z
    .object({
      dark: svgFileName.default("dark_mode.svg"),
      light: svgFileName.default("light_mode.svg"),
    })
    .prefault({}),

  themes: z
    .object({
      dark: themeSchema.prefault({
        added: "#3fb950",
        background: "#161b22",
        deleted: "#f85149",
        dots: "#616e7f",
        key: "#ffa657",
        text: "#c9d1d9",
        value: "#a5d6ff",
      }),
      light: themeSchema.prefault({
        added: "#1a7f37",
        background: "#f6f8fa",
        deleted: "#cf222e",
        dots: "#9ba3ae",
        key: "#953800",
        text: "#24292f",
        value: "#0a3069",
      }),
    })
    .prefault({}),

  // ISO date `{uptime}` counts from — career start, birthday, whatever
  // fits your wording; required only if the placeholder is used.
  uptimeStart: z.string().date().optional(),
});

export type Config = z.infer<typeof configSchema>;
export type CardLine = Config["card"]["lines"][number];
export type Theme = Config["themes"]["dark"];

// The config arrives as inline YAML (the action's `config` input). YAML is
// a superset of JSON, so JSON works too.
export const loadConfig = (source: string | undefined): Config => {
  if (!source?.trim()) {
    throw new Error(
      "The `config` input is empty: pass the card as inline YAML."
    );
  }

  const parsed = configSchema.safeParse(Bun.YAML.parse(source));

  if (!parsed.success) {
    throw new Error(`Invalid config:\n${prettifyError(parsed.error)}`);
  }

  return parsed.data;
};
