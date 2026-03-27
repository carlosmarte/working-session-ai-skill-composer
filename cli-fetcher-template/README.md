# Skill Fetcher + Template CLI

Interactive CLI tool to browse, download, and **render templated** skill files from GitHub repositories. Builds on [cli-fetcher](../cli-fetcher) with Edge.js template rendering support.

## What's New

When a fetched skill file ends in `.template`, the CLI:

1. Detects it as a template during skill discovery
2. Downloads the raw template file
3. Prompts you to select a **data source** (JSON or YAML)
4. Renders the template using [Edge.js](https://edgejs.dev) with your data
5. Saves the rendered output (stripping the `.template` extension)

## Prerequisites

- Node.js >= 18
- A GitHub token (required for private repos, optional for public)

## Install

```bash
cd cli-fetcher-template
npm install
```

## Usage

### Interactive mode

```bash
npm start
```

The CLI walks you through:

1. Enter a GitHub repo (`owner/repo` or full URL)
2. Select a branch
3. Auto-discovers skills in `skills/` or `.claude/skills/`
4. Pick which skills to download (templates are highlighted)
5. Choose where to save them
6. **For `.template` files**: select data source format (JSON/YAML) and provide the file path
7. Templates are rendered and saved alongside the raw files

### Non-interactive mode

```bash
node src/index.mjs \
  --repo octocat/my-skills \
  --branch main \
  --output ./my-skills \
  --data ./context.json \
  --token ghp_xxx
```

### CLI flags

| Flag | Description |
|------|-------------|
| `-r, --repo <repo>` | GitHub repo (`owner/repo` or URL) |
| `-b, --branch <branch>` | Branch to use |
| `-o, --output <path>` | Local directory to save skills |
| `-d, --data <path>` | Data source file for template rendering (JSON or YAML) |
| `-t, --token <token>` | GitHub personal access token |
| `--api-url <url>` | GitHub API base URL (for GitHub Enterprise) |
| `-h, --help` | Show help |

## Environment Variables

Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

| Variable | Description |
|----------|-------------|
| `GITHUB_TOKEN` | GitHub personal access token |
| `GITHUB_API_URL` | GitHub API base URL for GHE |
| `SKILL_FETCHER_REPO` | Default repo to fetch from |
| `SKILL_FETCHER_BRANCH` | Default branch |
| `SKILL_FETCHER_OUTPUT` | Default output directory |
| `SKILL_FETCHER_DATA` | Default data source file for templates |

**Priority:** CLI flag > Environment variable > Interactive prompt

## Template Format

Template files use [Edge.js syntax](https://edgejs.dev/docs/templates/introduction) and must end with `.template`.

### Example template

**`skills/setup-guide.md.template`**

```edge
# {{ projectName }} Setup Guide

## Prerequisites

@each(dep in dependencies)
- {{ dep.name }} v{{ dep.version }}
@end

## Configuration

@if(config.database)
### Database
- Host: {{ config.database.host }}
- Port: {{ config.database.port }}
@end

@if(config.redis)
### Redis
- URL: {{ config.redis.url }}
@end
```

### Data source (JSON)

**`data.json`**

```json
{
  "projectName": "My App",
  "dependencies": [
    { "name": "Node.js", "version": "20" },
    { "name": "PostgreSQL", "version": "16" }
  ],
  "config": {
    "database": { "host": "localhost", "port": 5432 },
    "redis": { "url": "redis://localhost:6379" }
  }
}
```

### Data source (YAML)

**`data.yaml`**

```yaml
projectName: My App
dependencies:
  - name: Node.js
    version: "20"
  - name: PostgreSQL
    version: "16"
config:
  database:
    host: localhost
    port: 5432
  redis:
    url: redis://localhost:6379
```

### Rendered output

Running the CLI produces `setup-guide.md` (`.template` extension stripped):

```markdown
# My App Setup Guide

## Prerequisites

- Node.js v20
- PostgreSQL v16

## Configuration

### Database
- Host: localhost
- Port: 5432

### Redis
- URL: redis://localhost:6379
```

## Skill Folder Formats

Same as cli-fetcher, plus `.template` files are now recognized:

**Flat:**

```
skills/
  angular-development.md
  setup-guide.md.template    ← template
```

**Nested:**

```
skills/
  create-app/
    SKILL.md
    scaffold.md.template     ← template
    config.yaml
```

## Multiple Templates

When multiple templates are selected, you can:

- **Use one data source** for all templates (shared context)
- **Pick a data source per template** (individual context)
