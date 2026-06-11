#!/usr/bin/env node
'use strict';

/**
 * Cybernate AI smoke test — exercises every SDK capability end-to-end.
 *
 * Usage:
 *   CYBERNATE_API_KEY=cyb_xxx CYBERNATE_API_URL=http://localhost:3000/v1 node smoke-test.js
 *
 * CYBERNATE_API_URL defaults to production. Each test prints PASS/FAIL with
 * latency; the script exits non-zero if anything failed. Tests run against
 * src/ so you're testing current code, not the last published build.
 */

const { CybernateAI } = require('./src/index.js');

const API_KEY = process.env.CYBERNATE_API_KEY;
const API_URL = process.env.CYBERNATE_API_URL || 'https://api.cybernate.ai/v1';

if (!API_KEY) {
  console.error('Set CYBERNATE_API_KEY (and optionally CYBERNATE_API_URL)');
  process.exit(1);
}

const results = [];

async function test(name, fn) {
  const start = Date.now();
  process.stdout.write(`  ${name.padEnd(38)}`);
  try {
    const detail = await fn();
    const ms = Date.now() - start;
    console.log(`PASS  ${String(ms).padStart(6)}ms  ${detail || ''}`);
    results.push({ name, ok: true, ms });
  } catch (err) {
    const ms = Date.now() - start;
    console.log(`FAIL  ${String(ms).padStart(6)}ms  ${err.message}`);
    results.push({ name, ok: false, ms, error: err.message });
  }
}

const truncate = (s, n = 60) => {
  const t = String(s || '').replace(/\s+/g, ' ').trim();
  return t.length > n ? `${t.slice(0, n)}…` : t;
};

async function main() {
  console.log(`\nCybernate AI smoke test → ${API_URL}\n`);

  const cybernate = new CybernateAI(API_KEY, {
    baseUrl: API_URL,
    enableWebSocket: false,
    timeout: 60000,
  });

  await test('connect / auth validate', async () => {
    const r = await cybernate.connect();
    return `user=${r.user?.email || r.user?._id || 'ok'}`;
  });

  await test('health', async () => {
    const r = await cybernate._request('GET', '/ai/health');
    if (!r.online) throw new Error('AI service offline');
    return `engines=[${(r.details?.loaded_engines || []).join(', ')}]`;
  });

  await test('listModels', async () => {
    const r = await cybernate.listModels();
    return `local=${r.local?.length ?? 0} remote=${r.remote?.length ?? 0}`;
  });

  await test('chat', async () => {
    const r = await cybernate.chat(
      [{ role: 'user', content: 'Reply with exactly: OK' }],
      { maxTokens: 20, temperature: 0 }
    );
    if (!r.result) throw new Error('empty result');
    return `"${truncate(r.result, 30)}" tokens=${r.usage?.totalTokens}`;
  });

  await test('messages.create (Anthropic-style)', async () => {
    const m = await cybernate.messages.create({
      max_tokens: 30,
      system: 'You are a terse assistant.',
      messages: [{ role: 'user', content: 'Name one African capital city.' }],
    });
    const text = m.content?.[0]?.text;
    if (!text) throw new Error('empty content');
    return `"${truncate(text, 30)}" in/out=${m.usage.input_tokens}/${m.usage.output_tokens}`;
  });

  await test('chatStream (SSE)', async () => {
    let chunks = 0;
    const full = await cybernate.chatStream(
      [{ role: 'user', content: 'Count from 1 to 5, digits only.' }],
      { maxTokens: 40, temperature: 0 },
      () => { chunks += 1; }
    );
    if (!full) throw new Error('empty stream');
    return `chunks=${chunks} text="${truncate(full, 25)}"`;
  });

  await test('structured (JSON extraction)', async () => {
    const r = await cybernate.structured(
      'Transfer of ₦5,000,000 at 2:45 AM to a beneficiary added 5 minutes ago.',
      {
        type: 'object',
        properties: {
          fraud_risk: { type: 'number', description: 'risk 0-1' },
          recommended_action: { type: 'string', enum: ['approve', 'challenge', 'block'] },
        },
      }
    );
    if (typeof r.result !== 'object' || r.result === null) throw new Error('result is not an object');
    return `risk=${r.result.fraud_risk} action=${r.result.recommended_action}`;
  });

  await test('moderate — clean text', async () => {
    const r = await cybernate.moderate({
      text: 'Just finished a great football match with friends in Surulere!',
      context: 'public posts on a social feed',
    });
    return `flagged=${r.flagged} action=${r.action} severity=${r.severity}`;
  });

  await test('moderate — scam text (should flag)', async () => {
    const r = await cybernate.moderate({
      text: 'DM me now!!! double your crypto in 24hrs, send BTC, 100% guaranteed profit, sugar daddy available',
      context: 'public posts on a social feed',
    });
    if (!r.flagged) throw new Error('scam text was not flagged');
    return `action=${r.action} severity=${r.severity} reason="${truncate(r.text?.reason, 35)}"`;
  });

  await test('analyzeNews (Sety extraction)', async () => {
    const r = await cybernate.analyzeNews({
      title: 'Gunmen attack travellers along Abuja-Kaduna expressway',
      text:
        'Armed men attacked a convoy of travellers near Katari on the Abuja-Kaduna ' +
        'expressway on Tuesday evening. Witnesses said at least two people were killed ' +
        'and several others kidnapped. Security forces have been deployed to the area.',
      publishedAt: new Date().toISOString(),
    });
    const a = r.analysis;
    if (!a || a.is_security_relevant !== true) throw new Error('not marked security relevant');
    if (!a.locations?.length) throw new Error('no locations extracted');
    return `type=${a.incident_type} sev=${a.severity} loc="${truncate(a.locations[0]?.name, 30)}"`;
  });

  await test('embed', async () => {
    const r = await cybernate.embed(['danger zone in Lagos', 'safe area in Accra']);
    if (!r.embeddings?.length || !r.embeddings[0]?.length) throw new Error('no vectors returned');
    return `vectors=${r.embeddings.length} dim=${r.embeddings[0].length}`;
  });

  await test('detectObjects (vision)', async () => {
    const r = await cybernate.detectObjects({
      imageUrl: 'https://ultralytics.com/images/bus.jpg',
      confidence: 0.4,
    });
    return `detections=${r.detections?.length ?? 0} [${truncate((r.detections || []).map(d => d.label).join(', '), 35)}]`;
  });

  // ── Summary ─────────────────────────────────────────────────────────
  const passed = results.filter(r => r.ok).length;
  const failed = results.length - passed;
  console.log(`\n${passed}/${results.length} passed${failed ? ` — ${failed} FAILED` : ''}\n`);
  if (failed) {
    for (const r of results.filter(x => !x.ok)) console.log(`  ✗ ${r.name}: ${r.error}`);
    console.log('');
    process.exit(1);
  }
}

main().catch(err => {
  console.error(`\nFatal: ${err.message}\n`);
  process.exit(1);
});
