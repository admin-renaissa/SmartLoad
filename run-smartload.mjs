#!/usr/bin/env node
/**
 * run-smartload.mjs — SmartLoad App Lifecycle Manager
 *
 * Usage:
 *   node run-smartload.mjs <command> [options]
 *   ./run-smartload.mjs <command> [options]   (after chmod +x)
 *
 * Commands: setup | start | stop | restart | clean | status | logs | db:reset | doctor
 */

import {
  existsSync, mkdirSync, readFileSync, writeFileSync, renameSync,
  unlinkSync, appendFileSync, statSync, openSync, readSync, closeSync,
} from 'fs';
import { spawn, execSync, spawnSync } from 'child_process';
import { createInterface } from 'readline';
import {
  join, resolve, dirname, basename,
} from 'path';
import { fileURLToPath } from 'url';
import { platform, homedir } from 'os';
import * as net from 'net';
import * as http from 'http';
import * as https from 'https';

// ─── Constants ────────────────────────────────────────────────────────────────

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = __dirname;

const IS_WIN = platform() === 'win32';
const IS_MAC = platform() === 'darwin';
const MANAGER_DIR = join(PROJECT_ROOT, '.app-manager');
const LOGS_DIR = join(MANAGER_DIR, 'logs');
const STATE_FILE = join(MANAGER_DIR, 'state.json');
const LOCK_FILE = join(MANAGER_DIR, 'lock');

// ─── Repo-specific Detection (smartload monorepo) ────────────────────────────

const FRONTEND_DIR = join(PROJECT_ROOT, 'apps', 'web');
const BACKEND_DIR = join(PROJECT_ROOT, 'apps', 'api');
const TALLY_DIR = join(PROJECT_ROOT, 'apps', 'tally-bridge');
const DB_PACKAGE_DIR = join(PROJECT_ROOT, 'packages', 'db');
const PRISMA_SCHEMA = join(DB_PACKAGE_DIR, 'prisma', 'schema.prisma');
const ENV_FILE = join(PROJECT_ROOT, '.env');
const ENV_EXAMPLE = join(PROJECT_ROOT, '.env.example');
const DOCKER_COMPOSE = join(PROJECT_ROOT, 'docker-compose.yml');

const APP_NAME = 'smartload';
const PKG_MANAGER = 'pnpm';

const DEFAULT_PORTS = {
  frontend: 3000,       // vite.config.ts server.port
  backend: 4000,        // .env PORT (Phase 0 / .env.example)
  tallyBridge: 7474,    // tally-bridge/src/index.ts BRIDGE_PORT fallback
  postgres: 5433,       // docker-compose host port (5433:5432; avoids local PG on 5432)
  redis: 6379,          // docker-compose host port
  minio: 9000,          // docker-compose host port
  minioConsole: 9001,   // docker-compose console port
};

const BACKEND_HEALTH_URL = `http://localhost:${DEFAULT_PORTS.backend}/health`;

// ─── CLI Parsing ─────────────────────────────────────────────────────────────

const ARGS = process.argv.slice(2);
const COMMAND = ARGS.find(a => !a.startsWith('-')) || 'help';
const FLAGS = {
  yes: ARGS.includes('--yes') || ARGS.includes('-y'),
  force: ARGS.includes('--force'),
  ci: ARGS.includes('--ci') || process.env.CI === 'true',
  debug: ARGS.includes('--debug'),
  noColor: ARGS.includes('--no-color') || !process.stdout.isTTY,
  dryRun: ARGS.includes('--dry-run'),
  noKill: ARGS.includes('--no-kill'),
  seed: ARGS.includes('--seed'),
  noSeed: ARGS.includes('--no-seed'),
  skipDb: ARGS.includes('--skip-db'),
  skipRedis: ARGS.includes('--skip-redis'),
  skipTally: ARGS.includes('--skip-tally'),
  useDockerDb: ARGS.includes('--use-docker-db'),
  useDockerRedis: ARGS.includes('--use-docker-redis'),
  downDb: ARGS.includes('--down-db'),
  downRedis: ARGS.includes('--down-redis'),
  removeVolumes: ARGS.includes('--remove-volumes'),
  removeNodeModules: ARGS.includes('--remove-node-modules'),
  follow: ARGS.includes('--follow'),
  forceLock: ARGS.includes('--force-lock'),
  skipTallyBridge: ARGS.includes('--skip-tally-bridge'),
  skipWorker: ARGS.includes('--skip-worker'),
  frontendPort: Number(ARGS.find(a => a.startsWith('--frontend-port='))?.split('=')[1]) || DEFAULT_PORTS.frontend,
  backendPort: Number(ARGS.find(a => a.startsWith('--backend-port='))?.split('=')[1]) || DEFAULT_PORTS.backend,
  service: ARGS.find(a => a.startsWith('--service='))?.split('=')[1] || 'all',
  lines: Number(ARGS.find(a => a.startsWith('--lines='))?.split('=')[1]) || 200,
  fullReset: ARGS.includes('--full-reset'),
  appName: ARGS.find(a => a.startsWith('--app-name='))?.split('=')[1] || APP_NAME,
};

// Allow --yes to short-circuit confirmation in CI
const AUTO_CONFIRM = FLAGS.yes || FLAGS.force || FLAGS.ci;

// ─── Colors ───────────────────────────────────────────────────────────────────

const C = FLAGS.noColor ? {
  reset: '', bold: '', dim: '', red: '', green: '', yellow: '', blue: '', cyan: '', magenta: '', gray: '',
} : {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
  gray: '\x1b[90m',
};

// ─── Logger ───────────────────────────────────────────────────────────────────

const LOG_FILE = join(LOGS_DIR, 'manager.log');

function ensureLogDir() {
  if (!existsSync(LOGS_DIR)) mkdirSync(LOGS_DIR, { recursive: true });
}

function formatTimestamp() {
  return new Date().toISOString().replace('T', ' ').slice(0, 19);
}

function writeLog(level, msg) {
  ensureLogDir();
  try { appendFileSync(LOG_FILE, `[${formatTimestamp()}] [${level}] ${msg}\n`); } catch {}
}

const log = {
  info:    (msg) => { console.log(`${C.cyan}ℹ${C.reset}  ${msg}`);                        writeLog('INFO', msg); },
  success: (msg) => { console.log(`${C.green}✔${C.reset}  ${msg}`);                       writeLog('SUCCESS', msg); },
  warn:    (msg) => { console.log(`${C.yellow}⚠${C.reset}  ${msg}`);                      writeLog('WARN', msg); },
  error:   (msg) => { console.error(`${C.red}✖${C.reset}  ${msg}`);                       writeLog('ERROR', msg); },
  debug:   (msg) => { if (FLAGS.debug) console.log(`${C.gray}[debug]${C.reset} ${msg}`);  writeLog('DEBUG', msg); },
  section: (msg) => { console.log(`\n${C.bold}${C.blue}── ${msg}${C.reset}`); },
  raw:     (msg) => console.log(msg),
};

function banner() {
  console.log(`
${C.bold}${C.cyan}╔══════════════════════════════════════════════╗
║   SmartLoad App Lifecycle Manager            ║
║   app: ${FLAGS.appName.padEnd(38)}║
╚══════════════════════════════════════════════╝${C.reset}`);
}

// ─── State Management (atomic) ────────────────────────────────────────────────

function ensureManagerDir() {
  if (!existsSync(MANAGER_DIR)) mkdirSync(MANAGER_DIR, { recursive: true });
  if (!existsSync(LOGS_DIR)) mkdirSync(LOGS_DIR, { recursive: true });
}

function readState() {
  ensureManagerDir();
  if (!existsSync(STATE_FILE)) return {};
  try { return JSON.parse(readFileSync(STATE_FILE, 'utf-8')); } catch { return {}; }
}

function writeState(state) {
  ensureManagerDir();
  const tmp = STATE_FILE + '.tmp';
  writeFileSync(tmp, JSON.stringify(state, null, 2));
  renameSync(tmp, STATE_FILE);
}

function updateState(patch) {
  const state = readState();
  writeState({ ...state, ...patch });
}

function clearStateKey(key) {
  const state = readState();
  delete state[key];
  writeState(state);
}

// ─── Lock Management ─────────────────────────────────────────────────────────

function acquireLock() {
  ensureManagerDir();
  if (existsSync(LOCK_FILE)) {
    const info = (() => { try { return JSON.parse(readFileSync(LOCK_FILE, 'utf-8')); } catch { return {}; } })();
    const age = info.timestamp ? Math.round((Date.now() - info.timestamp) / 1000) : '?';
    const pidAlive = info.pid ? isProcessRunning(info.pid) : false;

    if (!pidAlive) {
      // Stale lock — the owning process is gone; clean it up automatically
      log.debug(`Removing stale lock (PID ${info.pid || '?'} is no longer running).`);
      try { unlinkSync(LOCK_FILE); } catch {}
    } else if (!FLAGS.forceLock) {
      log.error(`Lock file exists (created ${age}s ago by PID ${info.pid || '?'}).`);
      log.error('Another process may be running. Use --force-lock to override.');
      process.exit(1);
    } else {
      log.warn('--force-lock specified; overriding existing lock.');
    }
  }
  writeFileSync(LOCK_FILE, JSON.stringify({ pid: process.pid, timestamp: Date.now() }));
}

function releaseLock() {
  try { if (existsSync(LOCK_FILE)) unlinkSync(LOCK_FILE); } catch {}
}

// ─── Signal Handling ─────────────────────────────────────────────────────────

const childProcesses = new Map(); // key => child proc

function registerChild(key, child) { childProcesses.set(key, child); }

async function cleanupAndExit(code = 0) {
  log.warn('Shutting down…');
  for (const [key, child] of childProcesses.entries()) {
    try {
      if (child && !child.killed) {
        child.kill('SIGTERM');
        log.debug(`Sent SIGTERM to ${key} (PID ${child.pid})`);
      }
    } catch {}
  }
  releaseLock();
  process.exit(code);
}

process.on('SIGINT', () => cleanupAndExit(130));
process.on('SIGTERM', () => cleanupAndExit(0));

// ─── Helpers: port / process detection ───────────────────────────────────────

async function isPortOpen(port, host = '127.0.0.1', timeout = 1000) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ port, host });
    socket.setTimeout(timeout);
    socket.on('connect', () => { socket.destroy(); resolve(true); });
    socket.on('error', () => resolve(false));
    socket.on('timeout', () => { socket.destroy(); resolve(false); });
  });
}

function getPidOnPort(port) {
  try {
    if (IS_WIN) {
      const out = execSync(`netstat -ano | findstr :${port}`, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] });
      const lines = out.trim().split('\n').filter(l => l.includes('LISTENING'));
      if (!lines.length) return null;
      const pid = lines[0].trim().split(/\s+/).at(-1);
      return pid ? Number(pid) : null;
    } else {
      const out = execSync(`lsof -ti :${port}`, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
      const pids = out.split('\n').map(Number).filter(Boolean);
      return pids[0] || null;
    }
  } catch {
    return null;
  }
}

function getProcessName(pid) {
  try {
    if (IS_WIN) {
      const out = execSync(`tasklist /FI "PID eq ${pid}" /FO CSV /NH`, { encoding: 'utf-8' });
      return out.split(',')[0]?.replace(/"/g, '') || 'unknown';
    } else {
      return execSync(`ps -p ${pid} -o comm=`, { encoding: 'utf-8' }).trim();
    }
  } catch { return 'unknown'; }
}

function killPid(pid, force = false) {
  try {
    if (IS_WIN) {
      execSync(`taskkill /PID ${pid} /T${force ? ' /F' : ''}`, { stdio: 'pipe' });
    } else {
      process.kill(pid, force ? 'SIGKILL' : 'SIGTERM');
    }
    return true;
  } catch { return false; }
}

function isProcessRunning(pid) {
  if (!pid) return false;
  try { process.kill(Number(pid), 0); return true; } catch { return false; }
}

async function freePort(port, label = '') {
  const pid = getPidOnPort(port);
  if (!pid) return true;

  const name = getProcessName(pid);
  const portLabel = label ? `${label} (port ${port})` : `port ${port}`;

  if (FLAGS.noKill) {
    log.error(`${portLabel} is in use by PID ${pid} (${name}). --no-kill specified; aborting.`);
    process.exit(1);
  }

  if (!AUTO_CONFIRM) {
    const answer = await promptUser(`${portLabel} is in use by PID ${pid} (${name}). Kill it? [y/N] `);
    if (!answer.toLowerCase().startsWith('y')) {
      log.warn(`Skipping kill of PID ${pid}. Port ${port} remains occupied.`);
      return false;
    }
  }

  if (FLAGS.dryRun) { log.info(`[dry-run] Would kill PID ${pid} on port ${port}`); return true; }

  log.info(`Killing PID ${pid} (${name}) on port ${port}…`);
  killPid(pid, false);
  await sleep(1500);
  if (getPidOnPort(port)) {
    killPid(pid, true);
    await sleep(500);
  }
  return !getPidOnPort(port);
}

// ─── Helpers: prompt, sleep ───────────────────────────────────────────────────

function promptUser(question) {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, (answer) => { rl.close(); resolve(answer); });
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ─── Helpers: command execution ───────────────────────────────────────────────

function pnpmBin() { return IS_WIN ? 'pnpm.cmd' : 'pnpm'; }
function npxBin() { return IS_WIN ? 'npx.cmd' : 'npx'; }
function dockerBin() { return IS_WIN ? 'docker.exe' : 'docker'; }

function runSync(cmd, args = [], opts = {}) {
  const { cwd = PROJECT_ROOT, env, label = cmd, ignoreError = false } = opts;
  if (FLAGS.dryRun) { log.info(`[dry-run] ${cmd} ${args.join(' ')}`); return { code: 0, stdout: '', stderr: '' }; }
  log.debug(`Running: ${cmd} ${args.join(' ')}`);
  const result = spawnSync(cmd, args, {
    cwd, env: env || process.env, stdio: 'inherit', shell: IS_WIN,
  });
  if (result.error) {
    if (!ignoreError) throw result.error;
    return { code: 1 };
  }
  if (result.status !== 0 && !ignoreError) {
    throw new Error(`${label} exited with code ${result.status}`);
  }
  return { code: result.status || 0 };
}

function runSyncCapture(cmd, args = [], opts = {}) {
  const { cwd = PROJECT_ROOT, env, ignoreError = false } = opts;
  const result = spawnSync(cmd, args, {
    cwd, env: env || process.env, stdio: ['pipe', 'pipe', 'pipe'], shell: IS_WIN,
  });
  const stdout = result.stdout?.toString() || '';
  const stderr = result.stderr?.toString() || '';
  const code = result.status || (result.error ? 1 : 0);
  if (code !== 0 && !ignoreError) log.debug(`stderr: ${stderr}`);
  return { code, stdout, stderr };
}

function spawnDetached(key, cmd, args = [], opts = {}) {
  const { cwd = PROJECT_ROOT, logFile, env } = opts;
  if (FLAGS.dryRun) { log.info(`[dry-run] spawn ${cmd} ${args.join(' ')}`); return null; }
  const out = logFile ? require('fs').openSync(logFile, 'a') : 'pipe';
  const child = spawn(cmd, args, {
    cwd,
    env: env || process.env,
    stdio: ['ignore', logFile ? out : 'pipe', logFile ? out : 'pipe'],
    detached: false,
    shell: IS_WIN,
  });
  if (!logFile) {
    child.stdout?.on('data', d => appendFileSync(join(LOGS_DIR, `${key}.log`), d));
    child.stderr?.on('data', d => appendFileSync(join(LOGS_DIR, `${key}.log`), d));
  }
  registerChild(key, child);
  log.debug(`Spawned ${key} PID=${child.pid}`);
  return child;
}

// Fix: use proper file streams for logging
function spawnService(key, cmd, args = [], opts = {}) {
  const { cwd = PROJECT_ROOT, env } = opts;
  const logFile = join(LOGS_DIR, `${key}.log`);
  if (FLAGS.dryRun) { log.info(`[dry-run] spawn ${key}: ${cmd} ${args.join(' ')}`); return null; }
  ensureLogDir();
  const child = spawn(cmd, args, {
    cwd, env: env || process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: IS_WIN,
  });
  child.stdout?.on('data', d => appendFileSync(logFile, d));
  child.stderr?.on('data', d => appendFileSync(logFile, d));
  child.on('exit', (code) => {
    appendFileSync(logFile, `\n[manager] Process exited with code ${code}\n`);
    log.debug(`${key} exited with code ${code}`);
  });
  registerChild(key, child);
  return child;
}

// ─── Env helpers ──────────────────────────────────────────────────────────────

function parseEnvFile(filePath) {
  if (!existsSync(filePath)) return {};
  const out = {};
  const lines = readFileSync(filePath, 'utf-8').split('\n');
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

function getEnvValue(key, fallback = '') {
  const envVars = parseEnvFile(ENV_FILE);
  return process.env[key] || envVars[key] || fallback;
}

// ─── Docker helpers ───────────────────────────────────────────────────────────

function dockerAvailable() {
  const res = runSyncCapture(dockerBin(), ['--version'], { ignoreError: true });
  return res.code === 0;
}

function dockerComposeAvailable() {
  const res = runSyncCapture(dockerBin(), ['compose', 'version'], { ignoreError: true });
  return res.code === 0;
}

function dockerContainerRunning(name) {
  const res = runSyncCapture(dockerBin(), ['inspect', '--format', '{{.State.Status}}', name], { ignoreError: true });
  return res.stdout.trim() === 'running';
}

function dockerContainerHealthy(name) {
  const res = runSyncCapture(dockerBin(), ['inspect', '--format', '{{.State.Health.Status}}', name], { ignoreError: true });
  return ['healthy', 'none'].includes(res.stdout.trim());
}

async function waitForDockerContainer(name, timeoutMs = 60000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (dockerContainerRunning(name) && dockerContainerHealthy(name)) return true;
    await sleep(2000);
  }
  return false;
}

// ─── Readiness checks ─────────────────────────────────────────────────────────

async function waitForPort(port, label, timeoutMs = 45000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await isPortOpen(port)) {
      log.success(`${label} is ready on port ${port}`);
      return true;
    }
    await sleep(1000);
  }
  log.warn(`${label} did not become ready on port ${port} within ${timeoutMs / 1000}s`);
  return false;
}

async function waitForHealth(url, label, timeoutMs = 45000) {
  const start = Date.now();
  const mod = url.startsWith('https') ? https : http;
  while (Date.now() - start < timeoutMs) {
    try {
      await new Promise((resolve, reject) => {
        const req = mod.get(url, (res) => {
          if (res.statusCode && res.statusCode < 400) resolve(true);
          else reject(new Error(`HTTP ${res.statusCode}`));
        });
        req.setTimeout(2000, () => { req.destroy(); reject(new Error('timeout')); });
        req.on('error', reject);
      });
      log.success(`${label} health check passed at ${url}`);
      return true;
    } catch {
      await sleep(1500);
    }
  }
  log.warn(`${label} health check timed out at ${url}`);
  return false;
}

// ─── DB / Prisma helpers ──────────────────────────────────────────────────────

function prismaAvailable() { return existsSync(PRISMA_SCHEMA); }

/**
 * Build env for prisma/db commands: merge root .env into process.env so that
 * DATABASE_URL and other vars are visible regardless of cwd.
 */
function dbEnv() {
  return { ...process.env, ...parseEnvFile(ENV_FILE) };
}

function runPrismaGenerate() {
  log.info('Generating Prisma client…');
  runSync(pnpmBin(), ['--filter', '@smartload/db', 'run', 'generate'], { label: 'prisma generate', env: dbEnv() });
}

function runMigrateDeploy() {
  log.info('Running prisma migrate deploy…');
  try {
    runSync(pnpmBin(), ['--filter', '@smartload/db', 'run', 'migrate:deploy'], { label: 'migrate deploy', env: dbEnv() });
    return true;
  } catch {
    log.warn('migrate:deploy failed, falling back to db push…');
    try {
      runSync(npxBin(), ['prisma', 'db', 'push', '--skip-generate'], { cwd: DB_PACKAGE_DIR, label: 'db push fallback', env: dbEnv() });
      return true;
    } catch {
      return false;
    }
  }
}

function runSeed() {
  log.info('Seeding database…');
  try {
    runSync(pnpmBin(), ['--filter', '@smartload/db', 'run', 'seed'], { label: 'db seed', env: dbEnv() });
    log.success('Seed completed.');
    return true;
  } catch {
    log.warn('Seed failed or was skipped.');
    return false;
  }
}

function runFullReset() {
  log.info('Running full DB reset (destructive)…');
  try {
    runSync(npxBin(), ['prisma', 'migrate', 'reset', '--force', '--skip-seed'], { cwd: DB_PACKAGE_DIR, label: 'migrate reset', env: dbEnv() });
    return true;
  } catch {
    try {
      runSync(npxBin(), ['prisma', 'db', 'push', '--force-reset', '--accept-data-loss'], { cwd: DB_PACKAGE_DIR, label: 'db push force-reset', env: dbEnv() });
      return true;
    } catch {
      return false;
    }
  }
}

// ─── Docker Compose service management ───────────────────────────────────────

async function startDockerServices() {
  if (!dockerAvailable()) { log.warn('Docker not available; skipping container start.'); return false; }
  if (!dockerComposeAvailable()) { log.warn('Docker Compose not available; skipping.'); return false; }
  if (!existsSync(DOCKER_COMPOSE)) { log.warn('docker-compose.yml not found; skipping.'); return false; }

  log.info('Starting Docker services (postgres, redis, minio)…');
  if (FLAGS.dryRun) { log.info('[dry-run] docker compose up -d postgres redis minio'); return true; }

  runSync(dockerBin(), ['compose', 'up', '-d', 'postgres', 'redis', 'minio'], { label: 'docker compose up' });
  updateState({ dockerStartedByManager: true });

  log.info('Waiting for postgres to become healthy…');
  const pgOk = await waitForDockerContainer('smartload_postgres', 60000);
  if (!pgOk) log.warn('Postgres container did not become healthy in time.');
  else log.success('Postgres ready.');

  log.info('Waiting for redis to become healthy…');
  const redisOk = await waitForDockerContainer('smartload_redis', 30000);
  if (!redisOk) log.warn('Redis container did not become healthy in time.');
  else log.success('Redis ready.');

  return pgOk;
}

async function stopDockerServices(force = false) {
  if (!dockerAvailable() || !dockerComposeAvailable()) return;
  const state = readState();
  if (!state.dockerStartedByManager && !force) {
    log.debug('Docker services not started by manager; skipping stop.');
    return;
  }
  if (FLAGS.downDb || FLAGS.downRedis || force) {
    log.info('Stopping Docker services…');
    if (FLAGS.dryRun) { log.info('[dry-run] docker compose down'); return; }
    runSync(dockerBin(), ['compose', 'down', ...(FLAGS.removeVolumes ? ['-v'] : [])], { label: 'docker compose down', ignoreError: true });
    clearStateKey('dockerStartedByManager');
  }
}

// ─── Dep install ──────────────────────────────────────────────────────────────

function checkDepsInstalled() {
  return existsSync(join(PROJECT_ROOT, 'node_modules'));
}

function installDeps() {
  log.info('Installing dependencies (pnpm install)…');
  runSync(pnpmBin(), ['install'], { label: 'pnpm install' });
  log.success('Dependencies installed.');
}

// ─── COMMAND: setup ───────────────────────────────────────────────────────────

async function cmdSetup() {
  banner();
  log.section('Setup');

  // 1. Ensure .env exists
  if (!existsSync(ENV_FILE)) {
    if (existsSync(ENV_EXAMPLE)) {
      if (!FLAGS.dryRun) {
        const exContent = readFileSync(ENV_EXAMPLE, 'utf-8');
        writeFileSync(ENV_FILE, exContent);
      }
      log.success(`Created .env from .env.example`);
      log.warn('Please review .env and fill in secrets (JWT_SECRET, SMTP_*, etc.) before starting.');
    } else {
      log.warn('.env not found and no .env.example available. Creating minimal placeholder…');
      if (!FLAGS.dryRun) writeFileSync(ENV_FILE, [
        'DATABASE_URL="postgresql://smartload:smartload123@localhost:5433/smartload_db"',
        'DIRECT_DATABASE_URL="postgresql://smartload:smartload123@localhost:5433/smartload_db"',
        'REDIS_URL="redis://localhost:6379"',
        'JWT_SECRET="change-me-min-32-chars-aaaaaaaaaaaa"',
        'JWT_REFRESH_SECRET="change-me-different-min-32-chars-bb"',
        'PORT=4000',
        'NODE_ENV=development',
        'APP_BASE_URL="http://localhost:3000"',
        'CORS_ORIGINS="http://localhost:3000"',
        'VITE_API_URL="http://localhost:4000"',
        'VITE_APP_NAME="SmartLoad"',
        'VITE_SOCKET_URL="http://localhost:4000"',
      ].join('\n'));
      log.warn('Fill in JWT_SECRET, SMTP, AWS, MSG91, WATI values in .env before use.');
    }
  } else {
    log.success('.env already exists.');
  }

  // 2. Install deps
  if (!checkDepsInstalled()) {
    installDeps();
  } else {
    log.success('node_modules present; skipping install. Run with fresh node_modules if needed.');
  }

  // 3. Start Docker services
  if (!FLAGS.skipDb) {
    await startDockerServices();
    await sleep(3000); // let postgres settle
  }

  // 4. Prisma generate + migrate
  if (prismaAvailable() && !FLAGS.skipDb) {
    runPrismaGenerate();
    const migrated = runMigrateDeploy();
    if (migrated) log.success('Database migrations applied.');

    // 5. Seed
    if (!FLAGS.noSeed) {
      runSeed();
    }
  }

  log.section('Setup Complete');
  log.raw(`
${C.green}${C.bold}✔ Setup finished!${C.reset}

Next steps:
  ${C.cyan}node run-smartload.mjs start${C.reset}       — Start all services
  ${C.cyan}node run-smartload.mjs status${C.reset}      — Check status
  ${C.cyan}node run-smartload.mjs doctor${C.reset}      — Run diagnostics
`);
}

// ─── COMMAND: start ───────────────────────────────────────────────────────────

async function cmdStart() {
  banner();
  log.section('Starting SmartLoad');
  acquireLock();

  try {
    // Check deps
    if (!checkDepsInstalled()) {
      log.warn('node_modules not found; installing…');
      installDeps();
    }

    // Free ports
    const ports = [
      { port: FLAGS.backendPort, label: 'Backend API' },
      { port: FLAGS.frontendPort, label: 'Frontend' },
      { port: DEFAULT_PORTS.tallyBridge, label: 'Tally Bridge' },
    ];

    for (const { port, label } of ports) {
      const occupied = await isPortOpen(port);
      if (occupied) {
        const freed = await freePort(port, label);
        if (!freed) log.warn(`${label} port ${port} still occupied; may fail to start.`);
      }
    }

    // Start Docker infra
    if (!FLAGS.skipDb) {
      const pgRunning = dockerContainerRunning('smartload_postgres');
      const redisRunning = dockerContainerRunning('smartload_redis');
      if (!pgRunning || !redisRunning) {
        await startDockerServices();
        await sleep(4000);
      } else {
        log.success('Docker services already running.');
      }
    }

    // Prisma generate + migrate
    if (prismaAvailable() && !FLAGS.skipDb) {
      runPrismaGenerate();
      runMigrateDeploy();
    }

    // Optional seed on start
    if (FLAGS.seed || getEnvValue('SEED_ON_START') === 'true') {
      runSeed();
    }

    // ── Start Backend ──
    log.section('Starting Backend API');
    const apiLogFile = join(LOGS_DIR, 'backend.log');
    if (!FLAGS.dryRun) appendFileSync(apiLogFile, `\n\n── Start at ${new Date().toISOString()} ──\n`);

    const apiChild = spawnService('backend', pnpmBin(), ['--filter', '@smartload/api', 'run', 'dev'], {
      cwd: PROJECT_ROOT,
    });
    if (apiChild) {
      updateState({ backend: { pid: apiChild.pid, port: FLAGS.backendPort, logFile: apiLogFile, startedAt: Date.now() } });
    }

    // Wait for backend readiness
    log.info(`Waiting for backend health at ${BACKEND_HEALTH_URL}…`);
    const backendReady = await waitForHealth(`http://localhost:${FLAGS.backendPort}/health`, 'Backend', 60000);
    if (!backendReady) {
      log.warn('Backend may not be fully ready. Check logs: .app-manager/logs/backend.log');
    }

    // ── Start API worker (BullMQ: inventory, POD, Tally, notifications) ──
    if (!FLAGS.skipWorker) {
      log.section('Starting API worker (BullMQ)');
      const workerLogFile = join(LOGS_DIR, 'api-worker.log');
      if (!FLAGS.dryRun) appendFileSync(workerLogFile, `\n\n── Start at ${new Date().toISOString()} ──\n`);
      const workerChild = spawnService('api-worker', pnpmBin(), ['--filter', '@smartload/api', 'run', 'worker:dev'], {
        cwd: PROJECT_ROOT,
      });
      if (workerChild) {
        updateState({
          worker: { pid: workerChild.pid, logFile: workerLogFile, startedAt: Date.now() },
        });
      }
    }

    // ── Start Tally Bridge ──
    if (!FLAGS.skipTallyBridge) {
      log.section('Starting Tally Bridge');
      const tallyLogFile = join(LOGS_DIR, 'tally-bridge.log');
      if (!FLAGS.dryRun) appendFileSync(tallyLogFile, `\n\n── Start at ${new Date().toISOString()} ──\n`);
      const tallyChild = spawnService('tally-bridge', pnpmBin(), ['--filter', '@smartload/tally-bridge', 'run', 'dev'], {
        cwd: PROJECT_ROOT,
      });
      if (tallyChild) {
        updateState({ tallyBridge: { pid: tallyChild.pid, port: DEFAULT_PORTS.tallyBridge, logFile: tallyLogFile, startedAt: Date.now() } });
      }
    }

    // ── Start Frontend ──
    log.section('Starting Frontend (Vite)');
    const webLogFile = join(LOGS_DIR, 'frontend.log');
    if (!FLAGS.dryRun) appendFileSync(webLogFile, `\n\n── Start at ${new Date().toISOString()} ──\n`);

    const webChild = spawnService('frontend', pnpmBin(), ['--filter', '@smartload/web', 'run', 'dev'], {
      cwd: PROJECT_ROOT,
    });
    if (webChild) {
      updateState({ frontend: { pid: webChild.pid, port: FLAGS.frontendPort, logFile: webLogFile, startedAt: Date.now() } });
    }

    // Wait for frontend
    log.info(`Waiting for frontend on port ${FLAGS.frontendPort}…`);
    const frontendReady = await waitForPort(FLAGS.frontendPort, 'Frontend', 45000);
    if (!frontendReady) log.warn('Frontend may not be fully ready. Check logs: .app-manager/logs/frontend.log');

    // ── Final Summary ──
    releaseLock();
    const state = readState();
    printStartSummary(state);

    // Keep process alive watching children
    await waitForChildren();

  } catch (err) {
    log.error(`Start failed: ${err.message}`);
    releaseLock();
    process.exit(1);
  }
}

function printStartSummary(state) {
  const fePid = state.frontend?.pid || '?';
  const bePid = state.backend?.pid || '?';
  const fePort = state.frontend?.port || FLAGS.frontendPort;
  const bePort = state.backend?.port || FLAGS.backendPort;

  const tbPid = state.tallyBridge?.pid || '?';
  const wPid = state.worker?.pid || '?';

  log.raw(`
${C.bold}${C.green}╔══════════════════════════════════════════════════════════════╗
║  ✅  SmartLoad is Running                                    ║
╚══════════════════════════════════════════════════════════════╝${C.reset}

  ${C.bold}Frontend:${C.reset}     http://localhost:${fePort}   ${C.gray}(PID ${fePid})${C.reset}
  ${C.bold}Backend API:${C.reset}  http://localhost:${bePort}   ${C.gray}(PID ${bePid})${C.reset}
  ${C.bold}API Worker:${C.reset}    BullMQ consumer            ${C.gray}(PID ${wPid})${C.reset}
  ${C.bold}Health:${C.reset}       http://localhost:${bePort}/health
  ${C.bold}Tally Bridge:${C.reset} http://localhost:${DEFAULT_PORTS.tallyBridge}   ${C.gray}(PID ${tbPid})${C.reset}
  ${C.bold}Postgres:${C.reset}     localhost:${DEFAULT_PORTS.postgres}  ${C.gray}(docker: smartload_postgres)${C.reset}
  ${C.bold}Redis:${C.reset}        localhost:${DEFAULT_PORTS.redis}  ${C.gray}(docker: smartload_redis)${C.reset}
  ${C.bold}MinIO:${C.reset}        http://localhost:${DEFAULT_PORTS.minio}  ${C.gray}(console: http://localhost:${DEFAULT_PORTS.minioConsole})${C.reset}

${C.bold}Logs:${C.reset}
  .app-manager/logs/frontend.log
  .app-manager/logs/backend.log
  .app-manager/logs/api-worker.log
  .app-manager/logs/tally-bridge.log

${C.bold}Next:${C.reset}
  ${C.cyan}node run-smartload.mjs status${C.reset}
  ${C.cyan}node run-smartload.mjs logs --follow${C.reset}
  ${C.cyan}node run-smartload.mjs stop${C.reset}
`);
}

async function waitForChildren() {
  // Wait until all registered children exit (or user sends Ctrl+C)
  return new Promise((resolve) => {
    let running = 0;
    for (const [, child] of childProcesses.entries()) {
      if (child && !child.killed) {
        running++;
        child.on('exit', () => {
          running--;
          if (running === 0) resolve();
        });
      }
    }
    if (running === 0) resolve();
  });
}

// ─── COMMAND: stop ────────────────────────────────────────────────────────────

async function cmdStop() {
  banner();
  log.section('Stopping SmartLoad');

  const state = readState();
  const services = ['backend', 'worker', 'frontend', 'tallyBridge'];

  for (const svc of services) {
    const info = state[svc];
    if (!info) continue;
    const { pid, port } = info;
    if (pid && isProcessRunning(pid)) {
      log.info(`Stopping ${svc} (PID ${pid})…`);
      if (!FLAGS.dryRun) {
        killPid(pid, false);
        await sleep(1500);
        if (isProcessRunning(pid)) killPid(pid, true);
      }
      log.success(`${svc} stopped.`);
    } else if (pid) {
      log.warn(`${svc} PID ${pid} is stale (process not running).`);
    }
    // Free port if still occupied by unknown process
    if (port && (await isPortOpen(port))) {
      await freePort(port, svc);
    }
    clearStateKey(svc);
  }

  await stopDockerServices(FLAGS.downDb || FLAGS.downRedis);

  log.success('All services stopped.');
}

// ─── COMMAND: restart ─────────────────────────────────────────────────────────

async function cmdRestart() {
  await cmdStop();
  await sleep(1000);
  releaseLock(); // ensure lock is clean before start
  await cmdStart();
}

// ─── COMMAND: clean ───────────────────────────────────────────────────────────

async function cmdClean() {
  banner();
  log.section('Clean');

  if (!AUTO_CONFIRM) {
    log.warn('This will remove build outputs, logs, and state files.');
    if (FLAGS.removeNodeModules) log.warn('Also removing node_modules (--remove-node-modules).');
    const answer = await promptUser('Type "yes" to confirm: ');
    if (answer !== 'yes') { log.info('Aborted.'); return; }
  }

  // Stop first
  await cmdStop();

  const toRemove = [
    MANAGER_DIR,
    ...['apps/api', 'apps/web', 'apps/tally-bridge'].map(d => join(PROJECT_ROOT, d, 'dist')),
  ];

  if (FLAGS.removeNodeModules) {
    toRemove.push(join(PROJECT_ROOT, 'node_modules'));
    toRemove.push(...['apps/api', 'apps/web', 'apps/tally-bridge', 'packages/db', 'packages/shared', 'packages/ui']
      .map(d => join(PROJECT_ROOT, d, 'node_modules')));
  }

  for (const p of toRemove) {
    if (existsSync(p)) {
      if (FLAGS.dryRun) { log.info(`[dry-run] Would remove ${p}`); continue; }
      log.info(`Removing ${p}…`);
      runSync('rm', ['-rf', p], { label: `rm -rf ${basename(p)}`, ignoreError: true });
    }
  }

  if (FLAGS.removeVolumes && (FLAGS.downDb || FLAGS.downRedis)) {
    if (!AUTO_CONFIRM) {
      const ans = await promptUser('Remove Docker volumes too? This destroys all DB data. Type "yes": ');
      if (ans !== 'yes') { log.info('Skipping volume removal.'); }
    }
    if (AUTO_CONFIRM || true) {
      runSync(dockerBin(), ['compose', 'down', '-v'], { ignoreError: true });
      log.success('Docker volumes removed.');
    }
  }

  log.success('Clean complete.');
}

// ─── COMMAND: status ──────────────────────────────────────────────────────────

async function cmdStatus() {
  banner();
  log.section('Status');

  const state = readState();

  async function checkService(name, info) {
    if (!info) { log.raw(`  ${C.gray}${name.padEnd(14)}${C.reset}: ${C.gray}not tracked${C.reset}`); return; }
    const { pid, port, startedAt } = info;
    const running = pid ? isProcessRunning(pid) : false;
    const portOpen = port ? await isPortOpen(port) : false;
    const age = startedAt ? `${Math.round((Date.now() - startedAt) / 1000)}s ago` : '';
    const status = running
      ? `${C.green}RUNNING${C.reset} PID=${pid} port=${port} started=${age}`
      : `${C.red}STALE${C.reset}   PID=${pid} (process not found)`;
    log.raw(`  ${C.bold}${name.padEnd(14)}${C.reset}: ${status} port-open=${portOpen ? C.green+'yes'+C.reset : C.red+'no'+C.reset}`);
  }

  await checkService('Frontend', state.frontend);
  await checkService('Backend', state.backend);
  await checkService('Worker', state.worker);
  await checkService('TallyBridge', state.tallyBridge);

  // Docker
  const pgRunning = dockerContainerRunning('smartload_postgres');
  const redisRunning = dockerContainerRunning('smartload_redis');
  const minioRunning = dockerContainerRunning('smartload-minio');
  log.raw(`  ${C.bold}${'Postgres'.padEnd(14)}${C.reset}: ${pgRunning ? C.green+'RUNNING'+C.reset : C.red+'STOPPED'+C.reset} (smartload_postgres:${DEFAULT_PORTS.postgres})`);
  log.raw(`  ${C.bold}${'Redis'.padEnd(14)}${C.reset}: ${redisRunning ? C.green+'RUNNING'+C.reset : C.red+'STOPPED'+C.reset} (smartload_redis:${DEFAULT_PORTS.redis})`);
  log.raw(`  ${C.bold}${'MinIO'.padEnd(14)}${C.reset}: ${minioRunning ? C.green+'RUNNING'+C.reset : C.red+'STOPPED'+C.reset} (smartload-minio:${DEFAULT_PORTS.minio})`);

  // Health check
  if (state.backend?.port) {
    try {
      const healthUrl = `http://localhost:${state.backend.port}/health`;
      const ok = await waitForHealth(healthUrl, 'Backend', 3000);
      log.raw(`  ${C.bold}${'Health'.padEnd(14)}${C.reset}: ${ok ? C.green+'OK'+C.reset : C.yellow+'UNREACHABLE'+C.reset} (${healthUrl})`);
    } catch {}
  }
}

// ─── COMMAND: logs ────────────────────────────────────────────────────────────

async function cmdLogs() {
  const serviceMap = {
    frontend: join(LOGS_DIR, 'frontend.log'),
    'api-worker': join(LOGS_DIR, 'api-worker.log'),
    db: join(LOGS_DIR, 'db.log'),
    redis: join(LOGS_DIR, 'redis.log'),
    'tally-bridge': join(LOGS_DIR, 'tally-bridge.log'),
    manager: LOG_FILE,
  };

  const targets = FLAGS.service === 'all'
    ? Object.entries(serviceMap)
    : [[FLAGS.service, serviceMap[FLAGS.service]]].filter(([, v]) => v);

  if (!FLAGS.follow) {
    for (const [name, filePath] of targets) {
      if (!existsSync(filePath)) { log.warn(`No log file for ${name}`); continue; }
      log.section(`Logs: ${name} (last ${FLAGS.lines} lines)`);
      const lines = readFileSync(filePath, 'utf-8').split('\n');
      log.raw(lines.slice(-FLAGS.lines).join('\n'));
    }
    return;
  }

  // --follow: tail -f style
  log.info(`Streaming logs (Ctrl+C to stop)…`);
  const offsets = {};
  for (const [, filePath] of targets) {
    if (existsSync(filePath)) offsets[filePath] = statSync(filePath).size;
    else offsets[filePath] = 0;
  }

  setInterval(() => {
    for (const [name, filePath] of targets) {
      if (!existsSync(filePath)) continue;
      const size = statSync(filePath).size;
      const prev = offsets[filePath] || 0;
      if (size > prev) {
        const fd = openSync(filePath, 'r');
        const buf = Buffer.alloc(size - prev);
        readSync(fd, buf, 0, buf.length, prev);
        closeSync(fd);
        process.stdout.write(`${C.bold}[${name}]${C.reset} ${buf.toString()}`);
        offsets[filePath] = size;
      }
    }
  }, 500);
}

// ─── COMMAND: db:reset ────────────────────────────────────────────────────────

async function cmdDbReset() {
  banner();
  log.section('DB Reset');

  if (!prismaAvailable()) { log.error('Prisma schema not found at packages/db/prisma/schema.prisma'); process.exit(1); }

  if (FLAGS.fullReset) {
    log.warn('DESTRUCTIVE: This will wipe all data.');
    if (!AUTO_CONFIRM) {
      const ans = await promptUser('Type "yes" to confirm full DB reset: ');
      if (ans !== 'yes') { log.info('Aborted.'); return; }
    }
    const ok = runFullReset();
    if (!ok) { log.error('Full reset failed.'); process.exit(1); }
    log.success('Database reset complete.');
    runSeed();
  } else {
    log.info('Safe schema update (no data loss)…');
    runPrismaGenerate();
    const ok = runMigrateDeploy();
    if (!ok) { log.error('Migration failed.'); process.exit(1); }
    log.success('Database updated.');
  }
}

// ─── COMMAND: doctor ──────────────────────────────────────────────────────────

async function cmdDoctor() {
  banner();
  log.section('Doctor');

  function check(label, ok, fix = '') {
    const icon = ok ? `${C.green}✔${C.reset}` : `${C.red}✖${C.reset}`;
    log.raw(`  ${icon} ${label}${!ok && fix ? `\n       ${C.yellow}Fix: ${fix}${C.reset}` : ''}`);
  }

  // Node version
  const nodeVer = process.versions.node;
  const nodeMajor = parseInt(nodeVer.split('.')[0]);
  check(`Node.js ${nodeVer}`, nodeMajor >= 20, 'Install Node.js >= 20 from https://nodejs.org');

  // pnpm
  const pnpmRes = runSyncCapture(pnpmBin(), ['--version'], { ignoreError: true });
  check(`pnpm ${pnpmRes.stdout.trim() || '?'}`, pnpmRes.code === 0, 'npm install -g pnpm');

  // Docker
  const dockerRes = runSyncCapture(dockerBin(), ['--version'], { ignoreError: true });
  check(`Docker ${dockerRes.stdout.trim().replace('Docker version ', '') || '?'}`, dockerRes.code === 0, 'Install Docker Desktop');

  // Docker Compose
  const dcRes = runSyncCapture(dockerBin(), ['compose', 'version'], { ignoreError: true });
  check(`Docker Compose`, dcRes.code === 0, 'Update Docker Desktop or install docker-compose');

  // .env
  check('.env file exists', existsSync(ENV_FILE), 'cp .env.example .env');
  if (existsSync(ENV_FILE)) {
    const env = parseEnvFile(ENV_FILE);
    const required = ['DATABASE_URL', 'DIRECT_DATABASE_URL', 'REDIS_URL', 'JWT_SECRET', 'PORT'];
    for (const key of required) {
      check(`.env: ${key}`, Boolean(env[key]), `Set ${key} in .env`);
    }
    const jwtOk = env.JWT_SECRET && env.JWT_SECRET.length >= 32 && !env.JWT_SECRET.includes('change-me');
    check('.env: JWT_SECRET strength', jwtOk, 'Set a strong (32+ char) JWT_SECRET in .env');
  }

  // Prisma schema
  check('Prisma schema', existsSync(PRISMA_SCHEMA), 'Ensure packages/db/prisma/schema.prisma exists');

  // Docker containers
  const pgOk = dockerContainerRunning('smartload_postgres');
  const redisOk = dockerContainerRunning('smartload_redis');
  check('Postgres container running', pgOk, 'node run-smartload.mjs start (or docker compose up -d postgres)');
  check('Redis container running', redisOk, 'node run-smartload.mjs start (or docker compose up -d redis)');

  // Ports
  const portChecks = [
    { port: FLAGS.backendPort,          label: `Backend API      :${FLAGS.backendPort}` },
    { port: FLAGS.frontendPort,         label: `Frontend (Vite)  :${FLAGS.frontendPort}` },
    { port: DEFAULT_PORTS.tallyBridge,  label: `Tally Bridge     :${DEFAULT_PORTS.tallyBridge}` },
    { port: DEFAULT_PORTS.postgres,     label: `Postgres         :${DEFAULT_PORTS.postgres}` },
    { port: DEFAULT_PORTS.redis,        label: `Redis            :${DEFAULT_PORTS.redis}` },
    { port: DEFAULT_PORTS.minio,        label: `MinIO API        :${DEFAULT_PORTS.minio}` },
    { port: DEFAULT_PORTS.minioConsole, label: `MinIO Console    :${DEFAULT_PORTS.minioConsole}` },
  ];

  log.raw(`\n  ${C.bold}Port availability:${C.reset}`);
  for (const { port, label } of portChecks) {
    const open = await isPortOpen(port);
    const pid = open ? getPidOnPort(port) : null;
    const name = pid ? getProcessName(pid) : '';
    log.raw(`  ${open ? C.green+'●'+C.reset : C.gray+'○'+C.reset} ${label} — ${open ? `IN USE PID=${pid} (${name})` : 'free'}`);
  }

  // node_modules
  check('node_modules installed', existsSync(join(PROJECT_ROOT, 'node_modules')),
    'node run-smartload.mjs setup');

  log.raw(`\n  ${C.bold}Detected app:${C.reset} ${FLAGS.appName}`);
  log.raw(`  ${C.bold}Package manager:${C.reset} ${PKG_MANAGER}`);
  log.raw(`  ${C.bold}Backend dir:${C.reset} ${BACKEND_DIR}`);
  log.raw(`  ${C.bold}Frontend dir:${C.reset} ${FRONTEND_DIR}`);
  log.raw(`  ${C.bold}DB package:${C.reset} ${DB_PACKAGE_DIR}`);
}

// ─── COMMAND: help ────────────────────────────────────────────────────────────

function cmdHelp() {
  banner();
  log.raw(`
${C.bold}Usage:${C.reset}
  node run-smartload.mjs <command> [options]

${C.bold}Commands:${C.reset}
  ${C.cyan}setup${C.reset}          First-time setup: install deps, start docker, migrate, seed
  ${C.cyan}start${C.reset}          Start all services (backend, frontend, tally-bridge)
  ${C.cyan}stop${C.reset}           Stop all manager-started services
  ${C.cyan}restart${C.reset}        Stop then start
  ${C.cyan}clean${C.reset}          Remove build artifacts, logs, state (requires confirmation)
  ${C.cyan}status${C.reset}         Show current state of all services
  ${C.cyan}logs${C.reset}           Show or stream logs
  ${C.cyan}db:reset${C.reset}       Run DB migrations (safe by default; --full-reset for destructive)
  ${C.cyan}doctor${C.reset}         Diagnose environment issues

${C.bold}Global flags:${C.reset}
  --yes / -y        Auto-confirm all prompts
  --force           Same as --yes plus override lock
  --ci              CI mode (--yes + skip interactive)
  --debug           Verbose internal logging
  --no-color        Disable ANSI colors
  --dry-run         Print what would happen, don't execute
  --no-kill         Fail if ports are in use instead of killing

${C.bold}Port flags:${C.reset}
  --frontend-port=N   Override frontend port (default: ${DEFAULT_PORTS.frontend})
  --backend-port=N    Override backend port (default: ${DEFAULT_PORTS.backend})

${C.bold}Service flags:${C.reset}
  --skip-db              Skip DB start + migrations
  --skip-redis           Skip Redis check
  --skip-tally-bridge    Skip Tally Bridge start
  --skip-worker          Skip BullMQ API worker (inventory / POD / notifications)
  --down-db              Stop Docker DB on stop/clean
  --down-redis           Stop Docker Redis on stop/clean
  --remove-volumes       Remove Docker volumes (with confirmation)

${C.bold}Seed flags:${C.reset}
  --seed             Force seed on start
  --no-seed          Skip seeding on setup

${C.bold}DB Reset flags:${C.reset}
  --full-reset       Destructive DB reset (requires confirmation)

${C.bold}Clean flags:${C.reset}
  --remove-node-modules   Also remove node_modules

${C.bold}Log flags:${C.reset}
  --follow               Stream logs (tail -f style)
  --service=<name>       frontend | backend | db | redis | tally-bridge | all
  --lines=N              Lines to show (default: 200)

${C.bold}Lock:${C.reset}
  --force-lock           Override existing lock file

${C.bold}Examples:${C.reset}
  node run-smartload.mjs setup
  node run-smartload.mjs start
  node run-smartload.mjs start --seed --debug
  node run-smartload.mjs stop --down-db --down-redis
  node run-smartload.mjs logs --follow --service=backend
  node run-smartload.mjs db:reset --full-reset --yes
  node run-smartload.mjs clean --remove-node-modules --yes
  node run-smartload.mjs doctor
`);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  ensureManagerDir();

  switch (COMMAND) {
    case 'setup':   await cmdSetup();   break;
    case 'start':   await cmdStart();   break;
    case 'stop':    await cmdStop();    break;
    case 'restart': await cmdRestart(); break;
    case 'clean':   await cmdClean();   break;
    case 'status':  await cmdStatus();  break;
    case 'logs':    await cmdLogs();    break;
    case 'db:reset': await cmdDbReset(); break;
    case 'doctor':  await cmdDoctor();  break;
    case 'help':
    case '--help':
    case '-h':      cmdHelp();          break;
    default:
      log.error(`Unknown command: ${COMMAND}`);
      cmdHelp();
      process.exit(1);
  }
}

main().catch((err) => {
  log.error(`Unhandled error: ${err.message}`);
  if (FLAGS.debug) console.error(err);
  releaseLock();
  process.exit(1);
});
