#!/usr/bin/env node

import { program } from 'commander';
import * as p from '@clack/prompts';
import chalk from 'chalk';
import { config } from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';
import {
  createClient,
  parseRepo,
  getDefaultBranch,
  listBranches,
  discoverSkills,
  downloadFile,
  getContents,
} from './github.mjs';

config();

program
  .name('skill-fetcher')
  .description('Fetch skill files from GitHub repositories')
  .option('-t, --token <token>', 'GitHub personal access token (or set GITHUB_TOKEN env)')
  .option('-r, --repo <repo>', 'GitHub repo in owner/repo format')
  .option('-b, --branch <branch>', 'Branch to use')
  .option('-o, --output <path>', 'Output directory for downloaded skills')
  .option('--api-url <url>', 'GitHub API base URL for GHE (or set GITHUB_API_URL env)')
  .action(run);

program.parse();

async function run(opts) {
  p.intro(chalk.bold('Skill Fetcher'));

  const token = opts.token || process.env.GITHUB_TOKEN || undefined;
  const baseUrl = opts.apiUrl || process.env.GITHUB_API_URL || undefined;
  const octokit = createClient(token, baseUrl);

  if (baseUrl) {
    p.log.info(`Using custom GitHub API: ${chalk.cyan(baseUrl)}`);
  }

  // ── Step 1: Get repo ──
  let repoInput = opts.repo || process.env.SKILL_FETCHER_REPO;
  if (!repoInput) {
    repoInput = await p.text({
      message: 'Enter the GitHub repository (owner/repo or URL):',
      placeholder: 'e.g. octocat/hello-world',
      validate: (v) => {
        if (!v.trim()) return 'Repository is required';
        if (!parseRepo(v)) return 'Invalid format. Use owner/repo or a GitHub URL';
      },
    });
    if (p.isCancel(repoInput)) return p.cancel('Cancelled.');
  }

  const parsed = parseRepo(repoInput);
  if (!parsed) {
    p.cancel('Invalid repository format.');
    process.exit(1);
  }
  const { owner, repo } = parsed;

  // ── Step 2: Get branch ──
  const spinBranch = p.spinner();
  spinBranch.start('Fetching repository info…');

  let defaultBranch;
  let branches;
  try {
    [defaultBranch, branches] = await Promise.all([
      getDefaultBranch(octokit, owner, repo),
      listBranches(octokit, owner, repo),
    ]);
    spinBranch.stop(`Found ${branches.length} branches (default: ${defaultBranch})`);
  } catch (err) {
    spinBranch.stop('Failed to fetch repository');
    p.cancel(`Could not access ${owner}/${repo}. ${err.message}`);
    process.exit(1);
  }

  let branch = opts.branch || process.env.SKILL_FETCHER_BRANCH;
  if (!branch) {
    branch = await p.select({
      message: `Select branch (default: ${chalk.cyan(defaultBranch)}):`,
      options: [
        { value: defaultBranch, label: `${defaultBranch} ${chalk.dim('(default)')}`, hint: 'press Enter' },
        ...branches
          .filter((b) => b !== defaultBranch)
          .map((b) => ({ value: b, label: b })),
      ],
      initialValue: defaultBranch,
    });
    if (p.isCancel(branch)) return p.cancel('Cancelled.');
  }

  // ── Step 3: Find skills folder ──
  const spinSkills = p.spinner();
  spinSkills.start('Searching for skills folder…');

  let skillsPath = null;
  for (const candidate of ['skills', '.claude/skills']) {
    try {
      await getContents(octokit, owner, repo, branch, candidate);
      skillsPath = candidate;
      break;
    } catch {
      // not found, try next
    }
  }

  if (!skillsPath) {
    spinSkills.stop('No skills folder found');
    p.cancel(`No "skills" or ".claude/skills" folder found in ${owner}/${repo}@${branch}`);
    process.exit(1);
  }

  // ── Step 4: Discover skills ──
  let skills;
  try {
    skills = await discoverSkills(octokit, owner, repo, branch, skillsPath);
    spinSkills.stop(`Found ${skills.length} skill(s) in ${chalk.cyan(skillsPath)}`);
  } catch (err) {
    spinSkills.stop('Failed to list skills');
    p.cancel(`Error reading skills folder: ${err.message}`);
    process.exit(1);
  }

  if (skills.length === 0) {
    p.cancel('No skills found in the skills folder.');
    process.exit(1);
  }

  // ── Step 5: Select skills ──
  const selected = await p.multiselect({
    message: 'Select skills to download:',
    options: skills.map((s) => ({
      value: s.name,
      label: s.name,
      hint: s.type === 'flat' ? s.paths[0] : `${s.paths.length} file(s)`,
    })),
    required: true,
  });
  if (p.isCancel(selected)) return p.cancel('Cancelled.');

  const selectedSkills = skills.filter((s) => selected.includes(s.name));

  // ── Step 6: Choose output directory ──
  let outputDir = opts.output || process.env.SKILL_FETCHER_OUTPUT;
  if (!outputDir) {
    outputDir = await p.text({
      message: 'Where should the skill files be saved?',
      placeholder: './skills',
      defaultValue: './skills',
      validate: (v) => {
        if (!v.trim()) return 'Output path is required';
      },
    });
    if (p.isCancel(outputDir)) return p.cancel('Cancelled.');
  }

  const resolvedOutput = path.resolve(outputDir);

  // ── Step 7: Download ──
  const spinDownload = p.spinner();
  spinDownload.start('Downloading skills…');

  let downloadCount = 0;
  const errors = [];

  for (const skill of selectedSkills) {
    try {
      if (skill.type === 'flat') {
        // Flat: save as <output>/<name>.md
        const content = await downloadFile(octokit, owner, repo, branch, skill.paths[0]);
        const dest = path.join(resolvedOutput, `${skill.name}.md`);
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        fs.writeFileSync(dest, content, 'utf-8');
        downloadCount++;
      } else {
        // Nested: save as <output>/<name>/<filename>
        const skillDir = path.join(resolvedOutput, skill.name);
        fs.mkdirSync(skillDir, { recursive: true });
        for (const filePath of skill.paths) {
          const content = await downloadFile(octokit, owner, repo, branch, filePath);
          const fileName = path.basename(filePath);
          fs.writeFileSync(path.join(skillDir, fileName), content, 'utf-8');
        }
        downloadCount++;
      }
    } catch (err) {
      errors.push({ name: skill.name, error: err.message });
    }
  }

  spinDownload.stop(
    errors.length === 0
      ? `Downloaded ${downloadCount} skill(s)`
      : `Downloaded ${downloadCount} skill(s), ${errors.length} failed`
  );

  // ── Summary ──
  if (errors.length > 0) {
    for (const e of errors) {
      p.log.error(`${e.name}: ${e.error}`);
    }
  }

  p.log.success(`Skills saved to ${chalk.cyan(resolvedOutput)}`);
  p.outro(chalk.green('Done!'));
}
