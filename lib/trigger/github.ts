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

async function githubRequest<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const response = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${process.env.GITHUB_TOKEN ?? ""}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "preview-reel",
      ...init.headers,
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

export async function findOpenPullRequestByBranch(
  ref: RepoRef,
  headRef: string,
): Promise<PullRequest | null> {
  const head = encodeURIComponent(`${ref.owner}:${headRef}`);
  const values = await githubRequest<GitHubPullRequest[]>(
    `/repos/${encodeURIComponent(ref.owner)}/${encodeURIComponent(ref.repo)}/pulls?state=open&head=${head}&per_page=1`,
  );
  return values[0] ? pullRequest(values[0]) : null;
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

export async function findCommentByMarker(
  ref: RepoRef,
  prNumber: number,
  marker: string,
): Promise<{ id: number } | null> {
  for (let page = 1; page <= 3; page += 1) {
    const comments = await githubRequest<Array<{ id: number; body: string }>>(
      `/repos/${encodeURIComponent(ref.owner)}/${encodeURIComponent(ref.repo)}/issues/${prNumber}/comments?per_page=100&page=${page}`,
    );
    const found = comments.find((comment) => comment.body.includes(marker));
    if (found) return { id: found.id };
    if (comments.length < 100) break;
  }
  return null;
}

export function createComment(
  ref: RepoRef,
  prNumber: number,
  body: string,
): Promise<{ id: number }> {
  return githubRequest(
    `/repos/${encodeURIComponent(ref.owner)}/${encodeURIComponent(ref.repo)}/issues/${prNumber}/comments`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body }),
    },
  );
}

export async function updateComment(
  ref: RepoRef,
  commentId: number,
  body: string,
): Promise<void> {
  await githubRequest(
    `/repos/${encodeURIComponent(ref.owner)}/${encodeURIComponent(ref.repo)}/issues/comments/${commentId}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body }),
    },
  );
}
