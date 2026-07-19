# ASCII profile card

[![CI](https://github.com/hu553in/ascii-profile-card/actions/workflows/ci.yml/badge.svg)](https://github.com/hu553in/ascii-profile-card/actions/workflows/ci.yml)

GitHub Action that generates Neofetch-style SVG profile cards with daily ASCII art and live GitHub
stats. It publishes dark and light variants to a dedicated branch that you can embed in a profile
README.

![Example card](https://raw.githubusercontent.com/hu553in/ascii-profile-card/output/dark_mode.svg)

The example is generated from [`example-config.yml`](example-config.yml) by this repository's
[`example.yml`](.github/workflows/example.yml) workflow.

## Quick start

1. Add `.github/workflows/ascii-profile-card.yml` to your profile repository:

   ```yaml
   name: ASCII profile card

   on:
     push:
       branches:
         - main
     schedule:
       - cron: '0 4 * * *'
     workflow_dispatch:

   permissions:
     contents: write

   jobs:
     card:
       runs-on: ubuntu-latest
       steps:
         - uses: hu553in/ascii-profile-card@v1
           with:
             config: |
               card:
                 lines:
                   - { type: header, text: 'Your Name' }
                   - { type: kv, key: Role, value: 'What you do' }
                   - { type: section, title: 'GitHub stats' }
                   - { type: kv, key: Stars, value: '{stars}' }
   ```

   The scheduled run refreshes live stats and changes the date-seeded art once a day. The `v1` tag
   receives backward-compatible updates; use an exact tag such as `v1.1.0` or a commit SHA for an
   immutable pin.

2. Embed the generated files in your profile `README.md`, replacing `YOU` with your GitHub login:

   ```html
   <picture>
     <source
       media="(prefers-color-scheme: dark)"
       srcset="https://raw.githubusercontent.com/YOU/YOU/output/dark_mode.svg"
     />
     <img
       alt="ASCII profile card"
       src="https://raw.githubusercontent.com/YOU/YOU/output/light_mode.svg"
     />
   </picture>
   ```

The first successful run creates the orphan `output` branch. Later runs replace its generated files.

## Inputs

| Input    | Default        | Description                                            |
| -------- | -------------- | ------------------------------------------------------ |
| `config` | Required       | Card configuration as an inline YAML document          |
| `token`  | `github.token` | Token used for GitHub stats and the output branch push |
| `branch` | `output`       | Branch that receives the rendered SVG files            |

The workflow needs `contents: write` so the default token can update the output branch. The default
token reads public profile data. To include private contribution data, pass a token that can read
the relevant repositories and write to the profile repository.

## Configuration

Only `card.lines` is required. The complete copy-ready configuration, including every default, is in
[`example-config.yml`](example-config.yml).

### Card lines

| Type      | Fields         | Result                                        |
| --------- | -------------- | --------------------------------------------- |
| `header`  | `text`         | Main heading followed by a horizontal rule    |
| `section` | `title`        | Section heading followed by a horizontal rule |
| `kv`      | `key`, `value` | Key/value row with a dot leader               |
| `blank`   | None           | Empty row                                     |

`card.align` aligns values to a shared column (`left`) or the right edge (`right`). `card.lowercase`
applies lowercase after live values are inserted.

### Live placeholders

| Placeholder          | Value                                                      |
| -------------------- | ---------------------------------------------------------- |
| `{repos}`            | Owned, non-fork repositories                               |
| `{contributedRepos}` | Repositories contributed to                                |
| `{stars}`            | Stars across owned, non-fork repositories                  |
| `{followers}`        | Followers                                                  |
| `{contributions}`    | Contributions since account creation                       |
| `{topLanguages}`     | Four most-used languages by repository language size       |
| `{loc}`              | Lifetime additions minus deletions                         |
| `{locAdded}`         | Lifetime additions, rendered with the theme's add color    |
| `{locDeleted}`       | Lifetime deletions, rendered with the theme's delete color |
| `{uptime}`           | Years and months since `uptimeStart`                       |

Stats are fetched lazily: unused placeholder groups make no API requests. LOC values use GitHub's
precomputed weekly code-frequency data for owned, non-fork repositories and may omit repositories
for which GitHub does not provide statistics.

### Appearance and output

- `art` controls the seed, `columns` / `rows` (rows is a minimum — the art grows to match a taller
  info column), noise, warp, contour bands, and contrast.
- `ascii.flags` — extra `ascii-image-converter` flags as an argument array (`--dimensions` is
  derived from `art.columns` / `art.rows`).
- `layout` controls font, spacing, rule width, value column, padding, and corner radius.
- `themes.dark` and `themes.light` define SVG colors.
- `output.dark` and `output.light` set the generated file names.
- `login` selects the stats account and defaults to the repository owner.

The generated SVG grows to fit the configured rows and longest line, then scales to the width of the
README column.

## How it works

The action renders date-seeded noise to PNG with [Sharp](https://sharp.pixelplumbing.com), converts
it to text with [ascii-image-converter](https://github.com/TheZoraiz/ascii-image-converter), fetches
only the needed GitHub data through [Octokit](https://github.com/octokit/graphql.js), renders two
self-contained SVGs, and publishes them with
[actions-gh-pages](https://github.com/peaceiris/actions-gh-pages).

The action currently supports Linux x64 runners such as `ubuntu-latest`.

## Development

Requirements:

- Bun 1.3.14
- [ascii-image-converter 1.13.1](https://github.com/TheZoraiz/ascii-image-converter/releases/tag/v1.13.1)
- [GitHub CLI](https://cli.github.com)
- `xmllint`

```bash
brew install TheZoraiz/ascii-image-converter/ascii-image-converter
bun i
CONFIG="$(cat example-config.yml)" GITHUB_TOKEN="$(gh auth token)" bun generate
bun check
bun check:fix
```

`bun check` runs formatting, linting, action and workflow validation, TypeScript, unused dependency
checks, a production dependency audit, and a complete example render with XML and content checks.

## Releases

```bash
bun release:patch
bun release:minor
bun release:major
```

Release It! runs the full check, updates `package.json`, creates the conventional release commit and
annotated `vX.Y.Z` tag, and pushes both. CI creates a draft GitHub release with generated notes.
Enable **Publish this Action to the GitHub Marketplace**, choose the Marketplace categories, and
publish the draft. Publishing makes the exact release immutable and moves its floating major tag,
such as `v1`, to the newly published stable version.

## License

[MIT](LICENSE)
