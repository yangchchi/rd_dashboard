#!/usr/bin/env node

const { spawn } = require('node:child_process');

const TASKS = [
  {
    name: 'typecheck:server',
    command: 'npm',
    args: ['run', 'type:check:server'],
  },
  {
    name: 'eslint:server-shared',
    command: 'npx',
    args: ['eslint', '--quiet', 'server', 'shared'],
  },
  {
    name: 'test:p0',
    command: 'npx',
    args: [
      'jest',
      'server/modules/auth/auth.utils.spec.ts',
      'server/modules/auth/auth-guards.spec.ts',
      'server/modules/capabilities/capabilities.service.spec.ts',
      'server/modules/rd/rd-requirement-flow.spec.ts',
      'server/modules/rd/rd-spec-validation.spec.ts',
      'server/modules/rd/rd-agent-executor.spec.ts',
      'server/modules/rd/rd-pipeline-task-flow.spec.ts',
      'server/modules/rd/rd-pipeline-runs.spec.ts',
      'server/modules/rd/rd-agent-delivery.spec.ts',
      'server/modules/rd/rd-context-pack.spec.ts',
      'server/modules/rd/rd-workspace-manager.spec.ts',
      'server/modules/rd/rd-tool-gateway.spec.ts',
      'test/unit/agent-workspace-manager.spec.ts',
      'test/unit/agent-tool-gateway.spec.ts',
      'test/unit/web-agent-review-utils.spec.ts',
      'test/unit/web-dashboard-metrics.spec.ts',
      'test/unit/web-auth-api.spec.ts',
      'test/unit/web-auth-form.spec.ts',
      'test/unit/web-api-auth-headers.spec.ts',
      'test/unit/web-ai-skill-engine.spec.ts',
      'test/unit/model-credentials.spec.ts',
      'test/unit/web-capability-client.spec.ts',
      'test/unit/web-pipeline-page-utils.spec.ts',
      '--runInBand',
    ],
  },
];

function getBinName(name) {
  return process.platform === 'win32' ? `${name}.cmd` : name;
}

function runTask(task) {
  return new Promise((resolve) => {
    console.log(`\n[ci:check] ${task.name}`);
    console.log(`[ci:check] $ ${task.command} ${task.args.join(' ')}`);
    const child = spawn(getBinName(task.command), task.args, {
      cwd: process.cwd(),
      stdio: 'inherit',
      shell: false,
    });
    child.on('close', (code) => resolve(code || 0));
    child.on('error', () => resolve(1));
  });
}

async function main() {
  for (const task of TASKS) {
    const code = await runTask(task);
    if (code !== 0) {
      console.error(`[ci:check] ${task.name} failed with code ${code}`);
      process.exit(code);
    }
  }
  console.log('\n[ci:check] all checks passed');
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[ci:check] failed: ${message}`);
  process.exit(1);
});
