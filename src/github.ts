import { graphql } from "@octokit/graphql";

export interface Stats {
  contributedRepos: number;
  contributions: number;
  followers: number;
  loc: number;
  locAdded: number;
  locDeleted: number;
  repos: number;
  stars: number;
  topLanguages: string[];
}

interface RepositoriesPage {
  user: {
    repositories: {
      totalCount: number;
      nodes: {
        name: string;
        stargazerCount: number;
        languages: { edges: { size: number; node: { name: string } }[] };
      }[];
      pageInfo: { endCursor: string | null; hasNextPage: boolean };
    };
  };
}

type Gql = ReturnType<typeof graphql.defaults>;

const REPOSITORY_STATS = ["repos", "stars", "topLanguages"] as const;
const PROFILE_STATS = [
  "contributedRepos",
  "followers",
  "contributions",
] as const;
const LOC_STATS = ["loc", "locAdded", "locDeleted"] as const;

const emptyStats: Stats = {
  contributedRepos: 0,
  contributions: 0,
  followers: 0,
  loc: 0,
  locAdded: 0,
  locDeleted: 0,
  repos: 0,
  stars: 0,
  topLanguages: ["?"],
};

// Lifetime additions/deletions, summed from GitHub's precomputed weekly
// [timestamp, additions, deletions] rows. The endpoint returns 202 while
// GitHub computes the rows, so poll a few times; repos without data
// (empty or too large) count as zero.
const codeFrequency = async (
  login: string,
  repo: string,
  token: string
): Promise<{ added: number; deleted: number }> => {
  let ready: Response | undefined;

  for (let attempt = 0; attempt < 5; attempt += 1) {
    // oxlint-disable-next-line no-await-in-loop -- polling: each retry waits for GitHub to finish computing.
    const response = await fetch(
      `https://api.github.com/repos/${login}/${repo}/stats/code_frequency`,
      { headers: { authorization: `token ${token}` } }
    );

    if (response.status === 200) {
      ready = response;
      break;
    }

    if (response.status !== 202) {
      break;
    }

    // oxlint-disable-next-line no-await-in-loop -- polling backoff.
    await Bun.sleep(2000);
  }

  if (!ready) {
    return { added: 0, deleted: 0 };
  }

  const weeks = (await ready.json()) as [number, number, number][];
  let added = 0;
  let deleted = 0;

  for (const [, weekAdded, weekDeleted] of weeks) {
    added += weekAdded;
    deleted += Math.abs(weekDeleted);
  }

  return { added, deleted };
};

// Owned non-fork repositories: count, stars, language sizes, names.
const fetchRepositories = async (gql: Gql, login: string, stats: Stats) => {
  const languageSizes = new Map<string, number>();
  const repoNames: string[] = [];
  let cursor: string | null = null;

  do {
    // oxlint-disable-next-line no-await-in-loop -- cursor pagination is inherently sequential: each page needs the previous page's cursor.
    const page: RepositoriesPage = await gql<RepositoriesPage>(
      `query ($login: String!, $cursor: String) {
        user(login: $login) {
          repositories(first: 100, after: $cursor, ownerAffiliations: OWNER, isFork: false) {
            totalCount
            nodes {
              name
              stargazerCount
              languages(first: 10, orderBy: { field: SIZE, direction: DESC }) {
                edges { size node { name } }
              }
            }
            pageInfo { endCursor hasNextPage }
          }
        }
      }`,
      { cursor, login }
    );
    const { nodes, pageInfo, totalCount } = page.user.repositories;

    stats.repos = totalCount;
    for (const node of nodes) {
      repoNames.push(node.name);
      stats.stars += node.stargazerCount;
      for (const edge of node.languages.edges) {
        languageSizes.set(
          edge.node.name,
          (languageSizes.get(edge.node.name) ?? 0) + edge.size
        );
      }
    }
    cursor = pageInfo.hasNextPage ? pageInfo.endCursor : null;
  } while (cursor);

  stats.topLanguages = [...languageSizes.entries()]
    .toSorted((left, right) => right[1] - left[1])
    .slice(0, 4)
    .map(([name]) => name);

  return repoNames;
};

// All-time contributions. contributionsCollection is capped at a one-year
// window, so sum independent year-sized windows from the account creation
// date. Windows are aligned to UTC day boundaries and end 1s before the
// next one starts: the calendar counts whole days, and a window cut mid-day
// counts that day on BOTH sides (verified against the live API).
const fetchContributions = async (
  gql: Gql,
  login: string,
  createdAt: string
) => {
  const yearMs = 365 * 24 * 3600 * 1000;
  const created = new Date(createdAt);
  const firstDay = Date.UTC(
    created.getUTCFullYear(),
    created.getUTCMonth(),
    created.getUTCDate()
  );
  const now = Date.now();
  const windows: { from: string; to: string }[] = [];

  for (let from = firstDay; from < now; from += yearMs) {
    windows.push({
      from: new Date(from).toISOString(),
      to: new Date(Math.min(from + yearMs - 1000, now)).toISOString(),
    });
  }

  const totals = await Promise.all(
    windows.map((window) =>
      gql<{
        user: {
          contributionsCollection: {
            contributionCalendar: { totalContributions: number };
          };
        };
      }>(
        `query ($login: String!, $from: DateTime!, $to: DateTime!) {
          user(login: $login) {
            contributionsCollection(from: $from, to: $to) {
              contributionCalendar { totalContributions }
            }
          }
        }`,
        { from: window.from, login, to: window.to }
      )
    )
  );
  let contributions = 0;

  for (const window of totals) {
    contributions +=
      window.user.contributionsCollection.contributionCalendar
        .totalContributions;
  }

  return contributions;
};

// Fetches only what the used placeholders need; a card without API
// placeholders makes no requests at all.
export const fetchStats = async (
  login: string,
  token: string | undefined,
  used: ReadonlySet<string>
): Promise<Stats> => {
  const needLoc = LOC_STATS.some((stat) => used.has(stat));
  const needRepositories =
    needLoc || REPOSITORY_STATS.some((stat) => used.has(stat));
  const needProfile = PROFILE_STATS.some((stat) => used.has(stat));
  const stats = { ...emptyStats };

  if (!(needRepositories || needProfile)) {
    return stats;
  }

  if (!token) {
    console.warn("GITHUB_TOKEN is not set — rendering with placeholder stats.");

    return stats;
  }

  const gql = graphql.defaults({
    headers: { authorization: `token ${token}` },
  });

  if (needProfile) {
    const { user } = await gql<{
      user: {
        createdAt: string;
        followers: { totalCount: number };
        repositoriesContributedTo: { totalCount: number };
      };
    }>(
      `query ($login: String!) {
        user(login: $login) {
          createdAt
          followers { totalCount }
          repositoriesContributedTo(
            contributionTypes: [COMMIT, PULL_REQUEST, ISSUE, PULL_REQUEST_REVIEW]
          ) { totalCount }
        }
      }`,
      { login }
    );

    stats.followers = user.followers.totalCount;
    stats.contributedRepos = user.repositoriesContributedTo.totalCount;

    if (used.has("contributions")) {
      stats.contributions = await fetchContributions(
        gql,
        login,
        user.createdAt
      );
    }
  }

  if (needRepositories) {
    const repoNames = await fetchRepositories(gql, login, stats);

    if (needLoc) {
      const frequencies = await Promise.all(
        repoNames.map((repo) => codeFrequency(login, repo, token))
      );

      for (const frequency of frequencies) {
        stats.locAdded += frequency.added;
        stats.locDeleted += frequency.deleted;
      }
      stats.loc = stats.locAdded - stats.locDeleted;
    }
  }

  return stats;
};
