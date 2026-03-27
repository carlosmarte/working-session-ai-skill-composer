import { Edge } from 'edge.js';
import yaml from 'js-yaml';
import fs from 'node:fs';
import path from 'node:path';

const edge = Edge.create();

/**
 * Load data from a JSON or YAML file.
 * @param {string} filePath - Absolute path to the data file
 * @returns {object} Parsed data
 */
export function loadDataSource(filePath) {
  const resolved = path.resolve(filePath);
  const raw = fs.readFileSync(resolved, 'utf-8');
  const ext = path.extname(resolved).toLowerCase();

  if (ext === '.json') {
    return JSON.parse(raw);
  }

  if (ext === '.yaml' || ext === '.yml') {
    return yaml.load(raw);
  }

  throw new Error(`Unsupported data format: ${ext}. Use .json, .yaml, or .yml`);
}

/**
 * Render a template string using Edge.js with the given data.
 * @param {string} templateContent - Raw Edge template string
 * @param {object} data - Data object to pass to the template
 * @returns {Promise<string>} Rendered output
 */
export async function renderTemplate(templateContent, data) {
  return edge.renderRaw(templateContent, data);
}

/**
 * Compute the rendered output filename by stripping the .template extension.
 * e.g. "my-skill.md.template" → "my-skill.md"
 *      "config.template" → "config"
 * @param {string} filename
 * @returns {string}
 */
export function getRenderedFilename(filename) {
  return filename.replace(/\.template$/, '');
}

/**
 * Check if a filename is a template file.
 * @param {string} filename
 * @returns {boolean}
 */
export function isTemplateFile(filename) {
  return filename.endsWith('.template');
}
