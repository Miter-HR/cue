const test = require('node:test');
const assert = require('node:assert/strict');
const { detectCallCategory } = require('../src/call-context');

test('we use HH2 is discovery, not a product/integration moment', () => {
  const transcript = [{ channel: 'them', text: 'We use HH2.' }];
  assert.equal(detectCallCategory(transcript), 'discovery');
});

test('classifies status-quo field-time tools dumped on the You channel', () => {
  const transcript = [{
    channel: 'you',
    text: 'Want to hear your crew submitting Time from the field. We use HH2.',
  }];
  assert.equal(detectCallCategory(transcript), 'discovery');
});
