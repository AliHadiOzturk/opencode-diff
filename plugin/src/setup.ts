#!/usr/bin/env node

/**
 * Setup CLI Script for OpenCode Diff Plugin
 *
 * This script sets up the OpenCode Diff Plugin in a project by:
 * - Validating Node.js version
 * - Checking for package.json
 * - Creating/updating opencode.json with plugin reference
 * - Creating .opencode/diff-plugin.json with safe defaults
 * - Installing the plugin via npm
 *
 * Usage: npx opencode-diff setup
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';

const PLUGIN_NAME = 'opencode-diff';
const PLUGIN_VERSION = 'latest';

const DEFAULT_PLUGIN_CONFIG = {
  enabled: true,
  ide: {
    enabled: false,
    stateFilePath: '.opencode/.diff-plugin-state.json',
  },
  autoAccept: ['package-lock.json', 'yarn.lock', '*.lock'],
  autoReject: [],
  maxFileSize: 1048576,
  theme: 'auto',
  showLineNumbers: true,
  confirmRejectAll: true,
  keybindings: [],
};

interface CliState {
  dryRun: boolean;
  help: boolean;
}

function log(message: string): void {
  console.log(`[Setup] ${message}`);
}

function warn(message: string): void {
  console.warn(`[Setup] WARNING: ${message}`);
}

function error(message: string, code: number = 1): never {
  console.error(`[Setup] ERROR: ${message}`);
  process.exit(code);
}

function success(message: string): void {
  console.log(`[Setup] ✓ ${message}`);
}

function parseArgs(): CliState {
  const args = process.argv.slice(2);
  const state: CliState = {
    dryRun: false,
    help: false,
  };

  for (const arg of args) {
    if (arg === '--dry-run') {
      state.dryRun = true;
    } else if (arg === '--help' || arg === '-h') {
      state.help = true;
    } else if (arg.startsWith('-')) {
      error(`Unknown option: ${arg}. Use --help for usage information.`);
    }
  }

  return state;
}

function showHelp(): never {
  console.log(`
OpenCode Diff Plugin Setup

Usage:
  npx ${PLUGIN_NAME} setup [options]

Options:
  --dry-run    Show what would be done without making any changes
  --help, -h   Show this help message

This script will:
  1. Validate Node.js version (>= 18.0.0)
  2. Check for package.json in the current directory
  3. Check if OpenCode CLI is installed
  4. Create or update opencode.json with the plugin reference
  5. Create .opencode/diff-plugin.json with safe defaults
  6. Install the plugin via npm

Examples:
  npx ${PLUGIN_NAME} setup
  npx ${PLUGIN_NAME} setup --dry-run
`);
  process.exit(0);
}

function validateNodeVersion(): void {
  const nodeVersion = process.version;
  const majorVersion = parseInt(nodeVersion.slice(1).split('.')[0], 10);

  if (majorVersion < 18) {
    error(
      `Node.js version ${nodeVersion} is not supported. Please upgrade to Node.js >= 18.0.0`
    );
  }

  log(`Node.js version: ${nodeVersion} ✓`);
}

function checkPackageJson(): void {
  if (!existsSync('package.json')) {
    error(
      'No package.json found in current directory. Please run this command in a project directory.'
    );
  }

  log('Found package.json ✓');
}

function checkOpenCodeCli(): boolean {
  try {
    execSync('which opencode', { stdio: 'pipe' });
    log('OpenCode CLI found ✓');
    return true;
  } catch {
    warn(
      'OpenCode CLI not found. You may need to install it: npm install -g @opencode-ai/cli'
    );
    return false;
  }
}

function setupOpenCodeJson(dryRun: boolean): void {
  const opencodePath = 'opencode.json';
  const pluginEntry = `${PLUGIN_NAME}@${PLUGIN_VERSION}`;

  let config: {
    $schema?: string;
    plugin?: string[];
    [key: string]: unknown;
  } = {};

  if (existsSync(opencodePath)) {
    log(`Found existing ${opencodePath}`);
    try {
      const content = readFileSync(opencodePath, 'utf-8');
      config = JSON.parse(content);
    } catch (e) {
      error(`Failed to parse ${opencodePath}: ${e instanceof Error ? e.message : String(e)}`);
    }

    if (!config.plugin) {
      config.plugin = [];
    }

    const isPluginInstalled = config.plugin.some(
      (plugin: string) => plugin === PLUGIN_NAME || plugin.startsWith(`${PLUGIN_NAME}@`)
    );

    if (isPluginInstalled) {
      log(`Plugin ${PLUGIN_NAME} is already configured in ${opencodePath}`);
      return;
    }

    config.plugin.push(pluginEntry);

    if (dryRun) {
      log(`[DRY-RUN] Would add ${PLUGIN_NAME} to ${opencodePath}`);
      return;
    }

    writeFileSync(opencodePath, JSON.stringify(config, null, 2), 'utf-8');
    success(`Added ${PLUGIN_NAME} to ${opencodePath}`);
  } else {
    if (dryRun) {
      log(`[DRY-RUN] Would create ${opencodePath} with plugin ${PLUGIN_NAME}`);
      return;
    }

    config = {
      plugin: [pluginEntry],
    };

    writeFileSync(opencodePath, JSON.stringify(config, null, 2), 'utf-8');
    success(`Created ${opencodePath} with plugin ${PLUGIN_NAME}`);
  }
}

function setupPluginConfig(dryRun: boolean): void {
  const opencodeDir = '.opencode';
  const configPath = join(opencodeDir, 'diff-plugin.json');

  if (existsSync(configPath)) {
    log(`Plugin config already exists at ${configPath}`);
    return;
  }

  if (dryRun) {
    log(`[DRY-RUN] Would create ${configPath} with safe defaults`);
    return;
  }

  if (!existsSync(opencodeDir)) {
    mkdirSync(opencodeDir, { recursive: true });
    log(`Created ${opencodeDir} directory`);
  }

  writeFileSync(configPath, JSON.stringify(DEFAULT_PLUGIN_CONFIG, null, 2), 'utf-8');
  success(`Created ${configPath} with safe defaults`);
}

function installPlugin(dryRun: boolean): void {
  if (dryRun) {
    log(`[DRY-RUN] Would run: npm install ${PLUGIN_NAME}`);
    return;
  }

  log(`Installing ${PLUGIN_NAME}...`);

  try {
    execSync(`npm install ${PLUGIN_NAME}`, {
      stdio: 'inherit',
    });
    success(`Installed ${PLUGIN_NAME}`);
  } catch (e) {
    error(`Failed to install ${PLUGIN_NAME}: ${e instanceof Error ? e.message : String(e)}`);
  }
}

function main(): void {
  const state = parseArgs();

  if (state.help) {
    showHelp();
  }

  console.log('\n=== OpenCode Diff Plugin Setup ===\n');

  if (state.dryRun) {
    warn('Running in dry-run mode. No changes will be made.\n');
  }

  validateNodeVersion();
  checkPackageJson();
  checkOpenCodeCli();

  console.log('');

  setupOpenCodeJson(state.dryRun);
  setupPluginConfig(state.dryRun);
  installPlugin(state.dryRun);

  console.log('\n=== Setup Complete ===\n');

  if (state.dryRun) {
    console.log('This was a dry run. Run without --dry-run to apply changes.');
  } else {
    console.log('The OpenCode Diff Plugin has been set up successfully!');
    console.log('\nNext steps:');
    console.log('  1. Review the configuration in .opencode/diff-plugin.json');
    console.log('  2. Run opencode with the plugin loaded');
    console.log('\nFor help, visit: https://github.com/opencode-ai/opencode-diff-plugin');
  }

  console.log('');
  process.exit(0);
}

main();
