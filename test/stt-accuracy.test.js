const test = require('node:test');
const assert = require('node:assert');
const { looksLikeHallucination, buildVocabPrompt } = require('../src/stt');
const { DeepgramStreamingSTT, OpenAIRealtimeSTT, applyTranscriptDelta } = require('../src/stt-streaming');

test('looksLikeHallucination drops Whisper silence artifacts', () => {
  ['', '   ', 'Thank you for watching.', 'thanks for watching', 'Bye-bye!', '👍👍'].forEach((s) => {
    assert.equal(looksLikeHallucination(s), true, JSON.stringify(s));
  });
});

test('looksLikeHallucination keeps real speech', () => {
  ['Tell me about your experience with Kubernetes.', 'You know, I led the migration.'].forEach((s) => {
    assert.equal(looksLikeHallucination(s), false, JSON.stringify(s));
  });
});

test('buildVocabPrompt seeds base vocab and resume proper nouns, capped', () => {
  const p = buildVocabPrompt({ resumeText: 'Optum EKS Terraform', jobDescription: 'AWS SRE' });
  assert.ok(p.includes('Kubernetes'));
  assert.ok(p.includes('Optum'));
  assert.ok(p.length <= 850);
  assert.ok(buildVocabPrompt(undefined).length > 0);
  assert.ok(buildVocabPrompt({ resumeText: 'Xyzzy '.repeat(4000) }).length <= 850);
});

test('Deepgram accumulates is_final segments into one turn at speech_final', () => {
  const finals = [];
  const d = new DeepgramStreamingSTT('k', { onTranscript: (t) => finals.push(t) });
  d._handleMessage({ type: 'Results', is_final: true, channel: { alternatives: [{ transcript: 'Tell me about' }] } });
  d._handleMessage({ type: 'Results', is_final: true, channel: { alternatives: [{ transcript: 'your experience' }] } });
  d._handleMessage({ type: 'Results', is_final: true, speech_final: true, channel: { alternatives: [{ transcript: 'with Kubernetes.' }] } });
  assert.deepEqual(finals, ['Tell me about your experience with Kubernetes.']);
});

test('Deepgram flushes pending segments on UtteranceEnd when speech_final never arrives', () => {
  const finals = [];
  const d = new DeepgramStreamingSTT('k', { onTranscript: (t) => finals.push(t) });
  d._handleMessage({ type: 'Results', is_final: true, channel: { alternatives: [{ transcript: 'hello there' }] } });
  d._handleMessage({ type: 'UtteranceEnd' });
  assert.deepEqual(finals, ['hello there']);
  d._handleMessage({ type: 'UtteranceEnd' });
  assert.deepEqual(finals, ['hello there'], 'no duplicate emit on a second UtteranceEnd');
});

test('Deepgram drops hallucinated finals', () => {
  const finals = [];
  const d = new DeepgramStreamingSTT('k', { onTranscript: (t) => finals.push(t) });
  d._handleMessage({ type: 'Results', is_final: true, speech_final: true, channel: { alternatives: [{ transcript: 'Thank you.' }] } });
  assert.deepEqual(finals, []);
});

test('applyTranscriptDelta concatenates incremental tokens and prefers snapshots', () => {
  assert.equal(applyTranscriptDelta('', 'Tell'), 'Tell');
  assert.equal(applyTranscriptDelta('Tell', ' me'), 'Tell me');
  assert.equal(applyTranscriptDelta('Hello', 'Hello there'), 'Hello there');
  assert.equal(applyTranscriptDelta('Hello there', 'Hello'), 'Hello there');
});

test('OpenAI realtime accumulates incremental deltas into one interim, then one final', () => {
  const interims = [];
  const finals = [];
  const s = new OpenAIRealtimeSTT('k', {
    onInterim: (t) => interims.push(t),
    onTranscript: (t) => finals.push(t)
  });
  s._handleEvent({ type: 'conversation.item.input_audio_transcription.delta', item_id: 'i1', delta: 'Tell' });
  s._handleEvent({ type: 'conversation.item.input_audio_transcription.delta', item_id: 'i1', delta: ' me' });
  s._handleEvent({ type: 'conversation.item.input_audio_transcription.delta', item_id: 'i1', delta: ' about' });
  s._handleEvent({
    type: 'conversation.item.input_audio_transcription.completed',
    item_id: 'i1',
    transcript: 'Tell me about Kubernetes.'
  });
  assert.deepEqual(interims, ['Tell', 'Tell me', 'Tell me about', '']);
  assert.deepEqual(finals, ['Tell me about Kubernetes.']);
});

test('OpenAI realtime completed falls back to accumulated deltas when transcript is missing', () => {
  const finals = [];
  const s = new OpenAIRealtimeSTT('k', { onTranscript: (t) => finals.push(t) });
  s._handleEvent({ type: 'conversation.item.input_audio_transcription.delta', item_id: 'i1', delta: 'hello there' });
  s._handleEvent({ type: 'conversation.item.input_audio_transcription.completed', item_id: 'i1' });
  assert.deepEqual(finals, ['hello there']);
});

test('OpenAI commit sends input_audio_buffer.commit only after uncommitted audio', () => {
  const sent = [];
  const s = new OpenAIRealtimeSTT('k');
  s.connected = true;
  s._sessionReady = true;
  s.ws = { readyState: 1, send: (raw) => sent.push(JSON.parse(raw)) };
  s.commit();
  assert.deepEqual(sent, []);
  s._uncommitted = true;
  s.commit();
  assert.deepEqual(sent, [{ type: 'input_audio_buffer.commit' }]);
  s.commit();
  assert.equal(sent.length, 1);
});
