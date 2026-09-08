import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

for (const name of ['ci', 'deploy']) {
  test(`${name} verification uses no secrets and pins actions`, () => {
    const source = readFileSync(new URL(`../.github/workflows/${name}.yml`, import.meta.url), 'utf8');
    const verification = source.split('  verify:')[1].split(/\n  [\w-]+:/)[0];
    assert.doesNotMatch(verification, /secrets\./);
    for (const [, action] of source.matchAll(/uses:\s*(\S+)/g)) {
      assert.match(action, /^[\w-]+\/[\w-]+@[a-f0-9]{40}$/);
    }
  });
}
