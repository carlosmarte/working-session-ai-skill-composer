# Skill Fetcher CLI

Interactive CLI tool to browse and download skill files from GitHub repositories.

## Prerequisites

- Node.js >= 18
- A GitHub token (required for private repos, optional for public)

## Install

```bash
cd cli-fetcher
npm install
```

## Usage

### Interactive mode

```bash
npm start
```

The CLI will walk you through each step:

1. Enter a GitHub repo (`owner/repo` or full URL)
2. Select a branch (defaults to the repo's default branch)
3. Auto-discovers skills in `skills/` or `.claude/skills/`
4. Pick which skills to download (multi-select)
5. Choose where to save them locally

### Non-interactive mode

Pass flags to skip prompts:

```bash
node src/index.mjs \
  --repo octocat/my-skills \
  --branch main \
  --output ./my-skills \
  --token ghp_xxx
```

### CLI flags

| Flag | Description |
|------|-------------|
| `-r, --repo <repo>` | GitHub repo (`owner/repo` or URL) |
| `-b, --branch <branch>` | Branch to use |
| `-o, --output <path>` | Local directory to save skills |
| `-t, --token <token>` | GitHub personal access token |
| `--api-url <url>` | GitHub API base URL (for GitHub Enterprise) |
| `-h, --help` | Show help |

## Environment Variables

All env vars are optional. CLI flags take priority over env vars, and env vars pre-fill interactive prompts.

Copy `.env.example` to `.env` to get started:

```bash
cp .env.example .env
```

| Variable | Description |
|----------|-------------|
| `GITHUB_TOKEN` | GitHub personal access token |
| `GITHUB_API_URL` | GitHub API base URL for GHE (e.g. `https://github.example.com/api/v3`) |
| `SKILL_FETCHER_REPO` | Default repo to fetch from |
| `SKILL_FETCHER_BRANCH` | Default branch |
| `SKILL_FETCHER_OUTPUT` | Default output directory |

### Priority order

**CLI flag > Environment variable > Interactive prompt**

## Skill folder formats

The tool handles two skill structures automatically:

**Flat** -- markdown files directly in the skills folder:

```
skills/
  angular-development.md
  react-development.md
  fastify-development.md
```

Downloaded as: `<output>/angular-development.md`

**Nested** -- each skill is a subfolder with files inside:

```
.claude/skills/
  create-app/
    SKILL.md
  debug-server/
    SKILL.md
    config.yaml
```

Downloaded as: `<output>/create-app/SKILL.md`

## Examples

Fetch skills from a public repo:

```bash
node src/index.mjs --repo myorg/shared-skills
```

Fetch from GitHub Enterprise:

```bash
GITHUB_API_URL=https://github.corp.com/api/v3 \
GITHUB_TOKEN=ghp_xxx \
node src/index.mjs --repo team/skills-repo
```

Set defaults via `.env` and just run interactively:

```env
GITHUB_TOKEN=ghp_xxx
SKILL_FETCHER_REPO=myorg/shared-skills
SKILL_FETCHER_OUTPUT=~/.claude/skills
```

```bash
npm start
```
