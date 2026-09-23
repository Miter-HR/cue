const test = require('node:test');
const assert = require('node:assert/strict');
const { detectCallCategory, detectCallIntent, detectCallStage } = require('../src/call-context');

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

test('early "we use X" is still discovery', () => {
  const turns = [
    { channel: 'you', text: 'We work with contractors whose field time, payroll, and accounting need to line up. How are crews submitting time?' },
    { channel: 'them', text: 'We use HH2.' },
  ];
  assert.equal(detectCallIntent(turns), 'discovery');
  assert.equal(detectCallStage(turns), 'discover');
});

test('fresh in-house brush-off stays an objection', () => {
  const turns = [{ channel: 'them', text: 'Listen, I\'m not really interested. We do our payroll in-house.' }];
  assert.equal(detectCallIntent(turns), 'objection');
});

test('enough setup plus work-by-hand is interest, not another discovery question', () => {
  const turns = [
    { channel: 'you', text: 'How are your crew submitting time from the field?' },
    { channel: 'them', text: 'We use HH2.' },
    { channel: 'them', text: 'Listen, I\'m not really interested. We do our payroll in-house.' },
    { channel: 'them', text: 'We use Sage 300 CRE.' },
    { channel: 'them', text: 'Timesheets are important to us. We just generate them by hand.' },
    { channel: 'them', text: 'We write the certified payroll reports by hand. Did you hear me?' },
  ];
  assert.equal(detectCallStage(turns), 'advance');
  assert.equal(detectCallIntent(turns), 'interest');
});
