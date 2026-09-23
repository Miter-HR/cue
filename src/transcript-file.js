// transcript-file.js — parse a saved transcript into { channel, text } turns.
//
// Three shapes are accepted:
//  1. Call exports (Outreach / Gong): a header, a "Participants" section that
//     lists people under their company (Miter's people are "you", everyone
//     else "them"), then "Transcript" with blocks of "m:ss | Speaker" lines
//     followed by the words.
//  2. Plain text: one speaker per line, prefixed with a label and a colon
//     (Them:, You:, Prospect:, Customer:, Rep:, Me:, T:, Y:). Lines without a
//     label continue the previous turn. Blank lines and # lines are ignored.
//  3. JSON: an array of { channel|speaker|role, text }.
const THEM = new Set(['them', 'they', 'prospect', 'customer', 'client', 'buyer', 'interviewer', 't']);
const YOU = new Set(['you', 'me', 'rep', 'ae', 'sdr', 'seller', 'miter', 'y']);

function channelFor(label) {
  const l = String(label || '').trim().toLowerCase();
  if (THEM.has(l)) return 'them';
  if (YOU.has(l)) return 'you';
  return null;
}

const TIMESTAMP_LINE = /^\d{1,2}:\d{2}(?::\d{2})?\s*\|\s*(.+?)\s*$/;

function parseCallExport(text) {
  const lines = text.split(/\r?\n/);
  const tIdx = lines.findIndex((l) => TIMESTAMP_LINE.test(l.trim()));
  if (tIdx === -1) return null;
  // Speakers listed under a "Miter" heading in the participants block are the rep.
  const ours = new Set();
  let underMiter = false;
  for (const raw of lines.slice(0, tIdx)) {
    const l = raw.trim();
    if (!l) { underMiter = false; continue; }
    if (/^miter$/i.test(l)) { underMiter = true; continue; }
    if (/^(participants|transcript|other)$/i.test(l)) { underMiter = false; continue; }
    if (underMiter) {
      const name = l.split(',')[0].trim();
      if (name) { ours.add(name.toLowerCase()); ours.add(name.split(/\s+/)[0].toLowerCase()); }
    }
  }
  const turns = [];
  let current = null;
  for (const raw of lines.slice(tIdx)) {
    const l = raw.trim();
    const m = TIMESTAMP_LINE.exec(l);
    if (m) {
      const speaker = m[1].trim();
      const key = speaker.toLowerCase();
      const isOurs = ours.has(key) || ours.has(key.split(/\s+/)[0]) || /\bmiter\b/i.test(speaker);
      current = { channel: isOurs ? 'you' : 'them', text: '' };
      turns.push(current);
      continue;
    }
    if (!l || !current) continue;
    current.text += (current.text ? ' ' : '') + l;
  }
  return turns.filter((t) => t.text);
}

function parseTranscriptFile(raw) {
  const text = String(raw || '').replace(/^﻿/, '');
  const trimmed = text.trim();
  const exported = parseCallExport(text);
  if (exported && exported.length) return exported;
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

module.exports = { parseTranscriptFile, parseCallExport, channelFor };
