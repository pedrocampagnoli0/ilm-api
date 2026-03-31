#!/usr/bin/env npx tsx
/**
 * ILM API — Agent Runner
 *
 * Usage:
 *   npx tsx scripts/agents/run.ts <command> [args]
 *
 * Commands:
 *   review                    Run all reviewers (code, security, architecture)
 *   analyze <table>           Analyze a Supabase table's frontend usage
 *   build <table>             Build a NestJS module for a table
 *   audit-casl                Audit CASL rules vs RLS policies
 *   optimize                  Run performance optimization analysis
 *   migrate <table>           Full pipeline: analyze → build → review
 *   ask "<prompt>"            Ask the full team a question
 *
 * Examples:
 *   npx tsx scripts/agents/run.ts review
 *   npx tsx scripts/agents/run.ts analyze municipio
 *   npx tsx scripts/agents/run.ts build municipio
 *   npx tsx scripts/agents/run.ts migrate turma
 */

import { query } from '@anthropic-ai/claude-agent-sdk';
import { allAgents } from './definitions.js';

const API_DIR = process.cwd();
const FRONTEND_DIR = API_DIR.replace('ilm-api', 'lermais-auth');

async function run(prompt: string, agents: Record<string, typeof allAgents[keyof typeof allAgents]>, cwd: string) {
  console.log(`\n🚀 Running agent team...\n`);
  console.log(`📋 Prompt: ${prompt.slice(0, 100)}...`);
  console.log(`📂 Working dir: ${cwd}`);
  console.log(`🤖 Agents: ${Object.keys(agents).join(', ')}\n`);

  for await (const message of query({
    prompt,
    options: {
      cwd,
      allowedTools: ['Read', 'Glob', 'Grep', 'Edit', 'Write', 'Bash', 'Agent'],
      agents,
      permissionMode: 'default',
      maxTurns: 50,
    },
  })) {
    if ('result' in message) {
      console.log('\n' + '='.repeat(60));
      console.log('RESULT:');
      console.log('='.repeat(60));
      console.log(message.result);
    } else if (message.type === 'system' && message.subtype === 'init') {
      console.log(`Session: ${message.session_id}`);
    }
  }
}

// ─── CLI Commands ───────────────────────────────────────

const [, , command, ...args] = process.argv;

switch (command) {
  case 'review': {
    const reviewAgents = {
      'code-reviewer': allAgents['code-reviewer'],
      'security-reviewer': allAgents['security-reviewer'],
      'senior-nest-dev': allAgents['senior-nest-dev'],
    };
    run(
      `Review the entire NestJS API codebase in src/. Use all three agents in parallel:
       1. code-reviewer: check for bugs and convention violations
       2. security-reviewer: check for security vulnerabilities
       3. senior-nest-dev: review architecture and scalability
       Compile all findings into a single prioritized report.`,
      reviewAgents,
      API_DIR,
    );
    break;
  }

  case 'analyze': {
    const table = args[0];
    if (!table) { console.error('Usage: run.ts analyze <table>'); process.exit(1); }
    run(
      `Use the schema-analyzer agent to analyze all frontend usage of the "${table}" table.
       The frontend codebase is at: ${FRONTEND_DIR}
       Search for .from('${table}'), .rpc() calls that reference ${table}, and RLS policies in supabase/migrations/.
       Produce a complete migration report.`,
      { 'schema-analyzer': allAgents['schema-analyzer'] },
      FRONTEND_DIR,
    );
    break;
  }

  case 'build': {
    const table = args[0];
    if (!table) { console.error('Usage: run.ts build <table>'); process.exit(1); }
    run(
      `Use the module-builder agent to create a complete NestJS module for the "${table}" entity.
       Read the escola module first as a reference, then create:
       - src/${table}/${table}.module.ts
       - src/${table}/${table}.controller.ts
       - src/${table}/${table}.service.ts
       - src/${table}/dto/create-${table}.dto.ts
       - src/${table}/dto/update-${table}.dto.ts
       - src/${table}/dto/list-${table}s-query.dto.ts
       - CASL rules in src/common/casl/ability.factory.ts
       Register it in src/app.module.ts.`,
      { 'module-builder': allAgents['module-builder'] },
      API_DIR,
    );
    break;
  }

  case 'audit-casl': {
    run(
      `Use the casl-auditor agent to audit all CASL rules in src/common/casl/ability.factory.ts
       against the RLS policies in ${FRONTEND_DIR}/supabase/migrations/.
       Report any gaps, mismatches, or over-permissions.`,
      { 'casl-auditor': allAgents['casl-auditor'] },
      API_DIR,
    );
    break;
  }

  case 'optimize': {
    run(
      `Use the optimizer agent to analyze the entire src/ directory for performance issues.
       Focus on Prisma queries, N+1 problems, caching opportunities, and response sizes.`,
      { 'optimizer': allAgents['optimizer'] },
      API_DIR,
    );
    break;
  }

  case 'migrate': {
    const table = args[0];
    if (!table) { console.error('Usage: run.ts migrate <table>'); process.exit(1); }
    run(
      `Full migration pipeline for the "${table}" entity:

       Step 1: Use schema-analyzer to analyze all frontend usage of "${table}" in ${FRONTEND_DIR}
       Step 2: Use module-builder to create the NestJS module based on the analysis
       Step 3: Use code-reviewer to review the generated code
       Step 4: Use security-reviewer to check for security issues

       Execute steps sequentially. Each step informs the next.`,
      {
        'schema-analyzer': allAgents['schema-analyzer'],
        'module-builder': allAgents['module-builder'],
        'code-reviewer': allAgents['code-reviewer'],
        'security-reviewer': allAgents['security-reviewer'],
      },
      API_DIR,
    );
    break;
  }

  case 'ask': {
    const prompt = args.join(' ');
    if (!prompt) { console.error('Usage: run.ts ask "<prompt>"'); process.exit(1); }
    run(prompt, allAgents, API_DIR);
    break;
  }

  default:
    console.log(`
ILM API — Agent Team Runner

Commands:
  review                    Run code + security + architecture review
  analyze <table>           Analyze frontend usage of a table
  build <table>             Build a NestJS module for a table
  audit-casl                Audit CASL rules vs RLS policies
  optimize                  Performance optimization analysis
  migrate <table>           Full pipeline: analyze → build → review
  ask "<prompt>"            Ask the full team anything

Examples:
  npx tsx scripts/agents/run.ts review
  npx tsx scripts/agents/run.ts migrate municipio
  npx tsx scripts/agents/run.ts ask "What tables should we migrate next?"
    `);
}
