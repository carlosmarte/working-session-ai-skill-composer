import { Octokit } from 'octokit';

/**
 * @param {string} [token]
 * @param {string} [baseUrl] - GitHub API base URL (for GHE), e.g. https://github.example.com/api/v3
 */
export function createClient(token, baseUrl) {
  const opts = {};
  if (token) opts.auth = token;
  if (baseUrl) opts.baseUrl = baseUrl;
  return new Octokit(opts);
}

/**
 * Parse "owner/repo" from various input formats.
 * Accepts: "owner/repo", "https://github.com/owner/repo", "github.com/owner/repo"
 */
export function parseRepo(input) {
  const trimmed = input.trim().replace(/\/+$/, '');

  // Full URL
  const urlMatch = trimmed.match(/github\.com\/([^/]+)\/([^/]+)/);
  if (urlMatch) return { owner: urlMatch[1], repo: urlMatch[2] };

  // owner/repo
  const slashMatch = trimmed.match(/^([^/]+)\/([^/]+)$/);
  if (slashMatch) return { owner: slashMatch[1], repo: slashMatch[2] };

  return null;
}

/**
 * List branches for a repo.
 */
export async function listBranches(octokit, owner, repo) {
  const { data } = await octokit.rest.repos.listBranches({ owner, repo, per_page: 100 });
  return data.map((b) => b.name);
}

/**
 * Get the default branch for a repo.
 */
export async function getDefaultBranch(octokit, owner, repo) {
  const { data } = await octokit.rest.repos.get({ owner, repo });
  return data.default_branch;
}

/**
 * Get the tree for a specific path in the repo.
 * Returns items under that path (non-recursive listing via Contents API).
 */
export async function getContents(octokit, owner, repo, ref, path) {
  const { data } = await octokit.rest.repos.getContent({ owner, repo, ref, path });
  return Array.isArray(data) ? data : [data];
}

/**
 * Download a single file's raw content.
 */
export async function downloadFile(octokit, owner, repo, ref, path) {
  const { data } = await octokit.rest.repos.getContent({ owner, repo, ref, path });
  if (data.encoding === 'base64') {
    return Buffer.from(data.content, 'base64').toString('utf-8');
  }
  return data.content;
}

/**
 * Discover skills in a repo's skills folder.
 * Returns array of { name, type: 'flat'|'nested', paths: string[], hasTemplates: boolean }
 *
 * Flat files: .md and .template files directly in skills folder
 * Nested: subdirectories containing files (may include .template files)
 */
export async function discoverSkills(octokit, owner, repo, ref, skillsPath = 'skills') {
  const items = await getContents(octokit, owner, repo, ref, skillsPath);
  const skills = [];

  for (const item of items) {
    if (item.type === 'file' && (item.name.endsWith('.md') || item.name.endsWith('.template'))) {
      const isTemplate = item.name.endsWith('.template');
      skills.push({
        name: item.name.replace(/\.(md|template)$/, ''),
        type: 'flat',
        paths: [item.path],
        hasTemplates: isTemplate,
      });
    } else if (item.type === 'dir') {
      try {
        const children = await getContents(octokit, owner, repo, ref, item.path);
        const filePaths = children.filter((c) => c.type === 'file').map((c) => c.path);
        if (filePaths.length > 0) {
          const hasTemplates = filePaths.some((fp) => fp.endsWith('.template'));
          skills.push({
            name: item.name,
            type: 'nested',
            paths: filePaths,
            hasTemplates,
          });
        }
      } catch {
        // Skip inaccessible directories
      }
    }
  }

  return skills;
}
