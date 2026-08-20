'use strict';

/* ═══════════════════════════════════════════════════════════════════════════
   Proxima — Salesforce Renewal Negotiation Planner

   MODEL NOTE
   Salesforce negotiation differs structurally from cloud infrastructure:
     • Price moves through RENEWAL UPLIFT, not consumption discount tiers.
     • Licenses generally cannot be reduced mid-term — renewal is the only
       true-down window, which makes shelfware the largest recoverable cost.
     • Salesforce's fiscal year ends January 31, so timing drives leverage
       more than volume does.
   The engine therefore models three outputs rather than one: an uplift cap
   target, a discount-off-list target, and a shelfware reclamation estimate.

   Ranges are directional estimates drawn from publicly reported procurement
   practice. Salesforce publishes no renewal uplift or discount data.
   ═══════════════════════════════════════════════════════════════════════════ */

// ─── State ───────────────────────────────────────────────────────────────────
const state = {};
let currentStep = 1;

// ─── Navigation ──────────────────────────────────────────────────────────────
function nextStep(from) {
  if (!validateStep(from)) return;
  collectStep(from);
  goToStep(from + 1);
}
function prevStep(from) { goToStep(from - 1); }
function goToStep(n) {
  document.querySelector('.step-panel.active')?.classList.remove('active');
  document.getElementById(`step-${n}`).classList.add('active');
  document.querySelectorAll('.step-item').forEach(el => {
    const s = +el.dataset.step;
    el.classList.toggle('active', s === n);
    el.classList.toggle('done', s < n);
  });
  currentStep = n;
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ─── Validation ───────────────────────────────────────────────────────────────
function validateStep(step) {
  const requiredSelects = {
    1: ['annual-spend', 'headcount-trajectory', 'renewal-month', 'renewal-timeline', 'notice-status'],
    2: ['license-utilization', 'contract-structure', 'adoption-health'],
    3: ['relationship-quality'],
  };
  const requiredCards = { 1: ['company-size'], 3: ['alternative'] };

  let ok = true;
  (requiredSelects[step] || []).forEach(id => {
    const el = document.getElementById(id);
    if (el && el.tagName === 'SELECT' && !el.value) {
      el.style.borderColor = 'var(--danger)';
      el.addEventListener('change', () => { el.style.borderColor = ''; }, { once: true });
      ok = false;
    }
  });
  (requiredCards[step] || []).forEach(id => {
    const group = document.getElementById(id);
    if (group && !group.querySelector('.selected')) {
      group.style.outline = '2px solid var(--danger)';
      group.style.borderRadius = '8px';
      setTimeout(() => { group.style.outline = ''; }, 2000);
      ok = false;
    }
  });

  if (!ok) {
    const msg = document.createElement('div');
    msg.className = 'alert alert-danger';
    msg.style.cssText = 'position:fixed;bottom:24px;right:24px;z-index:9999;max-width:320px;animation:fadeIn .2s ease';
    msg.innerHTML = '<span class="alert-icon">⚠️</span> Please fill in all required fields before continuing.';
    document.body.appendChild(msg);
    setTimeout(() => msg.remove(), 3000);
  }
  return ok;
}

// ─── Data Collection ──────────────────────────────────────────────────────────
function collectStep(step) {
  if (step === 1) {
    state.companySize = document.querySelector('#company-size .selected')?.dataset.value;
    state.annualSpend = document.getElementById('annual-spend').value;
    state.headcountTrajectory = document.getElementById('headcount-trajectory').value;
    state.renewalMonth = document.getElementById('renewal-month').value;
    state.renewalTimeline = document.getElementById('renewal-timeline').value;
    state.noticeStatus = document.getElementById('notice-status').value;
    state.upliftCap = document.getElementById('uplift-cap').value;
    state.lastUplift = document.getElementById('last-uplift').value;
    state.desiredTerm = document.getElementById('desired-term').value;
  }
  if (step === 2) {
    state.products = [...document.querySelectorAll('#products .selected')].map(c => c.dataset.value);
    state.licenseUtilization = document.getElementById('license-utilization').value;
    state.contractStructure = document.getElementById('contract-structure').value;
    state.supportTier = document.getElementById('support-tier').value;
    state.adoptionHealth = document.getElementById('adoption-health').value;
    state.costPressures = [...document.querySelectorAll('#cost-pressures input:checked')].map(i => i.value);
  }
  if (step === 3) {
    state.alternative = document.querySelector('#alternative .selected')?.dataset.value;
    state.alternativeVendor = document.getElementById('alternative-vendor').value;
    state.relationshipQuality = document.getElementById('relationship-quality').value;
    state.previousNegotiation = document.getElementById('previous-negotiation').value;
    state.internalChampion = document.getElementById('internal-champion').value;
    state.changeEvents = [...document.querySelectorAll('#change-events input:checked')].map(i => i.value);
  }
}

// ─── Card selection ──────────────────────────────────────────────────────────
document.querySelectorAll('.radio-cards').forEach(group => {
  group.querySelectorAll('.radio-card').forEach(card => {
    card.addEventListener('click', () => {
      group.querySelectorAll('.radio-card').forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
    });
  });
});
document.querySelectorAll('.use-case-card').forEach(card => {
  card.addEventListener('click', () => card.classList.toggle('selected'));
});

// ─── Metadata ─────────────────────────────────────────────────────────────────
const RANGES_LAST_UPDATED = 'August 14, 2026';

/* ─── Published list pricing ──────────────────────────────────────────────────
   Unlike the discount and uplift ranges elsewhere in this file, these are
   Salesforce's OWN published figures — verifiable, not estimated. They reflect
   the ~6% increase to Enterprise and Unlimited editions effective Aug 1, 2025
   (Sales Cloud, Service Cloud, Field Service, select Industry Clouds), which
   was Salesforce's first broad list increase in seven years.

   Professional was not part of that increase.

   Re-verify at https://www.salesforce.com/sales/pricing/ — the page blocks
   automated fetches, so this needs a human eye at each review.
   ──────────────────────────────────────────────────────────────────────────── */
const LIST_PRICES = {
  verifiedOn: 'August 20, 2026',
  perUserMonth: [
    { edition: 'Professional', price: 80,  confidence: 'verified' },
    { edition: 'Enterprise',   price: 175, confidence: 'verified' },
    { edition: 'Unlimited',    price: 350, confidence: 'derived'  },
  ],
  // Same per-user rate applies to both Sales Cloud and Service Cloud.
  appliesTo: 'Sales Cloud and Service Cloud, billed annually',
};

function listPriceTableHTML(discount) {
  const rows = LIST_PRICES.perUserMonth.map(e => {
    const hi = Math.round(e.price * (1 - discount.lo / 100));
    const lo = Math.round(e.price * (1 - discount.hi / 100));
    return `<tr style="border-bottom:1px solid var(--surface-3);">
      <td style="padding:7px 0;color:var(--text-primary);">${e.edition}${e.confidence === 'derived' ? ' <span style="color:var(--text-muted);font-size:.75rem;">(derived)</span>' : ''}</td>
      <td style="padding:7px 0;text-align:right;color:var(--text-secondary);font-variant-numeric:tabular-nums;">$${e.price}</td>
      <td style="padding:7px 0;text-align:right;font-weight:700;color:var(--success);font-variant-numeric:tabular-nums;">$${lo}–$${hi}</td>
    </tr>`;
  }).join('');

  return `<div style="margin-top:18px;">
    <table style="width:100%;border-collapse:collapse;font-size:.82rem;">
      <thead><tr style="border-bottom:1px solid var(--border);">
        <th style="text-align:left;padding:6px 0;color:var(--text-secondary);font-weight:600;">Edition (per user / month)</th>
        <th style="text-align:right;padding:6px 0;color:var(--text-secondary);font-weight:600;">List</th>
        <th style="text-align:right;padding:6px 0;color:var(--text-secondary);font-weight:600;">Target at ${discount.lo}–${discount.hi}% off</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <p style="margin-top:10px;font-size:.76rem;color:var(--text-muted);line-height:1.6;">
      ${LIST_PRICES.appliesTo}. List pricing verified ${LIST_PRICES.verifiedOn} and reflects the ~6% Enterprise and Unlimited increase effective August 1, 2025. Unlimited is derived from that increase rather than separately confirmed. <strong>List price is Salesforce's published figure; the target column applies this plan's estimated discount range to it and is not a benchmark.</strong>
    </p>
  </div>`;
}

// ─── Reference tables ─────────────────────────────────────────────────────────
const ACV_TIERS = {
  'under100k':  { label: 'Under $100K', mid: 75000,    tier: 0 },
  '100k-250k':  { label: '$100K–$250K', mid: 175000,   tier: 1 },
  '250k-500k':  { label: '$250K–$500K', mid: 375000,   tier: 2 },
  '500k-1m':    { label: '$500K–$1M',   mid: 750000,   tier: 3 },
  '1m-2500k':   { label: '$1M–$2.5M',   mid: 1750000,  tier: 4 },
  '2500k-5m':   { label: '$2.5M–$5M',   mid: 3750000,  tier: 5 },
  '5m-10m':     { label: '$5M–$10M',    mid: 7500000,  tier: 6 },
  '10mplus':    { label: '$10M+',       mid: 15000000, tier: 7 },
};

const PRODUCT_LABELS = {
  sales: 'Sales Cloud', service: 'Service Cloud', marketing: 'Marketing Cloud',
  commerce: 'Commerce Cloud', experience: 'Experience Cloud', fieldservice: 'Field Service',
  cpq: 'CPQ / Revenue Cloud', slack: 'Slack', tableau: 'Tableau',
  mulesoft: 'MuleSoft', datacloud: 'Data Cloud', agentforce: 'Agentforce / Einstein',
};

const VENDOR_LABELS = {
  dynamics: 'Microsoft Dynamics 365', hubspot: 'HubSpot', servicenow: 'ServiceNow',
  sap: 'SAP', oracle: 'Oracle', zoho: 'Zoho', custom: 'a custom-built platform',
  none: 'no credible alternative',
};

// Salesforce fiscal year ends Jan 31. Q4 = Nov/Dec/Jan.
const FISCAL_QUARTER = {
  1: 'Q4', 2: 'Q1', 3: 'Q1', 4: 'Q1', 5: 'Q2', 6: 'Q2',
  7: 'Q2', 8: 'Q3', 9: 'Q3', 10: 'Q3', 11: 'Q4', 12: 'Q4',
};

function fiscalContext(month) {
  const m = parseInt(month, 10);
  const q = FISCAL_QUARTER[m];
  if (!q) return null;
  const isQuarterEnd = [1, 4, 7, 10].includes(m);
  if (q === 'Q4') {
    return {
      quarter: 'Q4', strength: 'peak', bonus: 12,
      note: m === 1
        ? 'Your renewal lands in January — the final month of Salesforce\'s fiscal year. This is the single highest-leverage window in their calendar. Quota pressure is at its maximum and discounting authority is at its most flexible.'
        : 'Your renewal lands in Salesforce\'s fiscal Q4 (November–January). This is their strongest quota pressure period and the best window for concessions.',
    };
  }
  if (isQuarterEnd) {
    return {
      quarter: q, strength: 'good', bonus: 6,
      note: `Your renewal lands at the close of Salesforce's fiscal ${q}. Quarter-end carries real quota pressure — meaningful, though well short of the Q4 window.`,
    };
  }
  return {
    quarter: q, strength: 'weak', bonus: 0,
    note: `Your renewal falls mid-quarter in Salesforce's fiscal ${q}, away from any quota deadline. Timing gives you little natural leverage here — consider whether a short extension could move the decision into a quarter-end or into Q4.`,
  };
}

// ─── Deal calibration hook (shared across Proxima planners) ──────────────────
// Deal Calibration stores Salesforce ACV tiers with an `sf-` prefix so they do
// not collide with the cloud spend tiers. Planner keys map onto them directly.
const SF_TO_CAL_TIER = {
  'under100k': 'sf-under100k', '100k-250k': 'sf-100k-250k', '250k-500k': 'sf-250k-500k',
  '500k-1m': 'sf-500k-1m', '1m-2500k': 'sf-1m-2500k', '2500k-5m': 'sf-2500k-5m',
  '5m-10m': 'sf-5m-10m', '10mplus': 'sf-10mplus',
};

function getProximaInsight(calTier) {
  try {
    const deals = JSON.parse(localStorage.getItem('proxima-deals') || '[]');
    const sf = deals.filter(d => d.provider === 'salesforce');
    if (!sf.length) return null;
    // Prefer same-tier deals once there are enough to mean anything, otherwise
    // fall back to the whole Salesforce pool and say so in the output.
    const tierDeals = calTier ? sf.filter(d => d.tier === calTier) : [];
    const relevant = tierDeals.length >= 2 ? tierDeals : sf;
    const discounts = relevant.map(d => d.discount).sort((a, b) => a - b);
    const avg = Math.round(discounts.reduce((s, v) => s + v, 0) / discounts.length * 10) / 10;
    return {
      count: relevant.length, avg, lo: discounts[0], hi: discounts[discounts.length - 1],
      tierMatch: tierDeals.length >= 2,
    };
  } catch { return null; }
}

// ─── Leverage scoring ─────────────────────────────────────────────────────────
function getLeverageScore(s) {
  let score = 0;

  // Competitive alternative — the dominant factor in SaaS renewals
  const altMap = { dual: 22, evaluating: 17, theoretical: 7, none: 0 };
  score += altMap[s.alternative] ?? 0;

  // Fiscal timing
  const fc = fiscalContext(s.renewalMonth);
  score += fc ? fc.bonus : 0;

  // Runway to negotiate
  const runwayMap = { '12plusmo': 14, '6-12mo': 14, '3-6mo': 9, '1-3mo': 4, 'within-1mo': 0 };
  score += runwayMap[s.renewalTimeline] ?? 0;

  // Notice window posture
  const noticeMap = { served: 10, open: 8, none: 6, imminent: 2, unknown: 0, passed: -6 };
  score += noticeMap[s.noticeStatus] ?? 0;

  // Shelfware is leverage: it is budget you can credibly walk back
  const utilMap = { under60: 12, '60-75': 9, '75-90': 4, over90: 0, unknown: 2 };
  score += utilMap[s.licenseUtilization] ?? 0;

  // Deal size — larger accounts get more attention and more discretion
  const tier = ACV_TIERS[s.annualSpend]?.tier ?? 0;
  score += Math.min(tier * 2, 12);

  // Growth story Salesforce wants to underwrite
  const growthMap = { aggressive: 9, strong: 7, modest: 4, flat: 2, shrinking: 0 };
  score += growthMap[s.headcountTrajectory] ?? 0;

  // Relationship
  const relMap = { strategic: 7, strong: 6, moderate: 4, poor: 2, none: 0 };
  score += relMap[s.relationshipQuality] ?? 0;

  // Negotiating maturity
  const expMap = { experienced: 6, moderate: 4, basic: 2, none: 0 };
  score += expMap[s.previousNegotiation] ?? 0;

  // Change events. Capped in aggregate — several carrots at once does not
  // multiply leverage the way naive stacking would suggest, and without a
  // cap the score saturates at 100 for most reasonably strong positions.
  let eventScore = 0;
  if (s.changeEvents?.includes('expansion')) eventScore += 5;
  if (s.changeEvents?.includes('consolidation')) eventScore += 4;
  if (s.changeEvents?.includes('mna')) eventScore += 3;
  if (s.changeEvents?.includes('migration')) eventScore += 6;
  score += Math.min(eventScore, 8);
  if (s.changeEvents?.includes('divestiture')) score -= 3;

  // Dependency reduces leverage
  if (s.adoptionHealth === 'critical') score -= 6;
  if (s.adoptionHealth === 'poor') score += 4;

  // Clear ownership helps
  if (['procurement', 'cfo', 'cio'].includes(s.internalChampion)) score += 3;
  if (s.internalChampion === 'none') score -= 3;

  return Math.max(0, Math.min(Math.round(score), 100));
}

function getLeverageLabel(score) {
  if (score >= 75) return { label: 'Very Strong', color: '#166534' };
  if (score >= 60) return { label: 'Strong', color: '#15803D' };
  if (score >= 42) return { label: 'Moderate', color: '#B45309' };
  if (score >= 25) return { label: 'Limited', color: '#9A3412' };
  return { label: 'Weak', color: '#6B7280' };
}

// ─── Uplift model ─────────────────────────────────────────────────────────────
// What Salesforce will likely ask for, and what you should target capping it at.
function getUpliftOutlook(s, leverage) {
  // Typical opening renewal ask reported across enterprise SaaS practice
  let askLo = 7, askHi = 10;
  if (s.upliftCap === 'capped-low') { askLo = 0; askHi = 3; }
  else if (s.upliftCap === 'capped-mid') { askLo = 4; askHi = 7; }
  else if (s.upliftCap === 'capped-high') { askLo = 7; askHi = 9; }
  if (s.lastUplift === 'over20') askHi += 5;
  if (s.adoptionHealth === 'critical') askHi += 2;
  if (s.alternative === 'none') askHi += 2;

  // Achievable cap given leverage
  let capLo, capHi;
  if (leverage >= 70) { capLo = 0; capHi = 3; }
  else if (leverage >= 55) { capLo = 0; capHi = 4; }
  else if (leverage >= 40) { capLo = 3; capHi = 5; }
  else if (leverage >= 25) { capLo = 4; capHi = 7; }
  else { capLo = 5; capHi = 8; }

  if (s.desiredTerm === '3yr') { capHi = Math.max(0, capHi - 1); }
  if (s.noticeStatus === 'passed') { capLo += 2; capHi += 3; }

  return { askLo, askHi, capLo, capHi };
}

// ─── Discount-off-list model ──────────────────────────────────────────────────
function getDiscountRange(s, leverage) {
  const tier = ACV_TIERS[s.annualSpend]?.tier ?? 0;
  const base = [
    [5, 15], [10, 20], [15, 25], [20, 30],
    [25, 35], [30, 40], [35, 45], [40, 50],
  ][tier] || [5, 15];

  let [lo, hi] = base;
  if (s.alternative === 'dual') { lo += 4; hi += 7; }
  else if (s.alternative === 'evaluating') { lo += 3; hi += 5; }
  else if (s.alternative === 'none') { lo -= 2; hi -= 3; }

  if (s.desiredTerm === '3yr') { lo += 2; hi += 4; }
  else if (s.desiredTerm === '2yr') { lo += 1; hi += 2; }

  const fc = fiscalContext(s.renewalMonth);
  if (fc?.strength === 'peak') { lo += 2; hi += 4; }
  else if (fc?.strength === 'good') { lo += 1; hi += 2; }

  if (s.changeEvents?.includes('expansion')) { lo += 1; hi += 3; }
  if (leverage < 25) { hi -= 3; }
  if (s.adoptionHealth === 'critical') { hi -= 2; }

  // Ceiling the stack. Modifiers should shift the band, not compound into a
  // number no account team would recognize — cap the top at 12 points above
  // the tier's base ceiling.
  lo = Math.max(0, Math.round(lo));
  hi = Math.min(Math.round(hi), base[1] + 12);
  hi = Math.max(lo + 3, hi);
  return { lo, hi, midpoint: Math.round((lo + hi) / 2) };
}

// ─── Shelfware reclamation model ──────────────────────────────────────────────
function getShelfwareEstimate(s) {
  const acv = ACV_TIERS[s.annualSpend]?.mid;
  if (!acv) return null;
  const bands = {
    under60:  { lo: .22, hi: .35, label: 'Under 60% utilization' },
    '60-75':  { lo: .12, hi: .22, label: '60–75% utilization' },
    '75-90':  { lo: .05, hi: .12, label: '75–90% utilization' },
    over90:   { lo: 0,   hi: .04, label: 'Over 90% utilization' },
    unknown:  { lo: .10, hi: .25, label: 'Utilization never measured' },
  };
  const band = bands[s.licenseUtilization];
  if (!band) return null;
  // Not all idle seats are reclaimable — some are seasonal, contractual, or in flight.
  const recoverable = 0.7;
  const lo = Math.round(acv * band.lo * recoverable / 1000) * 1000;
  const hi = Math.round(acv * band.hi * recoverable / 1000) * 1000;
  // Below roughly $10K the estimate is noise, not an opportunity worth a
  // section of the plan. Suppress rather than show a trivial number.
  if (hi < 10000) return null;
  return { label: band.label, lo, hi, acv, isEstimate: true };
}

const fmtMoney = n => '$' + n.toLocaleString('en-US');

// ─── Renewal posture ──────────────────────────────────────────────────────────
function recommendedPosture(s, leverage) {
  if (s.noticeStatus === 'passed') return 'Damage Control';
  if (s.licenseUtilization === 'under60' || s.licenseUtilization === 'unknown') return 'True-Down First';
  if (s.contractStructure === 'staggered') return 'Co-Term & Consolidate';
  if (leverage >= 55 && s.desiredTerm === '3yr') return 'Multi-Year Price Lock';
  if (leverage >= 55) return 'Competitive Leverage';
  if (s.changeEvents?.includes('expansion')) return 'Trade Growth for Terms';
  return 'Cap & Protect';
}

// ═══ Main builder ════════════════════════════════════════════════════════════
function buildStrategyHTML(s) {
  const leverage = getLeverageScore(s);
  const leverageInfo = getLeverageLabel(leverage);
  const uplift = getUpliftOutlook(s, leverage);
  const discount = getDiscountRange(s, leverage);
  const shelfware = getShelfwareEstimate(s);
  const fc = fiscalContext(s.renewalMonth);
  const acvLabel = ACV_TIERS[s.annualSpend]?.label ?? 'Unknown ACV';
  const tier = ACV_TIERS[s.annualSpend]?.tier ?? 0;
  const posture = recommendedPosture(s, leverage);
  const sizeLabels = { smb: 'SMB', midmarket: 'Mid-Market', enterprise: 'Enterprise', global: 'Global Enterprise' };

  const alerts = buildAlerts(s, tier, leverage, fc);
  const tactics = buildTactics(s, tier, leverage, fc);
  const concessions = buildConcessions(s, tier);
  const timeline = buildTimeline(s, fc);
  const questions = buildQuestions(s, tier);
  const risks = buildRisks(s, tier, leverage);
  const proxima = getProximaInsight(SF_TO_CAL_TIER[s.annualSpend]);

  return `
<div class="strategy-container">
  <div class="print-proxima-header">
    <span class="print-logo-text">Proxima</span>
    <span class="print-divider"></span>
    <span class="print-tool-name">Salesforce Negotiation Planner</span>
  </div>

  <div class="strategy-hero">
    <h2>Your Salesforce Renewal Strategy</h2>
    <div class="subtitle">${sizeLabels[s.companySize] || 'Company'} · ${acvLabel} ACV · Generated ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</div>
    <div style="font-size:.75rem;color:rgba(255,255,255,.6);font-style:italic;margin-top:4px;">Intended for Proxima use only — please contact Brian Chernauskas with questions</div>
    <div style="font-size:.7rem;color:rgba(255,255,255,.35);margin-top:3px;">Ranges last calibrated: ${RANGES_LAST_UPDATED} · Directional estimates, not Salesforce-published figures</div>
    <div class="score-row">
      <div class="score-pill">
        <span class="pill-label">Leverage Score</span>
        <span class="pill-value" style="color:${leverageInfo.color}">${leverage}/100 — ${leverageInfo.label}</span>
      </div>
      <div class="score-pill">
        <span class="pill-label">Target Uplift Cap</span>
        <span class="pill-value">${uplift.capLo}–${uplift.capHi}%</span>
      </div>
      <div class="score-pill">
        <span class="pill-label">Renewal Posture</span>
        <span class="pill-value">${posture}</span>
      </div>
    </div>
  </div>

  <div class="strategy-body">

    ${alerts.length ? `
    <div class="strategy-section">
      <div class="section-header">
        <span class="section-icon">🚨</span>
        <h3>Critical Flags &amp; Immediate Actions</h3>
      </div>
      <div class="section-content">
        <div class="alerts-list">${alerts.map(a => `<div class="alert alert-${a.type}"><span class="alert-icon">${a.icon}</span><div>${a.text}</div></div>`).join('')}</div>
      </div>
    </div>` : ''}

    ${fc ? `
    <div class="strategy-section">
      <div class="section-header">
        <span class="section-icon">📆</span>
        <h3>Fiscal Timing</h3>
        <span class="section-badge ${fc.strength === 'peak' ? 'green' : fc.strength === 'good' ? 'blue' : ''}">Salesforce fiscal ${fc.quarter}</span>
      </div>
      <div class="section-content">
        <p style="font-size:.92rem;line-height:1.7;color:var(--text-secondary);">${fc.note}</p>
        <p style="font-size:.85rem;line-height:1.7;color:var(--text-muted);margin-top:10px;">Salesforce's fiscal year runs February 1 to January 31. Quarter ends fall on April 30, July 31, October 31, and January 31.</p>
      </div>
    </div>` : ''}

    <div class="strategy-section">
      <div class="section-header">
        <span class="section-icon">📈</span>
        <h3>Renewal Uplift Outlook</h3>
        <span class="section-badge">Primary commercial lever</span>
      </div>
      <div class="section-content">
        <div class="discount-estimate">
          <div>
            <div class="de-range">${uplift.capLo}–${uplift.capHi}%</div>
            <div class="de-label">target cap on renewal uplift</div>
          </div>
          <div class="de-bar-wrap">
            <div class="de-bar-bg">
              <div class="de-bar-fill" style="width:${Math.min(100 - uplift.capHi * 6, 100)}%"></div>
            </div>
            <div class="de-note">Expect Salesforce to open at <strong>${uplift.askLo}–${uplift.askHi}%</strong> · Your target cap: <strong>${uplift.capLo}–${uplift.capHi}%</strong> · Stretch: <strong>0% flat renewal</strong></div>
          </div>
        </div>
        <p style="margin-top:14px;font-size:.88rem;line-height:1.7;color:var(--text-secondary);">
          A capped uplift is worth more than a one-time discount because it compounds across every year of the term and every renewal that follows. If you win only one term this cycle, win this one — and make sure the cap is written as a maximum on the <em>total</em> order form value, not a per-unit list price that Salesforce can route around by changing the product mix.
        </p>
        ${discountBreakdownHTML(s, tier, fc, leverage)}
      </div>
    </div>

    <div class="strategy-section">
      <div class="section-header">
        <span class="section-icon">💰</span>
        <h3>Discount Off List</h3>
        <span class="section-badge blue">${acvLabel}</span>
      </div>
      <div class="section-content">
        <div class="discount-estimate">
          <div>
            <div class="de-range">${discount.lo}–${discount.hi}%</div>
            <div class="de-label">vs. published list price</div>
          </div>
          <div class="de-bar-wrap">
            <div class="de-bar-bg">
              <div class="de-bar-fill" style="width:${Math.min(discount.hi * 1.8, 100)}%"></div>
            </div>
            <div class="de-note">Midpoint target: <strong>${discount.midpoint}%</strong> · Walk-away floor: <strong>${discount.lo}%</strong> · Stretch goal: <strong>${discount.hi}%</strong></div>
          </div>
        </div>
        ${proxima ? `<div style="margin-top:10px;padding:10px 14px;background:rgba(0,161,224,.08);border:1px solid rgba(0,161,224,.25);border-radius:8px;font-size:.82rem;display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
          <span style="font-weight:700;color:#00A1E0;">📊 Proxima Deal Data</span>
          <span style="color:var(--text-muted);">Based on <strong>${proxima.count} Salesforce deal${proxima.count !== 1 ? 's' : ''}</strong>${proxima.tierMatch ? ' at this ACV tier' : ' across all tiers'}: observed avg <strong>${proxima.avg}%</strong>, range <strong>${proxima.lo}–${proxima.hi}%</strong></span>
        </div>` : ''}
        ${listPriceTableHTML(discount)}
      </div>
    </div>

    ${shelfware ? `
    <div class="strategy-section">
      <div class="section-header">
        <span class="section-icon">🪑</span>
        <h3>Shelfware Reclamation — Your True-Down Window</h3>
        <span class="section-badge green">One-time opportunity</span>
      </div>
      <div class="section-content">
        <div class="discount-estimate">
          <div>
            <div class="de-range" style="font-size:1.6rem;">${fmtMoney(shelfware.lo)}–${fmtMoney(shelfware.hi)}</div>
            <div class="de-label">estimated annual recoverable spend</div>
          </div>
          <div class="de-bar-wrap">
            <div class="de-note">Based on <strong>${shelfware.label}</strong> against a midpoint ACV of <strong>${fmtMoney(shelfware.acv)}</strong>, assuming roughly 70% of idle seats are practically reclaimable.</div>
          </div>
        </div>
        <p style="margin-top:14px;font-size:.88rem;line-height:1.7;color:var(--text-secondary);">
          Most Salesforce agreements do not permit reducing license counts mid-term. Renewal is typically the only moment you can true down, and any seat you carry through this renewal you will likely carry for the full next term. Pull a 90-day active-user report per cloud <em>before</em> you enter pricing discussions, and negotiate against the corrected seat count rather than the contracted one.
        </p>
        <p style="margin-top:10px;font-size:.82rem;line-height:1.7;color:var(--text-muted);font-style:italic;">
          This is a directional estimate derived from your ACV band and reported utilization, not a measured figure. Treat it as a reason to run the report, not as a number to put in front of Salesforce.
        </p>
      </div>
    </div>` : ''}

    <div class="strategy-section">
      <div class="section-header">
        <span class="section-icon">🎯</span>
        <h3>Negotiation Tactics — Ranked by Impact</h3>
        <span class="section-badge blue">${tactics.length} tactics</span>
      </div>
      <div class="section-content">
        <div class="tactics-list">${tactics.map((t, i) => `
          <div class="tactic-card">
            <div class="tactic-num">${i + 1}</div>
            <div class="tactic-body">
              <div class="tactic-title">${t.title}</div>
              <div class="tactic-desc">${t.desc}</div>
              <span class="tactic-impact impact-${t.impact}">${t.impact === 'high' ? '🔥 High Impact' : t.impact === 'medium' ? '⚡ Medium Impact' : '• Low Impact'}</span>
            </div>
          </div>`).join('')}
        </div>
      </div>
    </div>

    <div class="strategy-section">
      <div class="section-header">
        <span class="section-icon">📜</span>
        <h3>Contract Terms to Secure</h3>
        <span class="section-badge green">Beyond price</span>
      </div>
      <div class="section-content">
        <div class="concessions-grid">${concessions.map(c => `
          <div class="concession-card">
            <div class="cc-icon">${c.icon}</div>
            <div class="cc-title">${c.title}</div>
            <div class="cc-desc">${c.desc}</div>
            <div class="cc-priority priority-${c.priority}">${c.priority === 'must' ? '🔴 Must Have' : c.priority === 'should' ? '🟡 Should Have' : '⚪ Nice to Have'}</div>
          </div>`).join('')}
        </div>
      </div>
    </div>

    <div class="strategy-section">
      <div class="section-header">
        <span class="section-icon">📅</span>
        <h3>Negotiation Timeline &amp; Action Plan</h3>
      </div>
      <div class="section-content">
        <div class="timeline">${timeline.map(t => `
          <div class="timeline-item">
            <div class="timeline-left">
              <div class="tl-dot">${t.phase}</div>
              <div class="tl-line"></div>
            </div>
            <div class="tl-content">
              <div class="tl-phase">${t.when}</div>
              <div class="tl-title">${t.title}</div>
              <div class="tl-desc">${t.desc}</div>
              <div class="tl-tasks">${t.tasks.map(task => `<div class="tl-task">${task}</div>`).join('')}</div>
            </div>
          </div>`).join('')}
        </div>
      </div>
    </div>

    <div class="strategy-section">
      <div class="section-header">
        <span class="section-icon">💬</span>
        <h3>Questions to Ask Salesforce</h3>
      </div>
      <div class="section-content">
        <div class="questions-list">${questions.map(q => `<div class="question-item">"${q}"</div>`).join('')}</div>
      </div>
    </div>

    <div class="strategy-section">
      <div class="section-header">
        <span class="section-icon">⚠️</span>
        <h3>Risk Factors &amp; Mitigations</h3>
      </div>
      <div class="section-content">
        <div class="risk-grid">${risks.map(r => `
          <div class="risk-card ${r.level}">
            <div class="risk-title">${r.title}</div>
            <div class="risk-desc">${r.desc}</div>
          </div>`).join('')}
        </div>
      </div>
    </div>

    <div class="strategy-section">
      <div class="section-header">
        <span class="section-icon">📐</span>
        <h3>Methodology &amp; Limitations</h3>
      </div>
      <div class="section-content">
        <p style="font-size:.86rem;line-height:1.75;color:var(--text-secondary);">
          <strong>List pricing is verified; everything else is estimated.</strong> The per-edition list figures above are Salesforce's own published rates, confirmed ${LIST_PRICES.verifiedOn}. Salesforce does not publish renewal uplift data, discount bands, or negotiated outcomes, so every percentage in this plan is a directional estimate built from publicly reported procurement practice and Proxima engagement experience. The uplift outlook assumes a typical opening ask in the 7–10% range absent a contractual cap; the discount bands scale with ACV and are adjusted for competitive position, term length, and fiscal timing.
        </p>
        <p style="font-size:.86rem;line-height:1.75;color:var(--text-secondary);margin-top:10px;">
          Third-party SaaS benchmark sources should be read carefully before being quoted. Aggregator "average savings" figures frequently measure reduction against a vendor's <em>initial quote</em> rather than discount off list — a materially different and much smaller number. Several benchmark sites also carry stale list pricing that predates the August 2025 increase, which inflates every discount percentage derived from it.
        </p>
        <p style="font-size:.86rem;line-height:1.75;color:var(--text-secondary);margin-top:10px;">
          Use these as calibration for what to target and where to push, not as figures to quote to a client or to Salesforce. Where a specific number matters to a deal, verify it against the client's own order forms and against observed outcomes logged in Deal Calibration.
        </p>
      </div>
    </div>

  </div>
  <div class="proxima-strategy-footer" style="margin-top:32px;padding-top:16px;border-top:1px solid var(--border);text-align:center;font-size:.78rem;color:var(--text-muted);font-style:italic;">
    Intended for Proxima use only — please contact Brian Chernauskas with questions
  </div>
</div>`;
}

// ─── Factors table ────────────────────────────────────────────────────────────
function discountBreakdownHTML(s, tier, fc, leverage) {
  const rows = [];
  if (s.alternative === 'dual') rows.push(['Already running a competing platform', 'Strong', 'green']);
  else if (s.alternative === 'evaluating') rows.push(['Active evaluation of an alternative', 'Strong', 'green']);
  else if (s.alternative === 'none') rows.push(['No credible alternative — Salesforce knows it', 'Weak', 'red']);

  if (fc?.strength === 'peak') rows.push(['Renewal lands in Salesforce fiscal Q4', 'Strong', 'green']);
  else if (fc?.strength === 'good') rows.push(['Renewal lands at fiscal quarter end', 'Moderate', 'green']);
  else if (fc?.strength === 'weak') rows.push(['Renewal falls mid-quarter', 'Weak', 'red']);

  if (s.renewalTimeline === 'within-1mo' || s.renewalTimeline === '1-3mo') rows.push(['Limited runway before renewal', 'Weak', 'red']);
  else if (s.renewalTimeline === '6-12mo' || s.renewalTimeline === '12plusmo') rows.push(['Ample runway to negotiate', 'Strong', 'green']);

  if (s.noticeStatus === 'passed') rows.push(['Auto-renewal notice window missed', 'Critical', 'red']);
  else if (s.noticeStatus === 'served') rows.push(['Non-renewal notice already served', 'Strong', 'green']);

  if (s.licenseUtilization === 'under60') rows.push(['Utilization under 60% — large true-down available', 'Strong', 'green']);
  else if (s.licenseUtilization === 'over90') rows.push(['Utilization above 90% — little to trade back', 'Weak', 'red']);

  if (s.desiredTerm === '3yr') rows.push(['Willing to commit to a 3-year term', 'Moderate', 'green']);
  if (s.changeEvents?.includes('expansion')) rows.push(['Planned expansion Salesforce wants to win', 'Moderate', 'green']);
  if (s.adoptionHealth === 'critical') rows.push(['Business-critical dependency limits walk-away', 'Weak', 'red']);
  if (s.headcountTrajectory === 'shrinking') rows.push(['Shrinking headcount — seat growth story absent', 'Weak', 'red']);

  if (!rows.length) return '';
  return `<table style="width:100%;margin-top:18px;border-collapse:collapse;font-size:.82rem;">
    <thead><tr style="border-bottom:1px solid var(--border);">
      <th style="text-align:left;padding:6px 0;color:var(--text-secondary);font-weight:600;">Leverage Factor</th>
      <th style="text-align:right;padding:6px 0;color:var(--text-secondary);font-weight:600;">Position</th>
    </tr></thead>
    <tbody>${rows.map(([label, val, color]) => `<tr style="border-bottom:1px solid var(--surface-3);">
      <td style="padding:7px 0;color:var(--text-primary);">${label}</td>
      <td style="padding:7px 0;text-align:right;font-weight:700;color:var(--${color === 'red' ? 'danger' : 'success'})">${val}</td>
    </tr>`).join('')}</tbody>
  </table>`;
}

// ─── Alerts ───────────────────────────────────────────────────────────────────
function buildAlerts(s, tier, leverage, fc) {
  const alerts = [];

  if (s.noticeStatus === 'passed') {
    alerts.push({ type: 'danger', icon: '🚨', text: '<strong>Auto-renewal notice window has passed.</strong> Your contract may have already renewed at Salesforce\'s stated uplift. Pull the order form today and confirm the exact notice language and renewal date. If it has auto-renewed, your remaining routes are a mutual amendment, negotiating the <em>next</em> cycle now while there is runway, or trading an expansion purchase for retroactive relief. Do not assume the renewal is final until you have read the clause.' });
  } else if (s.noticeStatus === 'imminent') {
    alerts.push({ type: 'danger', icon: '⏰', text: '<strong>Your notice window closes within 30 days.</strong> Serve written non-renewal or intent-to-renegotiate notice now. Serving notice is not a commitment to leave — it preserves your right to negotiate and stops the contract from rolling over on Salesforce\'s terms. This is the single most time-sensitive action in this plan.' });
  } else if (s.noticeStatus === 'unknown') {
    alerts.push({ type: 'warning', icon: '❓', text: '<strong>You do not know your notice period.</strong> Find it before anything else. Salesforce agreements commonly require 30–60 days written notice ahead of the renewal date, and missing it converts a negotiation into an automatic renewal at their number. Check the order form and the master agreement — the clause may sit in either.' });
  }

  if (s.renewalTimeline === 'within-1mo') {
    alerts.push({ type: 'danger', icon: '🚨', text: '<strong>Less than 30 days to renewal.</strong> Do not sign under deadline pressure. Request a 60–90 day extension of current terms in writing while you negotiate. Salesforce grants these more often than most buyers expect, and the request costs you nothing.' });
  }

  if (s.licenseUtilization === 'unknown') {
    alerts.push({ type: 'warning', icon: '📊', text: '<strong>License utilization has never been measured.</strong> This is the highest-value hour of work available to you before this renewal. Pull login and active-user data per cloud for the last 90 days. In estates that have never been audited, unused seats commonly run 10–25% of licensed volume — and renewal is typically the only moment you can remove them.' });
  }

  if (s.alternative === 'none' && tier >= 3) {
    alerts.push({ type: 'warning', icon: '⚡', text: '<strong>No competitive alternative identified.</strong> At your contract size this materially weakens your position — Salesforce prices against switching cost, and an account with nowhere to go pays for it. You do not need to intend to move. A scoped conversation with one credible alternative, documented internally, changes the tenor of the negotiation.' });
  }

  if (s.contractStructure === 'staggered') {
    alerts.push({ type: 'info', icon: '🗂️', text: '<strong>Your order forms are on staggered dates.</strong> This fragments your leverage — each renewal is negotiated alone, at a fraction of your true spend, and Salesforce sees the whole picture while each of your negotiations sees only part. Co-terming everything onto a single date consolidates your volume into one conversation and is worth pursuing even at the cost of a short bridging term.' });
  }

  if (s.costPressures?.includes('premier')) {
    alerts.push({ type: 'info', icon: '🎧', text: '<strong>Premier Support is renewing automatically.</strong> Support is priced as a percentage of net contract value and is frequently renewed without review. Establish what you actually consumed — case volume, escalations, accelerators used — and either negotiate the rate down or step back to Standard if the consumption does not justify it.' });
  }

  if (s.changeEvents?.includes('agentforce')) {
    alerts.push({ type: 'info', icon: '🤖', text: '<strong>Salesforce is pushing Agentforce or Einstein adoption.</strong> Strategic AI pushes are a negotiating opportunity: Salesforce has internal targets on these products and will trade real commercial concessions for a reference-able adoption commitment. If you have genuine interest, price the AI component separately and use your willingness to adopt as currency against the core renewal — do not let it be bundled in as an assumed add.' });
  }

  if (s.headcountTrajectory === 'shrinking' && s.licenseUtilization !== 'over90') {
    alerts.push({ type: 'warning', icon: '📉', text: '<strong>Headcount is shrinking while seats are contracted flat.</strong> Your licensed volume is drifting further from your real need every quarter. Model your seat requirement at the <em>end</em> of the next term, not today, and negotiate to that number — otherwise you lock in a gap that widens for the life of the contract.' });
  }

  return alerts;
}

// ─── Tactics ──────────────────────────────────────────────────────────────────
function buildTactics(s, tier, leverage, fc) {
  const tactics = [];

  // 1. True-down — usually the biggest single number
  if (['under60', '60-75', 'unknown'].includes(s.licenseUtilization)) {
    tactics.push({
      title: 'Run a License Audit and Negotiate Against Real Usage',
      desc: 'Pull 90-day active-user data for every cloud before you discuss price. Salesforce agreements generally prohibit reducing seat counts mid-term, which makes renewal your only true-down window — every unused seat you carry through it, you carry for the whole next term. Present the corrected count as your starting position rather than negotiating a discount on seats you do not use. A 20% reduction in seats is worth more than a 20% discount, because it also lowers the base that every future uplift is applied to.',
      impact: 'high',
    });
  }

  // 2. Uplift cap — the compounding term
  tactics.push({
    title: 'Negotiate a Hard Cap on Renewal Uplift',
    desc: `Absent a contractual cap, Salesforce typically opens renewal at a ${getUpliftOutlook(s, leverage).askLo}–${getUpliftOutlook(s, leverage).askHi}% increase. Make a written cap a condition of signature — ideally 3% or lower, expressed as a maximum on total order form value rather than on per-unit list price, so the cap cannot be routed around by changing product mix or edition. This single term compounds across every year of the agreement and anchors every renewal that follows it. If you win one thing in this negotiation, win this.`,
    impact: 'high',
  });

  // 3. Fiscal timing
  if (fc && fc.strength !== 'peak') {
    tactics.push({
      title: 'Move the Decision Into Salesforce\'s Q4 If You Can',
      desc: `Your renewal currently falls in fiscal ${fc.quarter}${fc.strength === 'weak' ? ', away from any quota deadline' : ' at quarter end'}. Salesforce's fiscal year ends January 31, and discounting authority is at its most flexible in the November–January window. A short bridging extension that repositions your renewal into Q4 — or simply letting the decision run to the end of a quarter — can be worth several points on its own. Ask for the extension early; asking in the final weeks reads as weakness rather than planning.`,
      impact: fc.strength === 'weak' ? 'high' : 'medium',
    });
  } else if (fc?.strength === 'peak') {
    tactics.push({
      title: 'Use Your Q4 Timing Deliberately',
      desc: 'Your renewal already sits in Salesforce\'s strongest quota period. Use it consciously: hold your final decision until late in the window, make clear that signature is available before their year-end if terms land, and be specific about what "terms land" means. An account team that can close your deal before January 31 has real incentive to find concessions that would not be available in March.',
      impact: 'high',
    });
  }

  // 4. Competitive alternative
  if (s.alternative === 'none' || s.alternative === 'theoretical') {
    const alt = VENDOR_LABELS[s.alternativeVendor] || 'a credible alternative platform';
    tactics.push({
      title: 'Build a Credible Alternative Before You Negotiate',
      desc: `Salesforce prices against switching cost, and an account with no alternative pays a premium for that fact. You do not need to intend to migrate. Scope a real conversation with ${alt} for one business unit or one cloud, document it internally, and let the account team know an evaluation is underway. The objective is not a migration plan — it is changing what Salesforce believes about your options. This is the highest-leverage move available to accounts that currently have none.`,
      impact: 'high',
    });
  } else {
    const alt = VENDOR_LABELS[s.alternativeVendor] || 'your alternative platform';
    tactics.push({
      title: 'Make Your Alternative Specific and Quantified',
      desc: `A vague competitive threat is discounted by every experienced account team. Convert yours into specifics: which workloads move to ${alt}, on what timeline, at what cost, and what the migration effort actually is. A named alternative with a costed transition plan is treated as a genuine risk to the account; "we're looking at other options" is treated as a negotiating posture and priced accordingly.`,
      impact: 'high',
    });
  }

  // 5. Co-term
  if (s.contractStructure === 'staggered' || s.contractStructure === 'unknown') {
    tactics.push({
      title: 'Co-Term Every Order Form Onto a Single Date',
      desc: 'Staggered renewal dates fragment your spend into several small negotiations, each conducted at a fraction of your real volume, while Salesforce negotiates every one of them with full visibility of the whole account. Consolidating onto one date concentrates your leverage into a single annual conversation and makes your total spend visible as one number. It also removes the mid-year add-on purchases that get bought at list because there is no negotiation event attached to them.',
      impact: 'high',
    });
  }

  // 6. Term length trade
  if (s.desiredTerm === '3yr' || s.desiredTerm === 'undecided') {
    tactics.push({
      title: 'Price a Multi-Year Term — But Only With Protections Attached',
      desc: 'A three-year term is worth real discount to Salesforce and typically improves pricing by a few points over a one-year deal. Only trade the flexibility if the term carries protections: a fixed uplift cap for the full period, price-hold on additional seats at the same discount, a true-down right at each anniversary, and swap rights so the product mix is not frozen alongside the price. A long term without those protections converts your flexibility into their certainty and gives you nothing back for it.',
      impact: 'medium',
    });
  } else if (s.desiredTerm === '1yr') {
    tactics.push({
      title: 'Use the Short Term Deliberately, and Price What It Costs',
      desc: 'A one-year term preserves your ability to react but gives up the discount a longer commitment would buy, and it puts you back at the table every twelve months — which favors Salesforce if your utilization is drifting. Ask the account team to price both a one-year and a three-year structure side by side so the flexibility premium is explicit. If the gap is small, the short term is worth it; if it is large, the multi-year with protections is usually the better deal.',
      impact: 'medium',
    });
  }

  // 6b. Swap rights — the answer to committing on a mix you are not sure of
  const mixUncertain = (s.products?.length || 0) >= 3
    || s.adoptionHealth === 'mixed' || s.adoptionHealth === 'poor'
    || s.changeEvents?.includes('agentforce')
    || s.changeEvents?.includes('consolidation');
  const longTerm = s.desiredTerm === '3yr' || s.desiredTerm === '2yr' || s.desiredTerm === 'undecided';
  if (mixUncertain || longTerm) {
    tactics.push({
      title: 'Negotiate Swap Rights So the Mix Is Not Frozen for the Term',
      desc: 'A Salesforce agreement locks not just how many licenses you hold but which ones. If the business shifts toward service, or an edition turns out to be over-specified, or a cloud fails to land, you keep paying for the original mix and buy the replacement on top. Swap rights are the fix: the contractual right to exchange licenses for a different product, edition, or user type during the term without renegotiating the agreement. Ask for three specifically — product swap between clouds, edition swap between tiers, and user-type swap from full to platform or community licenses — because a right granted on only one of the three is easy to give and rarely the one you need. Salesforce will resist, so raise it early and treat it as a condition of any multi-year term rather than a late add.',
      impact: (mixUncertain && longTerm) ? 'high' : 'medium',
    });
    tactics.push({
      title: 'Watch the Three Clauses That Hollow Out a Swap Right',
      desc: 'Swap language is frequently granted in a form that cannot be used. First, "equal or greater value" means you may only swap upward — push for dollar-neutral exchange at minimum, and for credit where you swap down. Second, swaps priced at then-current list quietly erode your negotiated discount every time you use one; require that swapped licenses carry the same discount as the originals. Third, an unstated cap or a single annual window can make the right theoretical — pin the percentage of contract value eligible (10–25% is a realistic ask) and how often it can be exercised. Get all of it onto the order form; swap rights described verbally by an account executive are not enforceable.',
      impact: 'medium',
    });
  }

  // 7. Expansion as currency
  if (s.changeEvents?.includes('expansion') || s.changeEvents?.includes('consolidation')) {
    tactics.push({
      title: 'Hold Planned Expansion Back as Negotiating Currency',
      desc: 'Growth you have already decided on is the most valuable thing you can bring to a renewal — and the easiest to give away for free by mentioning it early. Do not disclose planned seat or cloud expansion until core renewal terms are settled. Then trade it explicitly: the expansion is available at signature, priced at the renewal discount, contingent on the uplift cap and true-down rights you are asking for.',
      impact: 'high',
    });
  }

  // 8. Support tier
  if (s.supportTier === 'premier' || s.supportTier === 'signature') {
    tactics.push({
      title: 'Review Support Tier Against Actual Consumption',
      desc: 'Premier and Signature Success are priced as a percentage of net contract value, which means the cost rises with your contract whether or not your support needs do. Pull your case volume, escalation history, and accelerator usage for the past year. Many accounts are paying enterprise-tier support rates against commodity-tier consumption. Either negotiate the percentage down, secure specific named resources that justify it, or step the tier back.',
      impact: 'medium',
    });
  }

  // 9. Price protection on growth
  if (['strong', 'aggressive'].includes(s.headcountTrajectory)) {
    tactics.push({
      title: 'Lock Price Protection on Future Seat Purchases',
      desc: 'With headcount growing, the seats you add mid-term are the ones most likely to be bought at list — there is no negotiation event attached to them and they are usually urgent. Secure written price-hold: additional licenses of any product already on the order form are available at the same discount, for the full term, without renegotiation. This is a low-cost concession for Salesforce and can be worth more than the headline discount over three years of growth.',
      impact: 'high',
    });
  }

  // 10. Bundle discipline
  if ((s.products?.length || 0) >= 4) {
    tactics.push({
      title: 'Demand Line-Item Pricing Rather Than a Bundle',
      desc: `You hold ${s.products.length} Salesforce products. Bundled pricing hides which of them are actually discounted and makes it impossible to drop one without renegotiating everything — which is precisely why it is offered. Require per-product, per-seat pricing on the order form. Line-item visibility lets you identify what you are overpaying for, drop what you do not use, and benchmark each component independently at the next renewal.`,
      impact: 'medium',
    });
  }

  // 11. Overlap
  if (s.costPressures?.includes('overlap')) {
    tactics.push({
      title: 'Resolve Overlapping Tools Before You Commit',
      desc: 'You have flagged duplicate capability in the estate. Decide what stays before signing, not after — once a product is inside a multi-year Salesforce agreement, removing it generally requires waiting for the next renewal. Map every overlapping tool against the Salesforce product that duplicates it, pick a winner, and size the renewal to the decision rather than to the current state.',
      impact: 'medium',
    });
  }

  // 12. Escalation path
  if (leverage < 40) {
    tactics.push({
      title: 'Escalate Beyond the Account Executive',
      desc: 'Your current position is weak enough that the AE likely has no incentive to improve the offer materially — their discounting authority is limited and your account is not at risk. Getting to a Regional VP or above changes who is deciding and what authority is available. The credible route is executive-to-executive: your CIO or CFO raising the commercial relationship with their counterpart, rather than procurement pushing harder on the same contact.',
      impact: 'medium',
    });
  }

  return tactics;
}

// ─── Concessions / terms ──────────────────────────────────────────────────────
function buildConcessions(s, tier) {
  const c = [];

  c.push({ icon: '🧢', title: 'Uplift Cap', desc: 'A written maximum on renewal increase — target 3% or lower — expressed against total order form value, not per-unit list price.', priority: 'must' });
  c.push({ icon: '📉', title: 'True-Down Right', desc: 'The right to reduce seat count at each anniversary, typically 10–20% without penalty. Without this, every seat is locked for the full term.', priority: 'must' });
  c.push({ icon: '🔒', title: 'Price Hold on Additions', desc: 'Additional licenses of any product on the order form available at the same discount for the full term, with no renegotiation required.', priority: 'must' });
  c.push({ icon: '🔁', title: 'Swap Rights', desc: 'The right to exchange licenses for a different product, edition, or user type mid-term — dollar-neutral, at your negotiated discount, with the eligible percentage of contract value stated.', priority: 'must' });
  c.push({ icon: '📅', title: 'Extended Notice Period', desc: 'Widen the non-renewal notice window to 90 days so a missed date cannot trigger an automatic rollover at their number.', priority: 'should' });

  if (s.contractStructure === 'staggered' || s.contractStructure === 'cotermed') {
    c.push({ icon: '🗂️', title: 'Full Co-Termination', desc: 'All order forms aligned to a single renewal date, consolidating your spend into one negotiation each year.', priority: 'must' });
  }
  if (s.changeEvents?.includes('mna') || s.changeEvents?.includes('divestiture')) {
    c.push({ icon: '🔀', title: 'M&A / Divestiture Clause', desc: 'Rights to add acquired entities at existing pricing, and to reduce seats proportionally on divestiture without penalty.', priority: 'must' });
  }
  if (s.supportTier === 'premier' || s.supportTier === 'signature') {
    c.push({ icon: '🎧', title: 'Support Rate Reduction', desc: 'Support priced as a fixed fee or a reduced percentage, rather than scaling automatically with contract value.', priority: 'should' });
  }
  if (s.costPressures?.includes('sandbox')) {
    c.push({ icon: '🧪', title: 'Sandbox Allocation', desc: 'Full-copy and partial sandboxes bundled into the agreement rather than purchased separately at list mid-term.', priority: 'should' });
  }
  if (s.costPressures?.includes('api')) {
    c.push({ icon: '🔌', title: 'API Limit Increase', desc: 'A higher daily API call allocation written into the order form, removing recurring overage charges.', priority: 'should' });
  }
  if (s.changeEvents?.includes('agentforce') || s.products?.includes('agentforce')) {
    c.push({ icon: '🤖', title: 'AI Pilot Credits', desc: 'Agentforce or Einstein capacity provided at no cost for an evaluation period, with pricing fixed if you expand.', priority: 'should' });
  }
  if (tier >= 4) {
    c.push({ icon: '👤', title: 'Named Customer Success Resource', desc: 'A dedicated CSM or architect written into the agreement with defined engagement commitments, not best-efforts language.', priority: 'should' });
  }
  c.push({ icon: '📊', title: 'Usage Reporting Access', desc: 'Contractual right to per-cloud active-user reporting, so utilization is measurable ahead of every future renewal.', priority: 'should' });
  c.push({ icon: '🎓', title: 'Training & Enablement Credits', desc: 'Trailhead Academy credits or funded enablement days included, particularly valuable where adoption is uneven.', priority: 'nice' });
  c.push({ icon: '💳', title: 'Payment Terms', desc: 'Net-60 or better, or quarterly billing in place of annual prepayment to improve working capital.', priority: 'nice' });

  return c;
}

// ─── Timeline ─────────────────────────────────────────────────────────────────
function buildTimeline(s, fc) {
  const urgent = ['within-1mo', '1-3mo'].includes(s.renewalTimeline);
  const t = [];

  t.push({
    phase: '1', when: urgent ? 'This week' : '9–12 months before renewal',
    title: 'Establish the Facts',
    desc: 'Before any conversation with Salesforce, know your own position better than they do.',
    tasks: [
      'Locate every order form and the master agreement; extract renewal date, notice period, and any existing uplift cap',
      'Pull 90-day active-user data for every cloud and calculate true utilization per product',
      'Build the total cost picture: licenses, support, sandboxes, add-ons, overages',
      'Document what was paid at the last renewal and what uplift was applied',
    ],
  });

  t.push({
    phase: '2', when: urgent ? 'Within 2 weeks' : '6–9 months before renewal',
    title: 'Secure Your Position',
    desc: 'Protect the notice window and build the alternative before Salesforce sets the agenda.',
    tasks: [
      'Serve written notice of intent to renegotiate — this preserves rights without committing to leave',
      s.alternative === 'none' || s.alternative === 'theoretical'
        ? 'Open a scoped conversation with at least one alternative platform and document it'
        : 'Convert your alternative into a costed migration scenario with named workloads and timelines',
      'Align internally on the walk-away position and who owns the decision',
      'Identify seats to eliminate and size the renewal to corrected volume, not contracted volume',
    ],
  });

  t.push({
    phase: '3', when: urgent ? 'Weeks 3–4' : '4–6 months before renewal',
    title: 'Open the Negotiation',
    desc: 'Set the frame before Salesforce does. The first number on the table anchors everything after it.',
    tasks: [
      'Request the renewal quote early and in writing, with line-item pricing per product and per seat',
      'Present your corrected seat count as the baseline for all pricing discussion',
      'State the uplift cap requirement explicitly as a condition of signature',
      'Do not disclose planned expansion — hold it as currency for the final round',
    ],
  });

  t.push({
    phase: '4', when: urgent ? 'Weeks 5–6' : '2–4 months before renewal',
    title: 'Trade and Escalate',
    desc: 'Concessions arrive when there is a reason for them to arrive. Create that reason.',
    tasks: [
      'Trade explicitly: expansion, multi-year term, or a reference commitment against cap and true-down rights',
      'Escalate above the AE if the offer has not moved materially — RVP level or executive-to-executive',
      'Request the full redlined order form and MSA amendments; review the actual language, not the summary',
      fc?.strength === 'peak'
        ? 'Signal that signature is available before their January 31 year-end if terms land'
        : 'Assess whether a short extension repositions the close into Salesforce\'s Q4',
    ],
  });

  t.push({
    phase: '5', when: urgent ? 'Before signature' : 'Final 30–60 days',
    title: 'Close and Verify',
    desc: 'The order form is the contract. Verify every negotiated term appears in it.',
    tasks: [
      'Confirm the uplift cap language survives into the final order form and reads against total value',
      'Verify true-down rights, price-hold on additions, and notice period are all written, not verbal',
      'Check that seat counts, editions, and product lines match what was agreed line by line',
      'Diarize the next notice deadline immediately on signature, with an owner and a calendar reminder',
    ],
  });

  return t;
}

// ─── Questions ────────────────────────────────────────────────────────────────
function buildQuestions(s, tier) {
  const q = [];
  q.push('What is the exact uplift percentage you are applying at this renewal, and what is it calculated against?');
  q.push('Will you commit to a written cap on uplift for the full term, expressed against total order form value?');
  q.push('What is our current utilization by product according to your data, and how does it compare to what we are licensed for?');
  q.push('If we reduce seat count to match actual usage, what does the renewal look like?');
  q.push('Can we get line-item pricing per product and per seat rather than a bundled figure?');
  q.push('What discount applies to additional licenses purchased mid-term, and will you hold it in writing for the full term?');
  q.push('If our product mix changes, can we swap licenses between clouds, editions, or user types mid-term — at what value basis, up to what percentage of contract value, and how often?');

  if (s.contractStructure === 'staggered' || s.contractStructure === 'unknown') {
    q.push('What would it take to co-term all of our order forms onto a single renewal date?');
  }
  if (s.desiredTerm !== '1yr') {
    q.push('Can you price a one-year and a three-year structure side by side so we can see exactly what the term is worth?');
  }
  if (s.supportTier === 'premier' || s.supportTier === 'signature') {
    q.push('What did we actually consume against our support tier this year, and what justifies the rate at renewal?');
  }
  if (s.changeEvents?.includes('agentforce') || s.products?.includes('agentforce')) {
    q.push('What Agentforce or Einstein capacity can you include at no cost for an evaluation period, and what is the pricing if we expand?');
  }
  if (s.changeEvents?.includes('mna') || s.changeEvents?.includes('divestiture')) {
    q.push('How does the agreement handle acquisitions and divestitures — can we add or remove entities without renegotiating?');
  }
  if (tier >= 4) {
    q.push('What executive sponsorship and named customer success resource are included at our contract value?');
  }
  q.push('What is the notice period for non-renewal, and will you extend it to 90 days?');

  return q.slice(0, 11);
}

// ─── Risks ────────────────────────────────────────────────────────────────────
function buildRisks(s, tier, leverage) {
  const r = [];

  if (s.noticeStatus === 'passed' || s.noticeStatus === 'unknown') {
    r.push({ level: 'high', title: 'Automatic Renewal Exposure', desc: 'An unmanaged notice window is the most common way SaaS renewals are lost before they are negotiated. If the date passes, the contract rolls at Salesforce\'s number and your options narrow to what they choose to offer. Confirm the clause and diarize it permanently.' });
  }
  if (s.adoptionHealth === 'critical') {
    r.push({ level: 'high', title: 'Business-Critical Dependency', desc: 'Salesforce operating as your system of record means walking away is not credible, and experienced account teams price that in. Your leverage has to come from timing, utilization, and contract terms rather than from any threat to leave — plan the negotiation accordingly.' });
  }
  if (s.licenseUtilization === 'over90' && s.headcountTrajectory === 'aggressive') {
    r.push({ level: 'medium', title: 'Seat Growth Under Pressure', desc: 'High utilization with aggressive hiring means you will need seats mid-term, and urgent mid-term purchases are made at whatever price is available. Price-hold on additional licenses moves from useful to essential in this scenario.' });
  }
  if (s.headcountTrajectory === 'shrinking') {
    r.push({ level: 'medium', title: 'Committed Volume Against a Shrinking Base', desc: 'Contracting flat seat counts while headcount declines locks in a gap that widens across the term. Without true-down rights you will be paying for a workforce you no longer have.' });
  }
  if (s.desiredTerm === '3yr' && leverage < 45) {
    r.push({ level: 'medium', title: 'Long Term From a Weak Position', desc: 'A three-year commitment negotiated from limited leverage locks in terms you would not accept with more runway. If the position cannot be improved before signature, a shorter term while you build an alternative is often the better trade.' });
  }
  if ((s.products?.length || 0) >= 5) {
    r.push({ level: 'medium', title: 'Bundle Lock-In', desc: `With ${s.products.length} products in one agreement, dropping any single component typically requires reopening the whole contract. Line-item pricing, separately terminable products, and swap rights are what preserve your ability to unwind later — swap rights in particular turn a stranded product into budget you can redirect rather than spend you keep paying.` });
  }
  if (s.contractStructure === 'staggered') {
    r.push({ level: 'medium', title: 'Fragmented Negotiating Position', desc: 'Staggered dates mean you never negotiate at full spend, while Salesforce always sees the full account. Each renewal is conducted at a fraction of your real leverage.' });
  }
  if (s.alternative === 'none') {
    r.push({ level: 'high', title: 'No Walk-Away Position', desc: 'Without a credible alternative, every request depends on goodwill rather than consequence. This is the single biggest structural weakness in a SaaS renewal and the one that takes longest to fix — start before the next cycle, not during it.' });
  }
  if (s.internalChampion === 'none') {
    r.push({ level: 'medium', title: 'No Internal Decision Owner', desc: 'Renewals without a clear owner default to whoever is closest to the deadline, which is usually the business user least equipped to negotiate. Assign ownership explicitly before engaging Salesforce.' });
  }
  if (s.previousNegotiation === 'none') {
    r.push({ level: 'low', title: 'No Negotiation History', desc: 'Accounts that have accepted renewal quotes without challenge are priced on that basis. Expect the first counter to be met with surprise and some resistance — that is a signal the approach is working, not that it is failing.' });
  }
  if (!r.length) {
    r.push({ level: 'low', title: 'No Material Structural Risks Identified', desc: 'Your inputs do not surface the common failure modes — notice exposure, dependency, fragmentation, or absent alternatives. Focus the negotiation on maximizing the uplift cap and securing true-down rights for the term ahead.' });
  }
  return r;
}

// ─── Strategy generation & export ─────────────────────────────────────────────
function generateStrategy() {
  if (!validateStep(3)) return;
  collectStep(3);
  document.getElementById('strategy-output').innerHTML = buildStrategyHTML(state);
  goToStep(4);
}

function printStrategy() { window.print(); }
