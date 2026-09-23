const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { KnowledgeBase } = require('../src/knowledge-base');

function writeDoc(dir, rel, { title, source, body }) {
  const full = path.join(dir, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, `---\ntitle: "${title}"\nsource: ${source}\n---\n\n# ${title}\n\n${body}\n`);
}

function loadCorpus() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cue-kb-'));
  writeDoc(dir, 'slite/kickoff.md', {
    title: 'Kickoff Process',
    source: 'slite',
    body: 'Launch assigns a Launch Manager within two business days. Kickoff is scheduled 10 weeks before go-live for teams under 100 employees.'
  });
  writeDoc(dir, 'miter-guides/timesheets.md', {
    title: 'Timesheets',
    source: 'miter-guides',
    body: 'Crews submit timesheets from the mobile app. Approvers review hours on the Timesheets page before payroll.'
  });
  writeDoc(dir, 'miter-guides/kickoff-help.md', {
    title: 'Customer kickoff help',
    source: 'miter-guides',
    body: 'This public guide also mentions kickoff, Launch Manager, and the 10 week timeline, but it is fallback material only.'
  });
  const kb = new KnowledgeBase().init(dir);
  return { kb, dir };
}

test('retrieve uses Slite hits alone when they can ground the answer', () => {
  const { kb, dir } = loadCorpus();
  const { sources, block } = kb.retrieve('When is kickoff scheduled and who is the Launch Manager?');
  assert.ok(sources.length >= 1);
  assert.deepEqual([...new Set(sources.map((s) => s.source))], ['slite']);
  assert.match(block, /internal docs \(Slite\)/);
  assert.doesNotMatch(block, /Miter Guides/);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('retrieve falls back to Miter Guides when Slite has no grounded hit', () => {
  const { kb, dir } = loadCorpus();
  const { sources, block } = kb.retrieve('How do crews submit timesheets on mobile for approval?');
  assert.ok(sources.length >= 1);
  assert.deepEqual([...new Set(sources.map((s) => s.source))], ['miter-guides']);
  assert.match(block, /public Miter Guides/);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('retrieve ignores a weak Slite lexical hit and falls back to Guides', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cue-kb-'));
  writeDoc(dir, 'slite/discovery.md', {
    title: 'Discovery Questions',
    source: 'slite',
    body: 'How do you process payroll each week? Ask about their current payroll provider and how long payroll takes.'
  });
  writeDoc(dir, 'miter-guides/timesheets.md', {
    title: 'Viewing timesheets',
    source: 'miter-guides',
    body: 'Crews submit timesheets from the mobile app. Approvers review hours on the Timesheets page before payroll.'
  });
  const kb = new KnowledgeBase().init(dir);
  const { sources } = kb.retrieve('How do crews submit timesheets on mobile for approval?');
  assert.ok(sources.length >= 1);
  assert.deepEqual([...new Set(sources.map((s) => s.source))], ['miter-guides']);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('search can restrict to one source without mixing corpora', () => {
  const { kb, dir } = loadCorpus();
  const slite = kb.search('kickoff Launch Manager', { source: 'slite' });
  const guides = kb.search('kickoff Launch Manager', { source: 'miter-guides' });
  assert.ok(slite.every((h) => h.doc.source === 'slite'));
  assert.ok(guides.every((h) => h.doc.source === 'miter-guides'));
  fs.rmSync(dir, { recursive: true, force: true });
});
