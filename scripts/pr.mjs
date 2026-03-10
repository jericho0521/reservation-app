import { execFileSync } from 'node:child_process';

function run(command, args, options = {}) {
  return execFileSync(command, args, {
    encoding: 'utf8',
    stdio: ['inherit', 'pipe', 'pipe'],
    ...options,
  }).trim();
}

function runInteractive(command, args) {
  execFileSync(command, args, { stdio: 'inherit' });
}

function printHelp() {
  console.log('Usage: pnpm pr [--base <branch>] [--dry-run]');
  console.log('');
  console.log('Options:');
  console.log('  --base <branch>  Override the PR base branch');
  console.log('  --dry-run        Show what would run without pushing or creating a PR');
  console.log('  --help           Show this help message');
}

const args = process.argv.slice(2);

if (args.includes('--help') || args.includes('-h')) {
  printHelp();
  process.exit(0);
}

const dryRun = args.includes('--dry-run');
const baseIndex = args.indexOf('--base');

let baseBranch = '';

if (baseIndex !== -1) {
  baseBranch = args[baseIndex + 1] || '';
  if (!baseBranch || baseBranch.startsWith('-')) {
    console.error('Missing value for --base');
    process.exit(1);
  }
}

const currentBranch = run('git', ['rev-parse', '--abbrev-ref', 'HEAD']);

if (currentBranch === 'HEAD') {
  console.error('Cannot create a PR from a detached HEAD. Check out a branch first.');
  process.exit(1);
}

if (!baseBranch) {
  baseBranch = run('gh', ['repo', 'view', '--json', 'defaultBranchRef', '--jq', '.defaultBranchRef.name']);
}

if (dryRun) {
  console.log(`Would push branch: ${currentBranch}`);
  console.log(`Would use base branch: ${baseBranch}`);
  console.log('Would reuse an existing PR if one already exists.');
  console.log('Would create a new PR with gh pr create --fill if needed.');
  process.exit(0);
}

console.log(`Pushing ${currentBranch} to origin...`);
runInteractive('git', ['push', '-u', 'origin', currentBranch]);

try {
  const existingPrUrl = run('gh', ['pr', 'view', currentBranch, '--json', 'url', '--jq', '.url']);
  console.log(`PR already exists: ${existingPrUrl}`);
  process.exit(0);
} catch {
}

console.log(`Creating PR from ${currentBranch} to ${baseBranch}...`);
runInteractive('gh', ['pr', 'create', '--base', baseBranch, '--head', currentBranch, '--fill']);
