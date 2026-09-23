const test = require('node:test');
const assert = require('node:assert/strict');
const { detectCallCategory } = require('../src/call-context');

test('status-quo brush-off is an objection, not discovery or general', () => {
  const turns = [{
    channel: 'them',
    text: 'We do our payroll in house. I feel like we\'re good. We\'re not looking for another vendor.'
  }];
  assert.equal(detectCallCategory(turns), 'objection');
});

test('still classifies a status-quo brush-off when diarization dumped it on You', () => {
  const turns = [{
    channel: 'you',
    text: 'I was going to say we work with contractors. Uh we do our payroll in house. We\'re not looking for another vendor.'
  }];
  assert.equal(detectCallCategory(turns), 'objection');
});

test('happy-with-what-we-have is an objection', () => {
  assert.equal(detectCallCategory([{ channel: 'them', text: 'We\'re happy with what we have.' }]), 'objection');
});
