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
import {
  loadDataSource,
  renderTemplate,
  getRenderedFilename,
  isTemplateFile,
} from './template.mjs';

config();

program
  .name('skill-fetcher-template')
  .description('Fetch skill files from GitHub and render Edge.js templates with data')
  .option('-t, --token <token>', 'GitHub personal access token (or set GITHUB_TOKEN env)')
  .option('-r, --repo <repo>', 'GitHub repo in owner/repo format')
  .option('-b, --branch <branch>', 'Branch to use')
  .option('-o, --output <path>', 'Output directory for downloaded skills')
  .option('-d, --data <path>', 'Data source file for template rendering (JSON or YAML)')
  .option('--api-url <url>', 'GitHub API base URL for GHE (or set GITHUB_API_URL env)')
  .action(run);

program.parse();

async function run(opts) {
  p.intro(chalk.bold('Skill Fetcher + Template'));

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
      label: s.hasTemplates ? `${s.name} ${chalk.yellow('(template)')}` : s.name,
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
  const templateFiles = []; // Track downloaded template files for rendering

  for (const skill of selectedSkills) {
    try {
      if (skill.type === 'flat') {
        const content = await downloadFile(octokit, owner, repo, branch, skill.paths[0]);
        const fileName = path.basename(skill.paths[0]);
        const dest = path.join(resolvedOutput, fileName);
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        fs.writeFileSync(dest, content, 'utf-8');
        if (isTemplateFile(fileName)) {
          templateFiles.push({ path: dest, content, skill: skill.name });
        }
        downloadCount++;
      } else {
        const skillDir = path.join(resolvedOutput, skill.name);
        fs.mkdirSync(skillDir, { recursive: true });
        for (const filePath of skill.paths) {
          const content = await downloadFile(octokit, owner, repo, branch, filePath);
          const fileName = path.basename(filePath);
          const dest = path.join(skillDir, fileName);
          fs.writeFileSync(dest, content, 'utf-8');
          if (isTemplateFile(fileName)) {
            templateFiles.push({ path: dest, content, skill: skill.name });
          }
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

  if (errors.length > 0) {
    for (const e of errors) {
      p.log.error(`${e.name}: ${e.error}`);
    }
  }

  p.log.success(`Skills saved to ${chalk.cyan(resolvedOutput)}`);

  // ── Step 8: Render templates ──
  if (templateFiles.length > 0) {
    p.log.info(
      chalk.yellow(`Found ${templateFiles.length} template file(s) to render`)
    );

    const shouldRender = await p.confirm({
      message: 'Would you like to render the template files now?',
      initialValue: true,
    });
    if (p.isCancel(shouldRender) || !shouldRender) {
      p.log.info('Skipping template rendering. Raw .template files are saved.');
      p.outro(chalk.green('Done!'));
      return;
    }

    // Collect data source — one source per template, or one shared source
    let sharedData = null;
    let dataPath = opts.data || process.env.SKILL_FETCHER_DATA;

    if (templateFiles.length > 1 && !dataPath) {
      const dataStrategy = await p.select({
        message: 'How should data sources be provided for templates?',
        options: [
          { value: 'shared', label: 'Use one data source for all templates' },
          { value: 'individual', label: 'Pick a data source per template' },
        ],
      });
      if (p.isCancel(dataStrategy)) return p.cancel('Cancelled.');

      if (dataStrategy === 'shared') {
        sharedData = await promptForDataSource('all templates');
        if (sharedData === null) return;
      }
    }

    const spinRender = p.spinner();
    let renderCount = 0;
    const renderErrors = [];

    for (const tpl of templateFiles) {
      const relPath = path.relative(resolvedOutput, tpl.path);
      let data;

      if (sharedData) {
        data = sharedData;
      } else if (dataPath) {
        try {
          data = loadDataSource(dataPath);
        } catch (err) {
          renderErrors.push({ file: relPath, error: err.message });
          continue;
        }
      } else {
        data = await promptForDataSource(relPath);
        if (data === null) {
          p.log.warn(`Skipped rendering ${chalk.cyan(relPath)}`);
          continue;
        }
      }

      spinRender.start(`Rendering ${chalk.cyan(relPath)}…`);

      try {
        const rendered = await renderTemplate(tpl.content, data);
        const renderedPath = getRenderedFilename(tpl.path);
        fs.writeFileSync(renderedPath, rendered, 'utf-8');
        renderCount++;
        spinRender.stop(`Rendered → ${chalk.cyan(path.relative(resolvedOutput, renderedPath))}`);
      } catch (err) {
        spinRender.stop(`Failed to render ${relPath}`);
        renderErrors.push({ file: relPath, error: err.message });
      }
    }

    if (renderErrors.length > 0) {
      p.log.warn(`${renderErrors.length} template(s) failed to render:`);
      for (const e of renderErrors) {
        p.log.error(`  ${e.file}: ${e.error}`);
      }
    }

    if (renderCount > 0) {
      p.log.success(`Rendered ${renderCount} template(s)`);
    }
  }

  p.outro(chalk.green('Done!'));
}

/**
 * Prompt user to select a data source type and file path.
 * Returns parsed data object, or null if cancelled.
 */
async function promptForDataSource(label) {
  const format = await p.select({
    message: `Select data source format for ${chalk.cyan(label)}:`,
    options: [
      { value: 'json', label: 'JSON', hint: '.json file' },
      { value: 'yaml', label: 'YAML', hint: '.yaml or .yml file' },
    ],
  });
  if (p.isCancel(format)) {
    p.cancel('Cancelled.');
    return null;
  }

  const ext = format === 'json' ? '.json' : '.yaml / .yml';
  const filePath = await p.text({
    message: `Path to ${format.toUpperCase()} data file (${ext}):`,
    placeholder: format === 'json' ? './data.json' : './data.yaml',
    validate: (v) => {
      if (!v.trim()) return 'File path is required';
      const resolved = path.resolve(v);
      if (!fs.existsSync(resolved)) return `File not found: ${resolved}`;
    },
  });
  if (p.isCancel(filePath)) {
    p.cancel('Cancelled.');
    return null;
  }

  try {
    return loadDataSource(filePath);
  } catch (err) {
    p.log.error(`Failed to load data: ${err.message}`);
    return null;
  }
}
