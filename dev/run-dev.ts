import { spawn, spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export type DevCommand = {
  readonly name: string;
  readonly command: string;
  readonly args: readonly string[];
  readonly cwd: string;
};

/** The child surface the runner reads: its exit state, its kills, and its events. */
export interface SpawnedChild {
  readonly exitCode: number | null;
  readonly signalCode: NodeJS.Signals | null;
  kill(signal: NodeJS.Signals): boolean;
  once(
    event: 'exit',
    listener: (code: number | null, signal: NodeJS.Signals | null) => void,
  ): unknown;
  once(event: 'error', listener: (error: Error) => void): unknown;
}

export type SpawnChild = (command: DevCommand) => SpawnedChild;

export const ROOT = resolve(import.meta.dirname, '..');

/** The dummy server port. The build origin must name the same port. */
export const DEV_PORT_ENV = 'DETOUR_PORT';
export const DEFAULT_DEV_PORT = '8787';

export function devPort(env: NodeJS.ProcessEnv = process.env): string {
  const configured = env[DEV_PORT_ENV]?.trim();

  if (configured === undefined || configured === '') {
    return DEFAULT_DEV_PORT;
  }

  const port = Number.parseInt(configured, 10);

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`${DEV_PORT_ENV}: "${configured}" is not a port`);
  }

  return String(port);
}

export const BUILD_COMMAND: DevCommand = {
  name: 'list',
  command: 'pnpm',
  args: ['list:build:dev'],
  cwd: ROOT,
};

/**
 * The dummy server answers the backend contract and the fixture pages on one
 * origin, so the local stack needs two processes and no Cloudflare account.
 */
export function commandsFor(port: string = devPort()): DevCommand[] {
  return [
    {
      name: 'server',
      command: 'pnpm',
      args: ['exec', 'tsx', 'dev/dummy-server.ts', '--port', port],
      cwd: ROOT,
    },
    {
      name: 'extension',
      command: 'pnpm',
      args: ['--filter', '@detour/extension', 'watch:dev'],
      cwd: ROOT,
    },
  ];
}

function spawnChild(command: DevCommand): SpawnedChild {
  return spawn(command.command, [...command.args], {
    cwd: command.cwd,
    stdio: 'inherit',
  });
}

/**
 * Starts the two processes and stops the whole stack when one of them fails.
 * A spawn that never produced a process raises `error`; without a listener that
 * event would crash the runner with a stack trace, so it is read as a child
 * that stopped and the stack stops the same way.
 */
export function runStack(spawnOne: SpawnChild, port: string = devPort()): (code: number) => void {
  const children = commandsFor(port).map((command) => ({
    command,
    child: spawnOne(command),
  }));

  let stopping = false;

  const stop = (code: number): void => {
    if (stopping) {
      return;
    }

    stopping = true;
    process.exitCode = code;

    for (const { child } of children) {
      if (child.exitCode === null && child.signalCode === null) {
        child.kill('SIGTERM');
      }
    }
  };

  for (const { command, child } of children) {
    child.once('error', (error) => {
      process.stderr.write(`${command.name} did not start: ${error.message}\n`);
      stop(1);
    });

    child.once('exit', (code) => {
      if (stopping) {
        return;
      }

      process.stderr.write(`${command.name} stopped, so the local stack stops\n`);
      // A child that a signal killed reports no code, and that crash is a failure.
      stop(code ?? 1);
    });
  }

  return stop;
}

export function main(): void {
  let port: string;

  try {
    port = devPort();
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  }

  const built = spawnSync(BUILD_COMMAND.command, [...BUILD_COMMAND.args], {
    cwd: BUILD_COMMAND.cwd,
    stdio: 'inherit',
  });

  if (built.status !== 0) {
    process.stderr.write('the local list did not build\n');
    process.exit(1);
  }

  const stop = runStack(spawnChild, port);

  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.once(signal, () => stop(0));
  }
}

const invoked = process.argv[1];

if (invoked !== undefined && resolve(invoked) === fileURLToPath(import.meta.url)) {
  main();
}
