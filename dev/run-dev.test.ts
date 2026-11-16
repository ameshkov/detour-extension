import { EventEmitter } from 'node:events';
import { resolve } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import {
  BUILD_COMMAND,
  DEFAULT_DEV_PORT,
  DEV_PORT_ENV,
  ROOT,
  commandsFor,
  devPort,
  runStack,
} from './run-dev';
import type { DevCommand } from './run-dev';

const REPOSITORY_ROOT = resolve(import.meta.dirname, '..');

class FakeChild extends EventEmitter {
  exitCode: number | null = null;
  signalCode: NodeJS.Signals | null = null;
  readonly signals: NodeJS.Signals[] = [];

  kill(signal: NodeJS.Signals): boolean {
    this.signals.push(signal);

    return true;
  }
}

function commandNamed(name: string): DevCommand {
  const command = commandsFor().find((candidate) => candidate.name === name);

  if (command === undefined) {
    throw new Error(`no ${name} command`);
  }

  return command;
}

describe('the local development run', () => {
  it('builds the local list before it starts', () => {
    expect(BUILD_COMMAND.command).toBe('pnpm');
    expect([...BUILD_COMMAND.args]).toEqual(['list:build:dev']);
    expect(BUILD_COMMAND.cwd).toBe(REPOSITORY_ROOT);
    expect(ROOT).toBe(REPOSITORY_ROOT);
  });

  it('starts the dummy server and the extension watch', () => {
    const commands = commandsFor();

    expect(commands).toHaveLength(2);
    expect(commandNamed('server').args).toEqual([
      'exec',
      'tsx',
      'dev/dummy-server.ts',
      '--port',
      DEFAULT_DEV_PORT,
    ]);
    expect(commandNamed('extension').args).toEqual(['--filter', '@detour/extension', 'watch:dev']);

    for (const command of commands) {
      expect(command.command).toBe('pnpm');
      expect(command.cwd).toBe(REPOSITORY_ROOT);
    }
  });

  it('reads the port from the environment', () => {
    expect(devPort({})).toBe(DEFAULT_DEV_PORT);
    expect(devPort({ [DEV_PORT_ENV]: '9000' })).toBe('9000');
    expect(() => devPort({ [DEV_PORT_ENV]: 'not a port' })).toThrow(/is not a port/);
    expect(() => devPort({ [DEV_PORT_ENV]: '0' })).toThrow(/is not a port/);
  });

  it('treats a child killed by a signal as a failure', () => {
    const children: FakeChild[] = [];
    const write = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const previousExitCode = process.exitCode;

    try {
      runStack(() => {
        const child = new FakeChild();

        children.push(child);

        return child;
      });

      const server = children[0];

      if (server === undefined) {
        throw new Error('the server child did not start');
      }

      server.signalCode = 'SIGKILL';
      server.emit('exit', null, 'SIGKILL');

      expect(process.exitCode).toBe(1);
      expect(write.mock.calls.map(([chunk]) => String(chunk)).join('')).toContain('server stopped');
    } finally {
      write.mockRestore();
      process.exitCode = previousExitCode;
    }
  });

  it('keeps a clean child stop clean', () => {
    const children: FakeChild[] = [];
    const write = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const previousExitCode = process.exitCode;

    try {
      runStack(() => {
        const child = new FakeChild();

        children.push(child);

        return child;
      });

      const server = children[0];

      if (server === undefined) {
        throw new Error('the server child did not start');
      }

      server.exitCode = 0;
      server.emit('exit', 0, null);

      expect(process.exitCode).toBe(0);
    } finally {
      write.mockRestore();
      process.exitCode = previousExitCode;
    }
  });

  it('stops the stack and names the command when a child cannot start', () => {
    const children: FakeChild[] = [];
    const spawned: DevCommand[] = [];
    const write = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const previousExitCode = process.exitCode;

    try {
      runStack((command) => {
        const child = new FakeChild();

        children.push(child);
        spawned.push(command);

        return child;
      });
      children[0]?.emit('error', new Error('spawn pnpm ENOENT'));

      expect(spawned.map((command) => command.name)).toEqual(['server', 'extension']);
      expect(write.mock.calls.map(([chunk]) => String(chunk)).join('')).toContain('server');
      expect(process.exitCode).toBe(1);
      expect(children[1]?.signals).toEqual(['SIGTERM']);
    } finally {
      write.mockRestore();
      process.exitCode = previousExitCode;
    }
  });
});
