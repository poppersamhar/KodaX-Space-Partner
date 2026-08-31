import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createFeishuCliRunner, FeishuCliError } from './feishu-cli-runner.js';

test('subprocess runner preserves argument boundaries and stdin without inheriting credential or runtime overrides', async () => {
  const run = createFeishuCliRunner({
    executable: process.execPath,
    env: {
      ...process.env,
      LARKSUITE_CLI_APP_SECRET: 'SECRET',
      LARKSUITE_CLI_CONFIG_DIR: '/wrong',
      LARK_CHANNEL: '1',
      OPENCLAW_CLI: '1',
      HERMES_QUIET: '1',
      NODE_OPTIONS: '--invalid',
      NODE_PATH: '/wrong',
      ELECTRON_RUN_AS_NODE: '1',
      ANTHROPIC_API_KEY: 'SECRET',
      USERPROFILE: 'C:\\Users\\Test',
    },
  });
  const result = await run({
    args: [
      '-e',
      'let input="";process.stdin.on("data",s=>input+=s);process.stdin.on("end",()=>process.stdout.write(JSON.stringify({arg:process.argv[1],input,keys:Object.keys(process.env)})));',
      'x;$(touch /not-executed)',
    ],
    stdin: 'plain body',
  });
  const value = JSON.parse(result.stdout) as { arg: string; input: string; keys: string[] };
  assert.equal(result.exitCode, 0);
  assert.equal(value.arg, 'x;$(touch /not-executed)');
  assert.equal(value.input, 'plain body');
  assert.ok(value.keys.includes('PATH'));
  assert.ok(value.keys.includes('USERPROFILE'));
  assert.ok(
    !value.keys.some((key) =>
      /LARK|OPENCLAW|HERMES|NODE_OPTIONS|NODE_PATH|ELECTRON|API_KEY/u.test(key),
    ),
  );
});

test('subprocess timeout stops dispatch and returns only a safe indeterminate-result error', async () => {
  const run = createFeishuCliRunner({ executable: process.execPath, timeoutMs: 25 });
  await assert.rejects(
    run({ args: ['-e', 'process.stderr.write("SECRET");setTimeout(()=>process.exit(0),250);'] }),
    (error: unknown) => {
      assert.ok(error instanceof FeishuCliError);
      assert.equal(error.code, 'timeout');
      assert.equal(error.dispatched, true);
      assert.doesNotMatch(String(error), /SECRET/);
      return true;
    },
  );
});

test('subprocess output is bounded across stdout and stderr and preserves split UTF-8', async () => {
  const limited = createFeishuCliRunner({ executable: process.execPath, maxOutputBytes: 64 });
  await assert.rejects(
    limited({
      args: [
        '-e',
        'process.stdout.write("x".repeat(40));process.stderr.write("SECRET".repeat(10));',
      ],
    }),
    (error: unknown) =>
      error instanceof FeishuCliError && error.code === 'output_limit' && error.dispatched,
  );
  const run = createFeishuCliRunner({ executable: process.execPath });
  const result = await run({
    args: [
      '-e',
      'const b=Buffer.from("中文");process.stdout.write(b.subarray(0,1));setTimeout(()=>process.stdout.end(b.subarray(1)),20);',
    ],
  });
  assert.equal(result.stdout, '中文');
});

test('runner refuses invalid process limits and arguments before spawning, and reports a missing CLI safely', async () => {
  const run = createFeishuCliRunner({ executable: process.execPath });
  for (const request of [
    { args: ['bad\0argument'] },
    { args: [], timeoutMs: 0 },
    { args: [], timeoutMs: Number.NaN },
    { args: [], stdin: 'x'.repeat(1024 * 1024 + 1) },
  ]) {
    await assert.rejects(
      run(request),
      (error: unknown) =>
        error instanceof FeishuCliError && error.code === 'invalid_input' && !error.dispatched,
    );
  }
  const missing = createFeishuCliRunner({ executable: '/not-present-kodax-feishu-cli' });
  await assert.rejects(
    missing({ args: ['--version'] }),
    (error: unknown) =>
      error instanceof FeishuCliError && error.code === 'cli_missing' && !error.dispatched,
  );
});
