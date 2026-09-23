const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { KnowledgeBase, isImplementationWeed } = require('../src/knowledge-base');

const sageHit = {
  doc: {
    source: 'miter-guides',
    file: 'integrations/accounting/sage-300/connecting-miter-+-sage-300-cre.md',
    title: 'Connecting Miter + Sage 300 CRE',
  },
  chunk: {
    heading: 'Migrating from hh2',
    text: 'Already connected through hh2? That connection keeps working. New connections should use Miter Connect.',
  },
};

test('Sage hh2 / Miter Connect pages are implementation weeds', () => {
  assert.equal(isImplementationWeed(sageHit), true);
});

test('Slite discovery questions are not weeds', () => {
  assert.equal(isImplementationWeed({
    doc: { source: 'slite', file: 'slite/discovery-questions/discovery-questions.md', title: 'Discovery Questions' },
    chunk: { heading: 'WFM', text: 'How are employees creating timesheets today?' },
  }), false);
});

test('Assist retrieve keeps playbooks and demotes connection-setup Guides', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cue-kb-'));
  fs.mkdirSync(path.join(dir, 'slite'));
  fs.mkdirSync(path.join(dir, 'miter-guides', 'integrations', 'accounting', 'sage-300'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'slite', 'discovery-questions.md'), [
    '---',
    'title: "Discovery Questions"',
    'source: slite',
    '---',
    '# Discovery Questions',
    '',
    '## WFM',
    '',
    'How are employees creating timesheets today? Is that integrated with payroll?',
    'We work with contractors who submit time from the field.',
  ].join('\n'));
  fs.writeFileSync(path.join(dir, 'miter-guides', 'integrations', 'accounting', 'sage-300', 'connecting-miter-+-sage-300-cre.md'), [
    '---',
    'title: "Connecting Miter + Sage 300 CRE"',
    'source: miter-guides',
    '---',
    '# Connecting Miter + Sage 300 CRE',
    '',
    '## Migrating from hh2',
    '',
    'Already connected through hh2? That connection keeps working. New connections should use Miter Connect.',
  ].join('\n'));

  const kb = new KnowledgeBase().init(dir);
  const query = 'Want to hear your crew submitting Time from the field. We use HH2.';
  const spoken = kb.retrieve(query, { mode: 'assist', minScore: 0 });
  assert.ok(spoken.sources.every((s) => s.source !== 'miter-guides'), 'Assist should not cite setup Guides');
  assert.match(spoken.block, /Background from Miter Guides/i);
  assert.match(spoken.block, /not to say/i);
  assert.doesNotMatch(spoken.block, /\[1\].*Miter Connect/i);

  const asked = kb.retrieve(query, { mode: 'ask', minScore: 0 });
  assert.ok(asked.sources.some((s) => s.source === 'miter-guides'), 'Ask still surfaces the full Guide');
});
