# NPM Private Package Publishing and NPX Setup Automation

## TL;DR

> **Quick Summary**: Convert `opencode-diff-plugin` to scoped private NPM package `opencode-diff-plugin` and create an NPX-runnable setup script that automates integration in existing projects by generating required OpenCode configuration files.
> 
> **Deliverables**:
> - Updated `package.json` with scoped name and bin entry
> - Setup CLI script (`src/setup.ts`) for automated configuration
> - Private NPM package published and installable
> - Automated integration: creates `opencode.json` and `.opencode/diff-plugin.json`
> 
> **Estimated Effort**: Medium (~2-3 hours)
> **Parallel Execution**: NO - Sequential (package prep → setup script → publish → verify)
> **Critical Path**: Update package.json → Create setup script → Build → Publish → Test NPX

---

## Context

### Original Request
User wants to:
1. Publish the `opencode-diff-plugin` as a private NPM package accessible only to their account
2. Create an NPX runnable script that automates manual installation steps
3. Generate necessary OpenCode integration files in existing projects (not create test projects)
4. Match real user environment for testing

### Interview Summary
**Key Discussions**:
- User has no NPM organization → Use personal scope `opencode-diff-plugin`
- Private access → Scoped package with restricted access
- No test project creation → Script runs in existing project directories
- VSCode extension excluded → Focus on plugin integration only

**Research Findings**:
- Current package name: `opencode-diff-plugin` (needs to become scoped)
- Uses ES modules with Bun for development
- Requires TWO config files: `opencode.json` and `.opencode/diff-plugin.json`
- Build output in `dist/` directory
- Peer dependency on `@opencode-ai/plugin`

### Metis Review
**Identified Gaps** (addressed):
- **Config Merge Strategy**: Use merge (append to plugins array) not overwrite
- **NPX Model**: Use subcommand `npx opencode-diff-plugin setup`
- **Package Manager**: NPM only (yarn/pnpm out of scope for v1)
- **Interactive Mode**: No prompts, use --dry-run flag instead
- **Validation**: Check Node >=18, package.json existence, OpenCode CLI presence
- **Edge Cases**: Handle existing configs, monorepos, missing dependencies

---

## Work Objectives

### Core Objective
Convert the existing `opencode-diff-plugin` to a scoped private NPM package and create an automated setup CLI that generates all required OpenCode configuration files in existing projects, eliminating manual installation steps.

### Concrete Deliverables
1. **Updated package.json** with scoped name `opencode-diff-plugin` and bin entry
2. **Setup CLI script** (`src/setup.ts`) that handles automated configuration
3. **Private NPM package** published to registry with restricted access
4. **Integration automation**: Creates `opencode.json` and `.opencode/diff-plugin.json` with safe defaults
5. **Verification tooling**: Validates Node version, OpenCode presence, and generated configs

### Definition of Done
- [ ] Package can be published to NPM as private scoped package
- [ ] NPX command `npx opencode-diff-plugin setup` runs successfully
- [ ] Setup script creates valid `opencode.json` with plugin reference
- [ ] Setup script creates valid `.opencode/diff-plugin.json` with safe defaults
- [ ] Setup script preserves existing plugins when updating `opencode.json`
- [ ] --dry-run flag previews changes without applying them
- [ ] All acceptance criteria pass (executable verification commands)

### Must Have
- Scoped package name `opencode-diff-plugin`
- NPX bin entry in package.json
- Setup script that generates both config files
- NPM package manager support (v1)
- Node >=18.0.0 validation
- Package.json existence check
- --dry-run flag support
- Merge strategy for existing configs (don't overwrite)

### Must NOT Have (Guardrails)
- NO interactive prompts (use flags and defaults)
- NO yarn/pnpm support in v1
- NO VSCode extension automation
- NO test project creation
- NO global installation option
- NO automatic version bumping
- NO public package publishing (must remain private)

---

## Verification Strategy (MANDATORY)

> **UNIVERSAL RULE: ZERO HUMAN INTERVENTION**
>
> ALL tasks in this plan MUST be verifiable WITHOUT any human action.

### Test Decision
- **Infrastructure exists**: YES (bun test configured)
- **Automated tests**: YES (Tests-after implementation)
- **Framework**: bun test

### Agent-Executed QA Scenarios (MANDATORY — ALL tasks)

**Verification Tool by Deliverable Type:**

| Type | Tool | How Agent Verifies |
|------|------|-------------------|
| **Config Generation** | Bash | Check file existence, validate JSON with jq |
| **Package Build** | Bash | Run build, check dist/ contents, npm pack |
| **NPX Script** | Bash | Execute npx command, capture output, verify exit code |
| **Integration** | Bash | Test in temp directory, verify config files |

**Each Scenario Format:**

```
Scenario: [Descriptive name]
  Tool: Bash
  Preconditions: [Setup requirements]
  Steps:
    1. [Exact command with arguments]
    2. [Validation step]
  Expected Result: [Concrete observable outcome]
  Failure Indicators: [What indicates failure]
  Evidence: [Command output capture]
```

---

## Execution Strategy

### Sequential Execution (No Parallelization)

This work requires sequential execution due to dependencies:

```
Phase 1 (Package Preparation):
└── Task 1: Update package.json with scoped name and bin entry

Phase 2 (Setup Script Development):
└── Task 2: Create CLI setup script with all automation logic

Phase 3 (Build Integration):
└── Task 3: Integrate setup script into build pipeline

Phase 4 (Publishing):
└── Task 4: Publish to NPM as private scoped package

Phase 5 (Verification):
└── Task 5: Test NPX workflow and verify setup
```

### Dependency Matrix

| Task | Depends On | Blocks | Can Parallelize With |
|------|------------|--------|---------------------|
| 1 | None | 2 | None |
| 2 | 1 | 3 | None |
| 3 | 2 | 4 | None |
| 4 | 3 | 5 | None |
| 5 | 4 | None | None |

---

## TODOs

### Task 1: Update package.json for Scoped Private Package

**What to do**:
1. Change package name from `opencode-diff-plugin` to `opencode-diff-plugin`
2. Add `bin` entry for NPX execution: `"setup-opencode-diff-plugin": "dist/setup.js"`
3. Ensure `publishConfig` has `"access": "restricted"` for private package
4. Update any hardcoded package references in documentation
5. Verify build scripts still work with new name

**Must NOT do**:
- Change version without explicit user confirmation
- Modify peer dependencies or main entry points
- Update files array unnecessarily

**Recommended Agent Profile**:
- **Category**: `quick`
- **Skills**: `git-master`
  - `git-master`: Track changes to package.json for potential rollback

**Parallelization**:
- **Can Run In Parallel**: NO
- **Parallel Group**: Sequential
- **Blocks**: Task 2
- **Blocked By**: None

**References**:
- `opencode-diff-plugin/package.json:1-82` - Current package configuration
- `opencode-diff-plugin/package.json:14-19` - Files array (ensure setup.js will be included)

**Acceptance Criteria**:
- [ ] Package name is `opencode-diff-plugin`
- [ ] `bin["setup-opencode-diff-plugin"]` points to `"dist/setup.js"`
- [ ] `publishConfig.access` is `"restricted"`
- [ ] `npm run build` still completes successfully

**Scenario: Package.json updated correctly**
  Tool: Bash
  Preconditions: In opencode-diff-plugin directory
  Steps:
    1. cat package.json | jq -r '.name'
    2. Assert: Output is "opencode-diff-plugin"
    3. cat package.json | jq -r '.bin["setup-opencode-diff-plugin"]'
    4. Assert: Output is "dist/setup.js"
    5. cat package.json | jq -r '.publishConfig.access'
    6. Assert: Output is "restricted"
  Expected Result: All fields correctly updated
  Evidence: Command output captured

**Commit**: YES
- Message: `chore(package): update to scoped private package opencode-diff-plugin`
- Files: `opencode-diff-plugin/package.json`
- Pre-commit: `npm run build && npm run lint`

---

### Task 2: Create CLI Setup Script

**What to do**:
1. Create `src/setup.ts` with CLI argument parsing (using process.argv)
2. Implement validation functions:
   - `checkNodeVersion()`: Verify Node >=18.0.0
   - `checkPackageJson()`: Verify running in project with package.json
   - `checkOpenCode()`: Verify OpenCode CLI is installed (warn if not)
3. Implement `--dry-run` flag: Preview changes without applying
4. Implement `generateOpenCodeConfig()`: Create/merge `opencode.json`
   - If exists: Read, append plugin to plugins array (avoid duplicates)
   - If not exists: Create new with plugin reference
5. Implement `generatePluginConfig()`: Create `.opencode/diff-plugin.json`
   - Use safe defaults: `{ enabled: true, ide: { enabled: false, stateFilePath: ".opencode/.diff-plugin-state.json" }, autoAccept: ["package-lock.json", "yarn.lock", "*.lock"], autoReject: [], maxFileSize: 1048576, theme: "auto", showLineNumbers: true }`
   - If exists: Warn and skip (or use --force to overwrite)
6. Implement `installPlugin()`: Run `npm install opencode-diff-plugin`
7. Add logging for all actions
8. Export main function for bin entry

**Must NOT do**:
- Add interactive prompts (use flags only)
- Support yarn or pnpm in v1
- Install OpenCode CLI
- Modify git hooks or CI configs
- Create example files or test projects

**Recommended Agent Profile**:
- **Category**: `unspecified-high`
- **Skills**: 
  - None required (TypeScript CLI development)
- **Skills Evaluated but Omitted**:
  - `playwright`: Not needed (CLI tool, no browser)
  - `git-master`: Not needed (no git operations)

**Parallelization**:
- **Can Run In Parallel**: NO
- **Parallel Group**: Sequential
- **Blocks**: Task 3
- **Blocked By**: Task 1

**References**:
- `opencode-diff-plugin/src/config.ts:100-438` - ConfigManager class for config structure reference
- `opencode-diff-plugin/examples/basic/opencode-diff-config.json` - Example plugin config
- `opencode-diff-plugin/src/index.ts:24-106` - Plugin initialization pattern
- `INSTALLATION.md:49-66` - Manual config creation steps (automate these)

**Acceptance Criteria**:
- [ ] Setup script handles `--dry-run` flag
- [ ] Setup script validates Node >=18.0.0
- [ ] Setup script checks for package.json in current directory
- [ ] Setup script warns if OpenCode CLI not found
- [ ] Setup script creates/merges `opencode.json` with plugin reference
- [ ] Setup script creates `.opencode/diff-plugin.json` with safe defaults
- [ ] Setup script installs plugin via npm
- [ ] Setup script logs all actions taken

**Scenario: Setup script validates Node version**
  Tool: Bash
  Preconditions: In project directory
  Steps:
    1. node -e "process.version='v16.0.0'; require('./dist/setup.js')"
    2. Assert: Script exits with error code 1
    3. Assert: Output contains "Node.js >= 18.0.0 required"
  Expected Result: Script fails with clear error on old Node
  Evidence: Terminal output captured

**Scenario: Setup script creates opencode.json**
  Tool: Bash
  Preconditions: In empty temp directory with package.json
  Steps:
    1. mkdir -p /tmp/test-setup && cd /tmp/test-setup && npm init -y
    2. node dist/setup.js
    3. cat opencode.json | jq -e '.plugin | contains(["opencode-diff-plugin"])'
    4. Assert: Exit code 0
  Expected Result: opencode.json created with plugin reference
  Evidence: File content and jq exit code

**Scenario: Setup script merges with existing opencode.json**
  Tool: Bash
  Preconditions: In temp directory with existing opencode.json
  Steps:
    1. echo '{"plugin": ["other-plugin"]}' > opencode.json
    2. node dist/setup.js
    3. cat opencode.json | jq '.plugin | length'
    4. Assert: Output is "2"
    5. cat opencode.json | jq -e '.plugin | contains(["other-plugin"])'
    6. Assert: Exit code 0
  Expected Result: Existing plugin preserved, new one added
  Evidence: File content showing both plugins

**Scenario: Dry run mode previews without changes**
  Tool: Bash
  Preconditions: In temp directory with no opencode.json
  Steps:
    1. node dist/setup.js --dry-run
    2. Assert: Output contains "Would create opencode.json"
    3. Assert: opencode.json does NOT exist
  Expected Result: Changes previewed but not applied
  Evidence: Command output and file non-existence

**Commit**: YES
- Message: `feat(setup): add NPX setup CLI script`
- Files: `opencode-diff-plugin/src/setup.ts`, `opencode-diff-plugin/package.json` (bin entry already done in Task 1)
- Pre-commit: `npm run build && bun test`

---

### Task 3: Integrate Setup Script into Build Pipeline

**What to do**:
1. Verify `src/setup.ts` is included in tsconfig.json compilation
2. Add setup.ts to the build output (should create dist/setup.js)
3. Make dist/setup.js executable (chmod +x or via shebang)
4. Add shebang line to setup.ts: `#!/usr/bin/env node`
5. Verify `npm run build` creates dist/setup.js
6. Test that bin entry works: `node dist/setup.js --help`

**Must NOT do**:
- Change main entry point or exports
- Modify existing build scripts unnecessarily
- Add new build dependencies

**Recommended Agent Profile**:
- **Category**: `quick`
- **Skills**: None required

**Parallelization**:
- **Can Run In Parallel**: NO
- **Parallel Group**: Sequential
- **Blocks**: Task 4
- **Blocked By**: Task 2

**References**:
- `opencode-diff-plugin/tsconfig.json` - TypeScript configuration
- `opencode-diff-plugin/package.json:20-27` - Build scripts

**Acceptance Criteria**:
- [ ] `npm run build` creates `dist/setup.js`
- [ ] `dist/setup.js` is executable
- [ ] `node dist/setup.js --help` shows usage

**Scenario: Build includes setup script**
  Tool: Bash
  Preconditions: In opencode-diff-plugin directory
  Steps:
    1. npm run build
    2. ls -la dist/setup.js
    3. Assert: File exists
    4. head -1 dist/setup.js
    5. Assert: First line is "#!/usr/bin/env node"
  Expected Result: Setup script built with shebang
  Evidence: File listing and content check

**Commit**: YES
- Message: `build(setup): integrate setup script into build pipeline`
- Files: `opencode-diff-plugin/tsconfig.json` (if needed), `opencode-diff-plugin/src/setup.ts` (add shebang)
- Pre-commit: `npm run build && ls dist/setup.js`

---

### Task 4: Publish to NPM as Private Scoped Package

**What to do**:
1. Ensure user is logged in to npm: `npm whoami` (should show alihadiozturk)
2. Run `npm pack` to verify package contents
3. Check that dist/ is included in the tarball
4. Run `npm publish --access restricted`
5. Verify package appears in npm registry: `npm view opencode-diff-plugin`

**Must NOT do**:
- Publish as public package
- Bump version without confirmation
- Skip the --access restricted flag

**Recommended Agent Profile**:
- **Category**: `quick`
- **Skills**: `git-master`
  - `git-master`: Tag the release commit after successful publish

**Parallelization**:
- **Can Run In Parallel**: NO
- **Parallel Group**: Sequential
- **Blocks**: Task 5
- **Blocked By**: Task 3

**References**:
- `opencode-diff-plugin/package.json:1-10` - Package metadata
- NPM documentation on scoped packages

**Acceptance Criteria**:
- [ ] `npm pack` shows scoped package name
- [ ] Package tarball includes dist/setup.js
- [ ] `npm publish --access restricted` succeeds
- [ ] `npm view opencode-diff-plugin` shows package info

**Scenario: Package published successfully**
  Tool: Bash
  Preconditions: User logged into npm
  Steps:
    1. cd opencode-diff-plugin
    2. npm pack
    3. Assert: Creates alihadiozturk-opencode-diff-plugin-*.tgz
    4. npm publish --access restricted
    5. Assert: Exit code 0
    6. npm view opencode-diff-plugin version
    7. Assert: Shows current version
  Expected Result: Package published and viewable
  Evidence: npm output and registry response

**Commit**: YES (if version bumped)
- Message: `chore(release): publish v0.1.0 to npm`
- Files: `opencode-diff-plugin/package.json` (version), git tag
- Pre-commit: `npm publish --dry-run`

---

### Task 5: Test NPX Workflow and Verify Setup

**What to do**:
1. Create temporary test directory with `package.json`
2. Run `npx opencode-diff-plugin setup`
3. Verify `opencode.json` created with correct plugin reference
4. Verify `.opencode/diff-plugin.json` created with safe defaults
5. Verify plugin installed in node_modules
6. Test --dry-run flag works
7. Test with existing config files (merge behavior)
8. Clean up test directory

**Must NOT do**:
- Leave test directories behind
- Skip any verification steps

**Recommended Agent Profile**:
- **Category**: `unspecified-high`
- **Skills**: None required

**Parallelization**:
- **Can Run In Parallel**: NO
- **Parallel Group**: Sequential
- **Blocks**: None (final task)
- **Blocked By**: Task 4

**References**:
- `NPM_TESTING.md:1-20` - Manual testing steps (automate verification)

**Acceptance Criteria**:
- [ ] NPX command runs without errors
- [ ] `opencode.json` created with plugin in plugins array
- [ ] `.opencode/diff-plugin.json` created with safe defaults
- [ ] Plugin installed in node_modules
- [ ] --dry-run shows preview without changes
- [ ] Existing configs merged correctly

**Scenario: NPX setup works end-to-end**
  Tool: Bash
  Preconditions: In fresh temp directory
  Steps:
    1. mkdir -p /tmp/npx-test && cd /tmp/npx-test && npm init -y
    2. npx opencode-diff-plugin setup
    3. cat opencode.json | jq -r '.plugin[0]'
    4. Assert: Output is "opencode-diff-plugin"
    5. cat .opencode/diff-plugin.json | jq -r '.enabled'
    6. Assert: Output is "true"
    7. ls node_modules/opencode-diff-plugin
    8. Assert: Directory exists
  Expected Result: All files created and plugin installed
  Evidence: File contents and directory listing

**Scenario: Merge with existing config**
  Tool: Bash
  Preconditions: Directory with existing opencode.json
  Steps:
    1. mkdir -p /tmp/merge-test && cd /tmp/merge-test && npm init -y
    2. echo '{"plugin": ["existing-plugin"], "other": "value"}' > opencode.json
    3. npx opencode-diff-plugin setup
    4. cat opencode.json | jq '.plugin | length'
    5. Assert: Output is "2"
    6. cat opencode.json | jq -r '.other'
    7. Assert: Output is "value"
  Expected Result: Existing values preserved, plugin appended
  Evidence: JSON content verification

**Scenario: Dry run shows changes without applying**
  Tool: Bash
  Preconditions: Fresh directory with no configs
  Steps:
    1. mkdir -p /tmp/dryrun-test && cd /tmp/dryrun-test && npm init -y
    2. npx opencode-diff-plugin setup --dry-run
    3. Assert: Output shows "Would create opencode.json"
    4. Assert: ! -f opencode.json (file does not exist)
  Expected Result: Preview shown, no files created
  Evidence: Command output and file absence check

**Commit**: NO (verification task, no code changes)

---

## Commit Strategy

| After Task | Message | Files | Verification |
|------------|---------|-------|--------------|
| 1 | `chore(package): update to scoped private package` | package.json | npm run build |
| 2 | `feat(setup): add NPX setup CLI script` | src/setup.ts | bun test |
| 3 | `build(setup): integrate setup script into build pipeline` | tsconfig.json (if changed) | npm run build && ls dist/setup.js |
| 4 | `chore(release): publish v0.1.0 to npm` | package.json (version) | npm view opencode-diff-plugin |
| 5 | NO COMMIT | - | All scenarios pass |

---

## Success Criteria

### Verification Commands
```bash
# Test 1: Package is scoped correctly
cd opencode-diff-plugin
cat package.json | jq -r '.name'
# Expected: "opencode-diff-plugin"

# Test 2: Package is private (restricted access)
cat package.json | jq -r '.publishConfig.access'
# Expected: "restricted"

# Test 3: Bin entry exists
cat package.json | jq -r '.bin["setup-opencode-diff-plugin"]'
# Expected: "dist/setup.js"

# Test 4: Build includes setup script
npm run build
ls dist/setup.js
# Expected: File exists

# Test 5: Package published
npm view opencode-diff-plugin
# Expected: Package info displayed

# Test 6: NPX setup creates config files
mkdir -p /tmp/final-test && cd /tmp/final-test && npm init -y
npx opencode-diff-plugin setup
cat opencode.json | jq -e '.plugin | contains(["opencode-diff-plugin"])'
# Expected: Exit code 0 (success)

cat .opencode/diff-plugin.json | jq '.enabled'
# Expected: true

# Test 7: Plugin is installed
ls node_modules/opencode-diff-plugin
# Expected: Directory exists

# Test 8: Merge preserves existing plugins
echo '{"plugin": ["other"]}' > opencode.json
npx opencode-diff-plugin setup
cat opencode.json | jq '.plugin | length'
# Expected: 2
```

### Final Checklist
- [ ] All "Must Have" present
- [ ] All "Must NOT Have" absent
- [ ] All tests pass (bun test)
- [ ] Package published to NPM
- [ ] NPX workflow verified
- [ ] Config files generate correctly
- [ ] Merge strategy works for existing configs
- [ ] --dry-run flag functional
