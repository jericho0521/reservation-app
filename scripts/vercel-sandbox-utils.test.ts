import assert from 'node:assert/strict';
import test from 'node:test';
import type { Sandbox } from '@vercel/sandbox';
import { runChecked, stopSandbox } from './vercel-sandbox-utils';

test('command failures never include secret arguments or command output', async () => {
  const sandbox = { runCommand: async () => ({ exitCode: 1, stdout: async () => 'secret-output', stderr: async () => 'secret-error' }) } as unknown as Sandbox;
  await assert.rejects(runChecked(sandbox, 'sh', ['secret-argument']), error => {
    assert.doesNotMatch(String(error), /secret-argument|secret-output|secret-error/);
    return true;
  });
  const throwing = { runCommand: async () => { throw new Error('secret-argument'); } } as unknown as Sandbox;
  await assert.rejects(runChecked(throwing, 'sh', []), error => !String(error).includes('secret-argument'));
});
test('cleanup deletes the sandbox instead of retaining a stopped filesystem', async () => {
  let deleted = false;
  await stopSandbox({ delete: async () => { deleted = true; } } as unknown as Sandbox);
  assert.equal(deleted, true);
});
