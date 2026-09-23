// transcript-file.js — parse a saved transcript into { channel, text } turns.
//
// Accepts plain text or JSON. Plain text: one speaker per line, prefixed with
// a label and a colon (Them:, You:, Prospect:, Customer:, Rep:, Me:, T:, Y:).
// Lines without a label continue the previous turn. Blank lines and lines
// starting with # are ignored. JSON: an array of { channel|speaker, text }.
const THEM = new Set(['them', 'they', 'prospect', 'customer', 'client', 'buyer', 'interviewer', 't']);
const YOU = new Set(['you', 'me', 'rep', 'ae', 'seller', 'miter', 'y']);

function channelFor(label) {
  const l = String(label || '').trim().toLowerCase();
  if (THEM.has(l)) return 'them';
  if (YOU.has(l)) return 'you';
  return null;
}

function parseTranscriptFile(raw) {
  const text = String(raw || '').replace(/^﻿/, '');
  const trimmed = text.trim();
  if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
    let data;
    try { data = JSON.parse(trimmed); } catch { data = null; }
    if (data) {
      const arr = Array.isArray(data) ? data : (Array.isArray(data.turns) ? data.turns : []);
      return arr
        .map((t) => ({ channel: channelFor(t.channel || t.speaker || t.role), text: String(t.text || '').trim() }))
        .filter((t) => t.channel && t.text);
    }
  }
  const turns = [];
  for (const line of text.split(/\r?\n/)) {
    const s = line.trim();
    if (!s || s.startsWith('#')) continue;
    const m = /^\**([A-Za-z]+)\**\s*[:>\-–—]\s*(.*)$/.exec(s);
    const ch = m ? channelFor(m[1]) : null;
    if (ch) { turns.push({ channel: ch, text: m[2].trim() }); continue; }
    if (turns.length) turns[turns.length - 1].text += (turns[turns.length - 1].text ? ' ' : '') + s;
  }
  return turns.filter((t) => t.text);
}

module.exports = { parseTranscriptFile, channelFor };
