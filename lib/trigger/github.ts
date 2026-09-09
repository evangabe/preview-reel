export class GitHubError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "GitHubError";
  }
}

export interface RepoRef {
  owner: string;
  repo: string;
}

export interface PullRequest {
  number: number;
  title: string;
  body: string;
  headRef: string;
  headSha: string;
  htmlUrl: string;
  state: "open" | "closed";
}

async function githubRequest<T>(path: string): Promise<T> {
  const response = await fetch(`https://api.github.com${path}`, {
    headers: {
      Authorization: `Bearer ${process.env.GITHUB_TOKEN ?? ""}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "preview-reel",
    },
    cache: "no-store",
  });
  if (!response.ok) {
    throw new GitHubError(
      response.status,
      `GitHub request failed with status ${response.status}`,
    );
  }
  return response.json() as Promise<T>;
}

interface GitHubPullRequest {
  number: number;
  title: string;
  body: string | null;
  head: { ref: string; sha: string };
  html_url: string;
  state: "open" | "closed";
}

function pullRequest(value: GitHubPullRequest): PullRequest {
  return {
    number: value.number,
    title: value.title,
    body: value.body ?? "",
    headRef: value.head.ref,
    headSha: value.head.sha,
    htmlUrl: value.html_url,
    state: value.state,
  };
}

export async function getPullRequest(
  ref: RepoRef,
  prNumber: number,
): Promise<PullRequest | null> {
  try {
    const value = await githubRequest<GitHubPullRequest>(
      `/repos/${encodeURIComponent(ref.owner)}/${encodeURIComponent(ref.repo)}/pulls/${prNumber}`,
    );
    return pullRequest(value);
  } catch (error) {
    if (error instanceof GitHubError && error.status === 404) return null;
    throw error;
  }
}

export async function listChangedPaths(
  ref: RepoRef,
  prNumber: number,
): Promise<string[]> {
  const paths: string[] = [];
  for (let page = 1; page <= 3; page += 1) {
    const files = await githubRequest<Array<{ filename: string }>>(
      `/repos/${encodeURIComponent(ref.owner)}/${encodeURIComponent(ref.repo)}/pulls/${prNumber}/files?per_page=100&page=${page}`,
    );
    paths.push(...files.map((file) => file.filename));
    if (files.length < 100) break;
  }
  return paths;
}
