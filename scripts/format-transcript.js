#!/usr/bin/env node
// Convert a call export (Outreach/Gong "m:ss | Speaker" format) or any
// transcript src/transcript-file.js understands into cue's You:/Them: format.
//
//   node scripts/format-transcript.js test_transcripts/transcript_0.txt            # writes transcript_0.formatted.txt beside it
//   node scripts/format-transcript.js in.txt out.txt
const fs = require('fs');
const path = require('path');
const { parseTranscriptFile } = require('../src/transcript-file');

const [, , inFile, outArg] = process.argv;
if (!inFile) { console.error('usage: format-transcript.js <export.txt> [out.txt]'); process.exit(1); }
const turns = parseTranscriptFile(fs.readFileSync(inFile, 'utf8'));
if (!turns.length) { console.error('no speaker turns found in ' + inFile); process.exit(1); }
const out = outArg || inFile.replace(/(\.[^.]+)?$/, '.formatted.txt');
const header = '# Formatted from ' + path.basename(inFile) + ' — Them = prospect, You = Miter rep\n';
fs.writeFileSync(out, header + turns.map((t) => (t.channel === 'you' ? 'You: ' : 'Them: ') + t.text).join('\n') + '\n');
console.log('wrote ' + turns.length + ' turns to ' + out);
