// call-context.js — sales / customer-call awareness for cue.
//
// Two layers:
//   1. moment — what the last prospect turn is (pricing, objection, discovery…)
//   2. stage — whether we still need setup, or already have enough to create
//      interest. A call that already named tools + a manual/painful process
//      should not keep asking disconnected discovery questions.
//
// main.js uses the resolved intent for the playbook block and retrieval hints.
//
// Pure functions, no Electron.

const CATEGORY_PATTERNS = {
  pricing: [
    /\b(price|pricing|cost|costs|how much|per employee|per user|pepm|per month|annual|contract|quote|proposal|discount|budget|implementation fee|invoice|fees?)\b/i,
    /\bwhat (does|would) (it|this|miter) (cost|run)\b/i,
  ],
  competitor: [
    // Payroll / HCM vendors a construction buyer would weigh against Miter. ERPs and
    // field tools (Sage, Acumatica, Procore, HCSS…) are integration partners, not
    // competitors — they belong to discovery below.
    /\b(adp|paychex|gusto|rippling|paycom|paylocity|workday|bamboo ?hr|justworks|trinet|foundation software|arcoro|points north|lcptracker|ebacon|quickbooks payroll|intuit payroll)\b/i,
    /\b(compared to|versus|vs\.?|other (vendors|options|solutions|tools)|also (looking at|evaluating|talking to)|competitor|front.?runner|shortlist|why (you|miter) (over|instead))\b/i,
  ],
  objection: [
    /\b(concern|worried|worry|hesitant|hesitation|risk|risky|not sure|too (expensive|small|new|early)|deal.?breaker|blocker|push.?back|skeptical|doubt)\b/i,
    /\bwhat if (it|you|miter|something) (doesn'?t|don'?t|fails?|breaks?|goes wrong)\b/i,
    /\b(we'?ve been burned|last (vendor|time|switch)|switching (is|was) (painful|hard))\b/i,
    /\bwhy (should|would) we\b/i,
    // Status-quo / no-need — the most common cold-call brush-off, and the one
    // the Objection Handling doc is written for.
    /\b(not looking|not interested|we'?re good|we are good|all set|we'?re all set|don'?t need|no need|not in the market)\b/i,
    /\b(happy with (what we have|our (current )?(setup|system|process|payroll|vendor|provider))|another vendor|in-?house)\b/i,
  ],
  implementation: [
    /\b(implement|implementation|onboard|onboarding|kick.?off|go.?live|launch|timeline|how long (does|will) (it|this|setup) take|migrate|migration|data (import|transfer|load)|parallel (run|payroll)|cut.?over|rocketlane|training)\b/i,
    /\bwho (do we|will we) work with (after|once)\b/i,
  ],
  reference: [
    /\b(reference|references|talk to (a|an|another|one of your) (customer|client)|case stud(y|ies)|who else (uses|is using)|similar (companies|contractors|customers)|customers like us)\b/i,
  ],
  discovery: [
    /\b(we (currently|today) (use|run|do|have)|we use|right now we|our (current|existing) (system|process|setup|payroll|erp|software)|we'?re on|we (process|run) payroll)\b/i,
    /\b(tell (you|us) (a little )?about (our|us|the company)|we have (about|around|roughly)? ?\d+ (employees|people|guys|field|crew))\b/i,
    /\b(prevailing wage|certified payroll|union|unions|fringe|fringes|davis.?bacon|multi.?state|job cost|cost codes?)\b/i,
    /\b(sage|intacct|acumatica|quickbooks|netsuite|procore|hcss|heavy ?job|viewpoint|vista|foundation|raken|busybusy|exaktime|erp)\b/i,
  ],
  product: [
    /\b(can (it|miter|you) (do|handle|support|integrate|sync|track|export)|does (it|miter) (do|have|handle|support|integrate|sync|track|export)|is there (a|an|any) (way|feature|report|integration)|how (does|do) (it|miter|you) (handle|do|work|sync|track))\b/i,
    /\b(feature|integration|integrate|report|reporting|mobile app|time ?clock|geofenc|gps|expense|per diem|benefits|401k|pto|scheduling|dashboard|api)\b/i,
  ],
};

// Checked in this order — the first category whose pattern matches wins, so
// the more decisive moments (money, a named competitor, a worry) beat the
// broad ones (a feature question) when a turn contains both.
const PRIORITY = ['pricing', 'competitor', 'objection', 'reference', 'implementation', 'discovery', 'product'];
const HARD_MOMENTS = new Set(['pricing', 'competitor', 'objection', 'reference', 'implementation']);

function prospectTurns(transcript) {
  const them = (transcript || []).filter((t) => t.channel === 'them');
  if (them.length) return them;
  const all = transcript || [];
  // One You-channel blob is the whole call. Otherwise skip the opener.
  if (all.length <= 1) return all;
  return all.slice(1);
}

function recentProspectText(transcript) {
  const turns = prospectTurns(transcript);
  if (!turns.length) return '';
  return turns.slice(-5).map((t) => t.text).join(' ');
}

function lastProspectText(transcript) {
  const turns = prospectTurns(transcript);
  return ((turns[turns.length - 1] || {}).text || '').trim();
}

function detectCallCategory(transcript) {
  if (!transcript || !transcript.length) return 'general';
  const last = lastProspectText(transcript);
  const recent = recentProspectText(transcript);
  if (!last && !recent.trim()) return 'general';
  // Hard moments win on the latest turn so an earlier brush-off does not
  // keep the call stuck after they have moved on.
  if (last) {
    for (const category of PRIORITY) {
      if (!HARD_MOMENTS.has(category)) continue;
      if (CATEGORY_PATTERNS[category].some((re) => re.test(last))) return category;
    }
  }
  const window = recent.trim() || last;
  for (const category of PRIORITY) {
    if (CATEGORY_PATTERNS[category].some((re) => re.test(window))) return category;
  }
  return 'general';
}

// What we already know from prospect-sounding lines (not the rep's pitch).
const SLOT_PATTERNS = {
  timeTracking: /\b(hh2|hcss|heavy ?job|raken|busybusy|exaktime|timesheets?|time tracking|field time)\b/i,
  payroll: /\b(in-?house|adp|paychex|gusto|paycom|paylocity)\b/i,
  erp: /\b(sage|intacct|acumatica|quickbooks|netsuite|viewpoint|vista|procore)\b/i,
  headcount: /\b\d{2,5}\s*(employees?|people|crew|guys|field)\b/i,
  certified: /\b(certified payroll|prevailing wage|cpr)\b/i,
  manualPain: /\b(by hand|manual(ly)?|spreadsheet|excel|we write|hand[- ]?generat|hand[- ]?written)\b/i,
};

const ANSWERISH = /\b(we (use|do|run|have|generate|write|create)|i('m| am) not|in-?house|by hand|timesheets? are|\d+\s*(employees?|field|crew))\b/i;
const HEARD_ME = /\b(did you hear|you hear me|i (just |already )?said|like i said|i told you)\b/i;

function answerishText(text) {
  const kept = String(text || '').split(/(?<=[.!?])\s+|\n/).filter((s) => ANSWERISH.test(s));
  return kept.join(' ').trim();
}

function filledSlots(text) {
  const out = {};
  for (const [key, re] of Object.entries(SLOT_PATTERNS)) out[key] = re.test(text);
  return out;
}

function detectCallStage(transcript) {
  const last = lastProspectText(transcript);
  if (HEARD_ME.test(last)) return 'advance';
  const raw = prospectTurns(transcript).map((t) => t.text).join(' ');
  const text = answerishText(raw) || raw;
  const slots = filledSlots(text);
  const n = Object.values(slots).filter(Boolean).length;
  if (slots.manualPain && (slots.certified || slots.timeTracking || slots.payroll)) return 'advance';
  if (n >= 3) return 'advance';
  return 'discover';
}

function detectCallIntent(transcript) {
  const moment = detectCallCategory(transcript);
  if (HARD_MOMENTS.has(moment) && detectCallStage(transcript) !== 'advance') return moment;
  if (detectCallStage(transcript) === 'advance' && (moment === 'discovery' || moment === 'general' || moment === 'product' || moment === 'objection')) {
    return 'interest';
  }
  return moment;
}

// Per-category playbook guidance (for the system prompt) and retrieval hints
// (appended to the knowledge-base query). Hints are phrased to match the
// titles of the Slite docs in knowledge-base/slite/.
const PLAYBOOK = {
  discovery: {
    label: 'Discovery',
    guidance:
      'The prospect is describing how they work today. Do not repeat it back. Ask one question they have not already answered. ' +
      'They have never heard of Miter. Stay curious; do not go into implementation weeds.',
    hints: 'discovery questions must-haves payroll WFM HR benefits dimensions syncs launch-related questions',
  },
  interest: {
    label: 'Interest',
    guidance:
      'You already have enough of how they work, or they just named a painful or manual process. Do not ask another discovery question and do not start a new survey topic (no prevailing wage, fringes, headcount, or ERP just to fill a list). ' +
      'Do not recap the stack. React to the last thing they said in a few words — especially anything they do by hand — then one sentence that creates interest or a next step. ' +
      'If they repeated themselves or asked if you heard them, acknowledge that point and move forward.',
    hints: '',
  },
  objection: {
    label: 'Objection',
    guidance:
      'The prospect raised a concern or a status-quo brush-off (payroll in-house, happy with what they have, not looking for another vendor). ' +
      'Acknowledge it plainly in one sentence, then use the matching talk track from the Objection Handling excerpts — do not invent a new angle. ' +
      'Never argue and never over-promise. If the honest answer is a workaround, a later follow-up, or a genuine bad fit, say so.',
    hints: 'objection handling we do payroll in-house we\'re happy with what we have not looking for another vendor',
  },
  pricing: {
    label: 'Pricing',
    guidance:
      'Pricing came up. Anchor on value and what is included before numbers. Point to the investment summary, proposal template and order form as the artifacts that carry the actual figures, and note the implementation fee is invoiced separately via Stripe. ' +
      'Do not invent prices, discounts or terms that are not in the retrieved material.',
    hints: 'assets investment summary proposal template order form service level agreement implementation fee',
  },
  competitor: {
    label: 'Competitor',
    guidance:
      'A competitor or alternative is in play. Do not bash them and do not start a feature war. Use the competitor-discovery approach: ask what made them start looking, what matters most in a solution, what has stood out in each option, and what their process is for narrowing down. ' +
      'Where Miter is genuinely stronger for a construction payroll + workforce buyer (certified payroll, union fringes, job costing, ERP sync), say it once, concretely.',
    hints: 'competitor discovery questions to ask find the gap understand their criteria',
  },
  reference: {
    label: 'Reference',
    guidance:
      'They want to hear from a customer. Follow the reference process: match on public/prevailing-wage work, union, multi-state, ERP and payroll system; check the reference activity report so no one is over-used; confirm in #gtm with the Launch Manager before naming anyone. ' +
      'Offer to set up the call rather than promising a specific company on the spot.',
    hints: 'customer references reference customer report reference activity report enrolling a customer reference',
  },
  implementation: {
    label: 'Implementation',
    guidance:
      'The conversation is about getting live. Describe the kickoff process concretely: Launch assigns a Launch Manager and Launch Ops within two business days of close; a 45-minute kickoff is scheduled roughly 10 weeks before launch for under 100 employees and 12–14 weeks for larger teams; the kickoff survey and employee directory come first; Rocketlane tracks the project. ' +
      'Set expectations about data collection, parallel payroll and what the customer owns.',
    hints: 'kickoff process series of events launch manager rocketlane kickoff deck kickoff survey',
  },
  product: {
    label: 'Product',
    guidance:
      'A capability or how-does-it-work question. Answer simply, as if they have never seen Miter. Skip setup and admin detail unless they asked how something works. If the guides do not cover it, say what you know and offer to confirm rather than guessing.',
    hints: '',
  },
  general: {
    label: 'General',
    guidance:
      'Keep the conversation moving. Prefer a clarifying question or a concrete next step over a monologue. ' +
      'Assume they do not know Miter. Do not pitch architecture or product internals.',
    hints: '',
  },
};

function playbookFor(category) {
  return PLAYBOOK[category] || PLAYBOOK.general;
}

// The block main.js prepends to the system prompt.
function buildCallContext(settings, mode, transcript) {
  const category = detectCallIntent(transcript || []);
  const pb = playbookFor(category);
  const lines = [
    '=== Call playbook: ' + pb.label + ' ===',
    pb.guidance,
  ];
  const notes = typeof settings.callNotes === 'string' ? settings.callNotes.trim() : '';
  if (notes) lines.push('', '=== Notes for this call ===', notes.slice(0, 2000));
  return lines.join('\n');
}

// Extra terms appended to the knowledge-base query for a category.
function retrievalHints(category) {
  return playbookFor(category).hints || '';
}

module.exports = {
  detectCallCategory,
  detectCallStage,
  detectCallIntent,
  buildCallContext,
  retrievalHints,
  CATEGORY_PATTERNS,
  PLAYBOOK,
};
