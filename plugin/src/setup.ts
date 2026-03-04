#!/usr/bin/env node

/**
 * Setup CLI Script for OpenCode Diff Plugin
 *
 * This script sets up the OpenCode Diff Plugin by:
 * - Validating Node.js version
 * - Checking for package.json (local mode)
 * - Creating/updating opencode.json with plugin reference
 * - Creating .opencode/diff-plugin.json with safe defaults
 * - Installing the plugin via npm (locally or globally)
 *
 * Usage:
 *   npx opencode-diff setup              # Local installation (default)
 *   npx opencode-diff setup --global     # Global installation
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';
import { homedir } from 'os';

const PLUGIN_NAME = 'opencode-diff';
const PLUGIN_VERSION = '0.1.2';

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
  global: boolean;
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
    global: false,
  };

  for (const arg of args) {
    if (arg === '--dry-run') {
      state.dryRun = true;
    } else if (arg === '--help' || arg === '-h') {
      state.help = true;
    } else if (arg === '--global' || arg === '-g') {
      state.global = true;
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
  --global, -g   Install plugin globally (available in all projects)
  --dry-run      Show what would be done without making any changes
  --help, -h     Show this help message

Modes:
  Local Mode (default):
    - Installs plugin in current project
    - Creates opencode.json with plugin reference
    - Creates .opencode/diff-plugin.json with safe defaults
    - Requires package.json in current directory

  Global Mode (--global):
    - Installs plugin globally (npm install -g)
    - Creates ~/.opencode/config.json with plugin reference
    - Creates .opencode/diff-plugin.json in current directory (optional)
    - Plugin available in all projects without per-project installation

Examples:
  # Local installation (default)
  npx ${PLUGIN_NAME} setup

  # Global installation
  npx ${PLUGIN_NAME} setup --global

  # Preview changes
  npx ${PLUGIN_NAME} setup --dry-run
  npx ${PLUGIN_NAME} setup --global --dry-run
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
      'No package.json found in current directory. Please run this command in a project directory, or use --global for global installation.'
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

function getGlobalOpencodeDir(): string {
  return join(homedir(), '.opencode');
}

function getGlobalConfigPath(): string {
  return join(getGlobalOpencodeDir(), 'config.json');
}

function setupGlobalOpenCodeConfig(dryRun: boolean): void {
  const configPath = getGlobalConfigPath();
  const opencodeDir = getGlobalOpencodeDir();
  const pluginEntry = PLUGIN_NAME;

  let config: {
    $schema?: string;
    plugins?: string[];
    [key: string]: unknown;
  } = {};

  if (existsSync(configPath)) {
    log(`Found existing global config at ${configPath}`);
    try {
      const content = readFileSync(configPath, 'utf-8');
      config = JSON.parse(content);
    } catch (e) {
      error(`Failed to parse global config: ${e instanceof Error ? e.message : String(e)}`);
    }

    if (!config.plugins) {
      config.plugins = [];
    }

    const isPluginInstalled = config.plugins.some(
      (plugin: string) => plugin === PLUGIN_NAME || plugin.startsWith(`${PLUGIN_NAME}@`)
    );

    if (isPluginInstalled) {
      log(`Plugin ${PLUGIN_NAME} is already configured in global config`);
      return;
    }

    config.plugins.push(pluginEntry);

    if (dryRun) {
      log(`[DRY-RUN] Would add ${PLUGIN_NAME} to global config`);
      return;
    }

    writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
    success(`Added ${PLUGIN_NAME} to global config (${configPath})`);
  } else {
    if (dryRun) {
      log(`[DRY-RUN] Would create global config at ${configPath} with plugin ${PLUGIN_NAME}`);
      return;
    }

    if (!existsSync(opencodeDir)) {
      mkdirSync(opencodeDir, { recursive: true });
      log(`Created ${opencodeDir} directory`);
    }

    config = {
      plugins: [pluginEntry],
    };

    writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
    success(`Created global config at ${configPath} with plugin ${PLUGIN_NAME}`);
  }
}

function setupLocalOpenCodeJson(dryRun: boolean): void {
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

function setupPluginConfig(dryRun: boolean, global: boolean): void {
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

function installPlugin(dryRun: boolean, global: boolean): void {
  const installTarget = global ? 'globally' : 'locally';

  if (dryRun) {
    const command = global
      ? `npm install -g ${PLUGIN_NAME}`
      : `npm install ${PLUGIN_NAME}`;
    log(`[DRY-RUN] Would run: ${command}`);
    return;
  }

  log(`Installing ${PLUGIN_NAME} ${installTarget}...`);

  try {
    const command = global
      ? `npm install -g ${PLUGIN_NAME}`
      : `npm install ${PLUGIN_NAME}`;
    
    execSync(command, {
      stdio: 'inherit',
    });
    success(`Installed ${PLUGIN_NAME} ${installTarget}`);
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

  if (state.global) {
    console.log('Mode: Global Installation\n');
  } else {
    console.log('Mode: Local Installation\n');
  }

  validateNodeVersion();
  
  // Only check for package.json in local mode
  if (!state.global) {
    checkPackageJson();
  }
  
  checkOpenCodeCli();

  console.log('');

  // Setup config based on mode
  if (state.global) {
    setupGlobalOpenCodeConfig(state.dryRun);
    // Also create local plugin config in current directory for per-project settings
    setupPluginConfig(state.dryRun, state.global);
  } else {
    setupLocalOpenCodeJson(state.dryRun);
    setupPluginConfig(state.dryRun, state.global);
  }
  
  installPlugin(state.dryRun, state.global);

  console.log('\n=== Setup Complete ===\n');

  if (state.dryRun) {
    console.log('This was a dry run. Run without --dry-run to apply changes.');
  } else {
    console.log('The OpenCode Diff Plugin has been set up successfully!');
    
    if (state.global) {
      console.log('\nGlobal Installation Benefits:');
      console.log('  ✓ Plugin available in all projects without per-project installation');
      console.log('  ✓ Single source of truth for plugin version');
      console.log('  ✓ Easier to update across all projects');
      console.log('\nNext steps:');
      console.log('  1. Review the configuration in .opencode/diff-plugin.json (per-project settings)');
      console.log('  2. Run opencode in any project directory');
      console.log('  3. Each project can have its own .opencode/diff-plugin.json for customization');
    } else {
      console.log('\nNext steps:');
      console.log('  1. Review the configuration in .opencode/diff-plugin.json');
      console.log('  2. Run opencode with the plugin loaded');
    }
    
    console.log('\nFor help, visit: https://github.com/opencode-ai/opencode-diff-plugin');
  }

  console.log('');
  process.exit(0);
}

main();
