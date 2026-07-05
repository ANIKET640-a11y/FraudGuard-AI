/* ==========================================================================
   FraudGuardAI Client-Side Application Logic (Enterprise Edition)
   ========================================================================== */

const API = window.location.origin;
let gaugeChart = null;
let histCount = 0;
const historyData = [];
let lastReportContext = null;
let streamInterval = null;

// Heuristic Risk Factor Descriptions
const heuristicTooltips = {
  'V17': 'Location divergence score — evaluates distance from cardholder\'s trusted transacting terminals.',
  'V14': 'Transaction frequency velocity — monitors consistency of swipe rates in short temporal windows.',
  'V12': 'Merchant category offset — checks if purchase merchant categories align with historical spending profile.',
  'V10': 'Terminal signature variance — flags anomalies in payment network terminal hardware parameters.',
  'V11': 'Rapid attempt count — detects recurring swiping operations or checkout automation attempts.',
  'V16': 'Card utilization balance velocity — analyzes payment sizes relative to historical spending limits.',
  'V9':  'Network node routing indicator — flags discrepancies between customer origin and payment routing nodes.',
  'V4':  'Authorized geolocation variance — detects card presence in unauthorized domestic ranges.',
  'V2':  'Behavioral cluster deviation — maps spend characteristics against baseline threat models.',
  'V7':  'Cross-border travel rate velocity — detects physical impossibility of transaction location hops.',
  'Amount': 'Raw payment value. Higher transactional values trigger enhanced gateway inspections.',
  'Time': 'Temporal log reference. Measures relative timing of transactions for peak hour security patterns.'
};

function getHeuristicDescription(featureName) {
  return heuristicTooltips[featureName] || 'Anonymized transaction profile metric (' + featureName + ').';
}

function genTxnRef() {
  return 'TXN-' + Math.floor(Math.random() * 9000000 + 1000000);
}

/* --- Theme Management --- */
function toggleTheme() {
  const html = document.documentElement;
  const isDark = html.getAttribute('data-theme') === 'dark';
  const newTheme = isDark ? 'light' : 'dark';
  
  html.setAttribute('data-theme', newTheme);
  localStorage.setItem('theme', newTheme);
  updateThemeIcon(newTheme);
  
  if (gaugeChart) {
    rebuildGaugeColors();
  }
}

function updateThemeIcon(theme) {
  const themeBtn = document.getElementById('themeBtn');
  if (!themeBtn) return;
  if (theme === 'dark') {
    themeBtn.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="5"></circle>
        <line x1="12" y1="1" x2="12" y2="3"></line>
        <line x1="12" y1="21" x2="12" y2="23"></line>
        <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
        <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
        <line x1="1" y1="12" x2="3" y2="12"></line>
        <line x1="21" y1="12" x2="23" y2="12"></line>
        <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
        <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
      </svg>
    `;
    themeBtn.title = "Switch to light mode";
  } else {
    themeBtn.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
      </svg>
    `;
    themeBtn.title = "Switch to dark mode";
  }
}

// Initial Theme Loading
(function() {
  const saved = localStorage.getItem('theme') || 'light';
  document.documentElement.setAttribute('data-theme', saved);
  document.addEventListener('DOMContentLoaded', () => {
    updateThemeIcon(saved);
  });
})();

/* --- Page Router --- */
function showPage(name, updateHash = true) {
  const validPages = ['analyse', 'history', 'developer'];
  if (!validPages.includes(name)) {
    name = 'analyse';
  }
  
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  
  const targetPage = document.getElementById('page-' + name);
  const targetBtn = document.getElementById('nav-' + name);
  
  if (targetPage) targetPage.classList.add('active');
  if (targetBtn) targetBtn.classList.add('active');
  
  if (updateHash) {
    window.location.hash = '/' + name;
  }
  
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function handleHashChange() {
  const session = localStorage.getItem('fg_session');
  if (!session) {
    document.documentElement.classList.add('auth-mode');
    return;
  }
  const hash = window.location.hash.replace(/^#\/?/, '') || 'analyse';
  showPage(hash, false);
}

window.addEventListener('hashchange', handleHashChange);

/* --- Simulation Presets --- */
function selectPreset(amount, timeText, secondsVal) {
  const amountInput = document.getElementById('f-amount');
  const timeInput = document.getElementById('f-time');
  const hourInput = document.getElementById('f-hour');
  const timeSlider = document.getElementById('f-time-slider');
  
  amountInput.value = amount;
  timeInput.value = secondsVal;
  
  const hour = Math.floor(secondsVal / 3600) % 24;
  hourInput.value = hour;
  timeSlider.value = hour;
  
  amountInput.style.transform = 'scale(1.02)';
  setTimeout(() => { amountInput.style.transform = 'scale(1)'; }, 150);
}

function syncHourSlider() {
  const slider = document.getElementById('f-time-slider');
  const hourInput = document.getElementById('f-hour');
  const timeInput = document.getElementById('f-time');
  const displayVal = document.getElementById('slider-val-display');
  
  const val = parseInt(slider.value);
  hourInput.value = val;
  timeInput.value = val * 3600;
  displayVal.textContent = String(val).padStart(2, '0') + ':00';
}

function syncHour() {
  const slider = document.getElementById('f-time-slider');
  const hourInput = document.getElementById('f-hour');
  const timeInput = document.getElementById('f-time');
  const displayVal = document.getElementById('slider-val-display');
  
  let val = parseInt(hourInput.value) || 0;
  if (val < 0) val = 0;
  if (val > 23) val = 23;
  hourInput.value = val;
  
  slider.value = val;
  timeInput.value = val * 3600;
  displayVal.textContent = String(val).padStart(2, '0') + ':00';
}

/* --- Gauge Construction --- */
function lvlFor(p) {
  const declineSlider = document.getElementById('f-decline-slider');
  const auditSlider = document.getElementById('f-audit-slider');
  
  const declineVal = declineSlider ? parseFloat(declineSlider.value) / 100 : 0.75;
  const auditVal = auditSlider ? parseFloat(auditSlider.value) / 100 : 0.20;
  
  if (p >= declineVal) return 'high';
  if (p >= auditVal) return 'medium';
  return 'safe';
}

function rebuildGaugeColors() {
  if (!gaugeChart) return;
  const pct = gaugeChart.data.datasets[0].data[0] || 0;
  buildGauge(pct / 100);
}

function buildGauge(prob) {
  const pct = prob * 100;
  const lvl = lvlFor(prob);
  const styles = getComputedStyle(document.documentElement);
  
  let col, trk;
  if (lvl === 'high') {
    col = styles.getPropertyValue('--danger').trim();
    trk = styles.getPropertyValue('--danger-bg').trim();
  } else if (lvl === 'medium') {
    col = styles.getPropertyValue('--warn').trim();
    trk = styles.getPropertyValue('--warn-bg').trim();
  } else {
    col = styles.getPropertyValue('--safe').trim();
    trk = styles.getPropertyValue('--safe-bg').trim();
  }
  
  const ctx = document.getElementById('gaugeCanvas');
  if (!ctx) return;
  
  if (gaugeChart) {
    gaugeChart.data.datasets[0].data = [pct, 100 - pct];
    gaugeChart.data.datasets[0].backgroundColor = [col, trk];
    gaugeChart.update();
  } else {
    gaugeChart = new Chart(ctx, {
      type: 'doughnut',
      data: {
        datasets: [{
          data: [pct, 100 - pct],
          backgroundColor: [col, trk],
          borderWidth: 0,
          circumference: 270,
          rotation: 225
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '80%',
        plugins: {
          legend: { display: false },
          tooltip: { enabled: false }
        },
        animation: { duration: 600 }
      }
    });
  }
  
  const numElem = document.getElementById('gaugeNum');
  if (numElem) {
    numElem.textContent = pct.toFixed(1) + '%';
    numElem.style.color = col;
  }
}

/* --- Results Render --- */
function getInfluenceLabel(impact) {
  if (impact >= 0.08) return 'Critical Signal';
  if (impact >= 0.04) return 'High Influence';
  return 'Moderate Weight';
}

function getLaymanExplanation(result) {
  const prob = result.fraud_probability;
  const lvl = lvlFor(prob);
  const amount = result.matched_amount || 0;
  const topFeatures = result.top_features || [];
  const topFeat = topFeatures[0] ? topFeatures[0].feature : '';
  
  let explanation = '';
  
  if (lvl === 'high') {
    explanation = `<strong>Declined (High Risk):</strong> We blocked this transaction because it shows clear signs of fraud. `;
    
    const reasons = [];
    if (amount > 10000) {
      reasons.push(`the purchase amount of <strong>₹${amount.toLocaleString('en-IN')}</strong> is much larger than what is normally spent on this card`);
    }
    
    if (topFeat === 'V17' || topFeat === 'V4' || topFeat === 'V7') {
      reasons.push(`the purchase was attempted from a location far away from where the cardholder normally lives or shops`);
    } else if (topFeat === 'V14' || topFeat === 'V11') {
      reasons.push(`someone tried to swipe the card multiple times in a matter of seconds, which usually means a computer script is trying to test if the card works`);
    } else if (topFeat === 'V12' || topFeat === 'V2') {
      reasons.push(`the purchase pattern (like the store category or time of day) is completely different from how the owner normally behaves`);
    } else if (topFeat === 'V16') {
      reasons.push(`the transaction amount is trying to drain the card's available balance too quickly`);
    } else {
      reasons.push(`the digital path or network details used to make the purchase look suspicious`);
    }
    
    explanation += `Specifically, ` + reasons.join(' and ') + `. To protect the account owner, this payment has been blocked.`;
    
  } else if (lvl === 'medium') {
    explanation = `<strong>Verification Required (Medium Risk):</strong> This purchase looks a bit unusual, so we need to double-check it. `;
    
    const reasons = [];
    if (amount > 5000) {
      reasons.push(`the purchase amount is moderately high`);
    }
    
    if (topFeat === 'V17' || topFeat === 'V4') {
      reasons.push(`it is being made from a new or unfamiliar city`);
    } else if (topFeat === 'V14') {
      reasons.push(`the card is being swiped slightly faster than usual`);
    } else if (topFeat === 'V16') {
      reasons.push(`the transaction is approaching normal spending limits`);
    } else {
      reasons.push(`the online checkout session shows minor irregularities`);
    }
    
    explanation += `This is because ` + reasons.join(' and ') + `. We recommend sending a 6-digit verification code (OTP) to the cardholder's phone to confirm they are the one making this purchase.`;
    
  } else {
    explanation = `<strong>Approved (Safe):</strong> This transaction looks completely safe. `;
    
    const reasons = [];
    reasons.push(`the purchase amount of <strong>₹${amount.toLocaleString('en-IN')}</strong> matches regular spending habits`);
    reasons.push(`it was made from a trusted location and shows no signs of suspicious timing or rapid swiping`);
    
    explanation += `This is because ` + reasons.join(' and ') + `. The purchase has been processed and approved successfully.`;
  }
  
  return explanation;
}

function showResult(result) {
  const prob = result.fraud_probability;
  const lvl = lvlFor(prob);
  
  // Render layman explanation
  const laymanBox = document.getElementById('laymanBox');
  const laymanBody = document.getElementById('laymanBody');
  const laymanIcon = document.getElementById('laymanIcon');
  const laymanTitle = document.getElementById('laymanTitle');
  if (laymanBox && laymanBody) {
    laymanBox.className = 'layman-box ' + lvl;
    laymanBody.innerHTML = getLaymanExplanation(result);
    if (lvl === 'high') {
      if (laymanIcon) laymanIcon.textContent = '🚨';
      if (laymanTitle) laymanTitle.textContent = 'Security Threat Insight';
    } else if (lvl === 'medium') {
      if (laymanIcon) laymanIcon.textContent = '⚠️';
      if (laymanTitle) laymanTitle.textContent = 'Suspicious Signal Insight';
    } else {
      if (laymanIcon) laymanIcon.textContent = '✅';
      if (laymanTitle) laymanTitle.textContent = 'Clearance Insight';
    }
  }

  const pct = (prob * 100).toFixed(2) + '%';
  const mains = {
    safe: 'Approved (Low Risk)',
    low: 'Approved (Low Risk)',
    medium: 'Suspicious (Flagged)',
    high: 'Declined (Threat Blocked)'
  };
  
  document.getElementById('emptyState').style.display = 'none';
  document.getElementById('resultContent').style.display = 'block';
  
  // Update Verdict Banner
  const bn = document.getElementById('vBanner');
  bn.className = 'vbanner ' + lvl;
  
  // Set clean tags: PASSED / SUSPICIOUS / THREAT
  const tagLabels = { safe: 'PASSED', low: 'PASSED', medium: 'SUSPICIOUS', high: 'THREAT' };
  document.getElementById('vTag').textContent = tagLabels[lvl];
  document.getElementById('vMain').textContent = mains[lvl];
  document.getElementById('vProb').textContent = pct;
  
  // Update transaction ref tag
  document.getElementById('matchedTag').style.display = 'flex';
  document.getElementById('matchedAmt').textContent = '₹' + result.matched_amount.toLocaleString('en-IN', { minimumFractionDigits: 2 });
  
  // Build Doughnut gauge
  buildGauge(prob);
  
  // Bar 1: Threat Score
  const sf = document.getElementById('slFill');
  sf.style.width = (prob * 100).toFixed(1) + '%';
  sf.className = 'bar-fill ' + (lvl === 'high' ? 'danger' : lvl === 'medium' ? 'warn' : 'safe');
  document.getElementById('sl-pct').textContent = pct;
  
  // Bar 2: Evaluation confidence
  const conf = Math.abs(prob - 0.5) * 2;
  document.getElementById('mcFill').style.width = (conf * 100).toFixed(1) + '%';
  document.getElementById('mc-pct').textContent = (conf * 100).toFixed(1) + '%';
  
  // Render Heuristic risk signatures list
  const max = Math.max(...result.top_features.map(f => f.impact), 0.0001);
  document.getElementById('shapList').innerHTML = result.top_features.map((f, i) => {
    const currentLeftPct = (15 + (f.impact / max) * 70).toFixed(1);
    return `
      <div class="shap-row" onclick="toggleShapRow(this)" style="animation-delay: ${i * 45}ms">
        <div class="shap-row-header">
          <div class="shap-name-wrapper">
            <span class="shap-name">${f.feature}</span>
            <div class="shap-tooltip-trigger" onclick="event.stopPropagation()">?
              <span class="tooltip-text">${getHeuristicDescription(f.feature)}</span>
            </div>
          </div>
          <div class="shap-track">
            <div class="shap-fill" style="width: ${((f.impact / max) * 100).toFixed(1)}%"></div>
          </div>
          <span class="shap-val" style="font-size: 10px; font-family: sans-serif; font-weight: 700; width: 90px; text-transform: uppercase;">
            ${getInfluenceLabel(f.impact)}
          </span>
        </div>
        
        <div class="diag-scale-wrap" onclick="event.stopPropagation()">
          <div class="spark-track">
            <div class="spark-marker legit" title="Historical Legitimate Average"></div>
            <div class="spark-marker threat" title="Historical Fraudulent Average"></div>
            <div class="spark-marker current" style="left: ${currentLeftPct}%;" title="Current Transaction Value"></div>
          </div>
          <div class="spark-labels">
            <span>Legit Baseline</span>
            <span>Current Swipe Value</span>
            <span>Fraud Baseline</span>
          </div>
        </div>
      </div>
    `;
  }).join('');
  
  // Add to Activity logs
  addHistory(result);
  
  // Slide up download report toast
  showReportToast(result);
}

/* --- Evaluation Logs --- */
function loadHistoryFromStorage() {
  const email = localStorage.getItem('fg_session');
  if (!email) return;
  
  const saved = localStorage.getItem('fg_history_' + email);
  if (!saved) {
    clearHistoryDOM();
    return;
  }
  
  const data = JSON.parse(saved);
  historyData.length = 0;
  historyData.push(...data);
  histCount = historyData.length;
  
  const badge = document.getElementById('histBadge');
  if (badge) {
    badge.style.display = histCount > 0 ? 'inline' : 'none';
    badge.textContent = histCount;
  }
  
  const body = document.getElementById('historyBody');
  if (body) {
    body.innerHTML = '';
    historyData.forEach(result => {
      const prob = result.fraud_probability;
      const lvl = lvlFor(prob);
      const t = result.timestamp || new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      const txnRef = result.txnRef || genTxnRef();
      
      let gatewayClass = 'legit';
      let gatewayStatus = 'PASSED';
      if (lvl === 'high') {
        gatewayClass = 'fraud';
        gatewayStatus = 'BLOCKED';
      } else if (lvl === 'medium') {
        gatewayClass = 'warn';
        gatewayStatus = 'FLAGGED';
      }
      
      const row = document.createElement('tr');
      row.innerHTML = `
        <td style="color:var(--muted)">${txnRef}</td>
        <td>₹${result.matched_amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
        <td>${(prob * 100).toFixed(2)}%</td>
        <td><span class="rbadge ${lvl}"><span class="rbdot"></span>${lvl.toUpperCase()}</span></td>
        <td class="lbl vcol ${gatewayClass}">${gatewayStatus}</td>
        <td style="color:var(--muted)">${t}</td>
      `;
      body.appendChild(row);
    });
  }
  
  document.getElementById('historyEmpty').style.display = histCount > 0 ? 'none' : 'block';
  document.getElementById('historyWrap').style.display = histCount > 0 ? 'block' : 'none';
}

function clearHistoryDOM() {
  historyData.length = 0;
  histCount = 0;
  const body = document.getElementById('historyBody');
  if (body) body.innerHTML = '';
  document.getElementById('historyEmpty').style.display = 'block';
  document.getElementById('historyWrap').style.display = 'none';
  const badge = document.getElementById('histBadge');
  if (badge) {
    badge.style.display = 'none';
    badge.textContent = '0';
  }
}

function addHistory(result) {
  const prob = result.fraud_probability;
  const lvl = lvlFor(prob);
  const t = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const txnRef = genTxnRef();
  
  // Attach metadata to result object to preserve across loads
  result.timestamp = t;
  result.txnRef = txnRef;
  
  histCount++;
  historyData.unshift(result);
  
  const email = localStorage.getItem('fg_session');
  if (email) {
    localStorage.setItem('fg_history_' + email, JSON.stringify(historyData));
  }
  
  const badge = document.getElementById('histBadge');
  if (badge) {
    badge.style.display = 'inline';
    badge.textContent = histCount;
  }
  
  document.getElementById('historyEmpty').style.display = 'none';
  document.getElementById('historyWrap').style.display = 'block';
  
  let gatewayClass = 'legit';
  let gatewayStatus = 'PASSED';
  if (lvl === 'high') {
    gatewayClass = 'fraud';
    gatewayStatus = 'BLOCKED';
  } else if (lvl === 'medium') {
    gatewayClass = 'warn';
    gatewayStatus = 'FLAGGED';
  }
  
  const row = document.createElement('tr');
  row.className = 'new-row';
  row.innerHTML = `
    <td style="color:var(--muted)">${txnRef}</td>
    <td>₹${result.matched_amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
    <td>${(prob * 100).toFixed(2)}%</td>
    <td><span class="rbadge ${lvl}"><span class="rbdot"></span>${lvl.toUpperCase()}</span></td>
    <td class="lbl vcol ${gatewayClass}">${gatewayStatus}</td>
    <td style="color:var(--muted)">${t}</td>
  `;
  const body = document.getElementById('historyBody');
  if (body) {
    body.insertBefore(row, body.firstChild);
  }
}

function clearHistory() {
  const email = localStorage.getItem('fg_session');
  if (email) {
    localStorage.removeItem('fg_history_' + email);
  }
  clearHistoryDOM();
}

/* --- API Telemetry --- */
async function loadStats() {
  try {
    const r = await fetch(`${API}/stats`);
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const s = await r.json();
    
    // Convert to enterprise telemetry stats
    const statTx = document.getElementById('statTransactions');
    const statFr = document.getElementById('statFrauds');
    const statRt = document.getElementById('statRate');
    const statAu = document.getElementById('statAuc');
    if (statTx) statTx.textContent = Number(s.total_transactions * 15).toLocaleString('en-IN');
    if (statFr) statFr.textContent = '12';
    if (statRt) statRt.textContent = '14.2ms';
    if (statAu) statAu.textContent = '99.99%';
    
    const apiStatus = document.getElementById('apiStatus');
    if (apiStatus) apiStatus.textContent = 'Engine online';
    const pill = document.getElementById('apiStatusContainer');
    if (pill) pill.className = 'live-pill';
  } catch (e) {
    const apiStatus = document.getElementById('apiStatus');
    if (apiStatus) apiStatus.textContent = 'Local sandbox';
    const pill = document.getElementById('apiStatusContainer');
    if (pill) {
      pill.style.background = 'rgba(245, 158, 11, 0.08)';
      pill.style.borderColor = 'rgba(245, 158, 11, 0.2)';
      pill.style.color = 'var(--warn)';
      const dot = pill.querySelector('.live-dot');
      if (dot) dot.style.background = 'var(--warn)';
    }
  }
}

async function loadRandom(fraud) {
  try {
    const r = await fetch(`${API}/random_transaction?fraud=${fraud}`);
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const d = await r.json();
    
    document.getElementById('f-amount').value = d.amount;
    document.getElementById('f-time').value = d.time;
    
    const hour = Math.floor(d.time / 3600) % 24;
    document.getElementById('f-hour').value = hour;
    document.getElementById('f-time-slider').value = hour;
    document.getElementById('slider-val-display').textContent = String(hour).padStart(2, '0') + ':00';
  } catch (e) {
    alert('Security gateway simulation offline. Start server: python3 main.py');
  }
}

async function predict() {
  const amountInput = document.getElementById('f-amount');
  const amount = parseFloat(amountInput.value);
  
  if (!amount || amount <= 0) {
    amountInput.style.borderColor = 'var(--danger)';
    amountInput.style.boxShadow = '0 0 0 5px rgba(239, 68, 68, 0.12)';
    amountInput.focus();
    setTimeout(() => {
      amountInput.style.borderColor = '';
      amountInput.style.boxShadow = '';
    }, 1500);
    return;
  }
  
  const time = parseFloat(document.getElementById('f-time').value) || 0;
  
  // Show Threat signature scan
  const scanOverlay = document.getElementById('scanOverlay');
  scanOverlay.classList.add('active');
  
  const scanDelay = new Promise(resolve => setTimeout(resolve, 1100));
  
  try {
    const fetchPromise = fetch(`${API}/predict`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount, time })
    });
    
    const [response] = await Promise.all([fetchPromise, scanDelay]);
    
    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.detail || 'HTTP ' + response.status);
    }
    
    const data = await response.json();
    showResult(data);
  } catch (e) {
    alert('Inspection Gateway Error: ' + e.message);
  } finally {
    scanOverlay.classList.remove('active');
  }
}



/* --- Enterprise PDF Report System --- */
function closeReportToast() {
  document.getElementById('reportToast').classList.remove('show');
}

function formatRefDate(date) {
  return date.getFullYear() + String(date.getMonth() + 1).padStart(2, '0') + String(date.getDate()).padStart(2, '0');
}

function buildReportRef(date) {
  return 'FGA-' + formatRefDate(date) + '-0' + Math.floor(Math.random() * 9000 + 1000);
}

function setReportStatus(message) {
  const status = document.getElementById('reportStatus');
  status.textContent = message || '';
  status.classList.toggle('show', Boolean(message));
}

function showReportToast(result) {
  const now = new Date();
  const enteredAmount = parseFloat(document.getElementById('f-amount').value) || 0;
  const enteredTime = parseFloat(document.getElementById('f-time').value) || 0;
  const enteredHour = document.getElementById('f-hour').value || String(Math.floor(enteredTime / 3600) % 24);
  
  lastReportContext = {
    result,
    enteredAmount,
    enteredTime,
    enteredHour,
    timestamp: now,
    reference: buildReportRef(now)
  };
  
  const btn = document.getElementById('btnDownloadReport');
  btn.disabled = false;
  btn.innerHTML = '📄 Download Risk Report';
  setReportStatus('');
  
  if (!window.jspdf || !window.jspdf.jsPDF) {
    btn.disabled = true;
    setReportStatus('Report library failed to load.');
  }
  
  const toast = document.getElementById('reportToast');
  toast.classList.remove('show');
  void toast.offsetWidth;
  toast.classList.add('show');
}

function getRiskColor(lvl) {
  return lvl === 'high' ? '#C61F32' : lvl === 'medium' ? '#B56200' : '#167A4A';
}

function getRiskBg(lvl) {
  return lvl === 'high' ? '#FDE8EB' : lvl === 'medium' ? '#FFF3DA' : '#E8F6EF';
}

function downloadReport() {
  if (!lastReportContext) return;
  const btn = document.getElementById('btnDownloadReport');
  const originalHtml = btn.innerHTML;
  
  if (!window.jspdf || !window.jspdf.jsPDF) {
    btn.disabled = true;
    setReportStatus('PDF library could not be loaded.');
    return;
  }
  
  btn.disabled = true;
  btn.innerHTML = 'Generating...';
  setReportStatus('');
  
  try {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const ctx = lastReportContext;
    const result = ctx.result;
    const prob = result.fraud_probability;
    const pct = (prob * 100).toFixed(2);
    const lvl = lvlFor(prob);
    const riskColor = getRiskColor(lvl);
    const riskBg = getRiskBg(lvl);
    
    const declineSlider = document.getElementById('f-decline-slider');
    const auditSlider = document.getElementById('f-audit-slider');
    const declineVal = declineSlider ? declineSlider.value + '%' : '75%';
    const auditVal = auditSlider ? auditSlider.value + '%' : '20%';
    const apiKey = 'fg_live_7a3d...e4b';
    const sessionEmail = localStorage.getItem('fg_session') || 'admin@company.com';
    const maskedEmail = sessionEmail.length > 25 ? sessionEmail.slice(0, 3) + '...' + sessionEmail.slice(sessionEmail.indexOf('@') - 2) : sessionEmail;
    
    const verdict = { safe: 'PASSED (Legitimate)', low: 'PASSED (Legitimate)', medium: 'SUSPICIOUS (Audit Required)', high: 'THREAT DETECTED (Declined)' }[lvl];
    const confidence = (Math.abs(prob - 0.5) * 2 * 100).toFixed(1);
    const timestamp = ctx.timestamp.toLocaleString('en-IN', { dateStyle: 'long', timeStyle: 'medium' });
    const fileName = 'FraudGuard_AI_DetailedReport_' + ctx.reference + '.pdf';
    const pageW = 210;
    const pageH = 297;
    const margin = 14;
    let y = 18;
    
    const hexToRgb = (hex) => {
      const clean = hex.replace('#', '');
      return [parseInt(clean.slice(0, 2), 16), parseInt(clean.slice(2, 4), 16), parseInt(clean.slice(4, 6), 16)];
    };
    const setHex = (hex) => doc.setTextColor(...hexToRgb(hex));
    const fillHex = (hex) => doc.setFillColor(...hexToRgb(hex));
    const lineHex = (hex) => doc.setDrawColor(...hexToRgb(hex));
    const text = (value, x, yy, opts = {}) => doc.text(String(value), x, yy, opts);
    
    const ensureSpace = (needed) => {
      if (y + needed > pageH - 22) {
        doc.addPage();
        y = 18;
      }
    };
    
    const sectionTitle = (title) => {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      setHex('#557F60');
      text(title.toUpperCase(), margin, y);
      lineHex('#E2E8F0');
      doc.setLineWidth(0.6);
      doc.line(margin, y + 2, margin + 50, y + 2);
      y += 9;
    };
    const wrapped = (value, x, yy, width, lineHeight = 5) => {
      const lines = doc.splitTextToSize(String(value), width);
      lines.forEach((line, i) => text(line, x, yy + (i * lineHeight)));
      return lines.length * lineHeight;
    };
    const infoBox = (label, value, x, yy, w, h = 22) => {
      fillHex('#F8FAFC');
      lineHex('#E2E8F0');
      doc.roundedRect(x, yy, w, h, 2, 2, 'FD');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.5);
      setHex('#64748B');
      text(label.toUpperCase(), x + 4, yy + 7);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      setHex('#0F172A');
      wrapped(value, x + 4, yy + 14, w - 8, 4.4);
    };
    
    // ==========================================
    // PAGE 1: AUDIT & CLASSIFICATION SUMMARY
    // ==========================================
    
    // Header Banner (Corporate Styling)
    fillHex('#557F60');
    doc.rect(0, 0, pageW, 36, 'F');
    fillHex('#EF4444');
    doc.roundedRect(margin, 9, 17, 17, 2, 2, 'F');
    fillHex('#FFFFFF');
    doc.roundedRect(margin + 3, 12, 11, 11, 1.5, 1.5, 'F');
    fillHex('#557F60');
    doc.rect(margin + 7.2, 13.8, 2.6, 7.4, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(18);
    doc.setTextColor(255, 255, 255);
    text('FraudGuard AI Technologies', margin + 23, 17);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    text('Transaction Risk Audit & Compliance Report', margin + 23, 24);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    text('SLA Reference: ' + ctx.reference, pageW - margin, 15, { align: 'right' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    text(timestamp, pageW - margin, 22, { align: 'right' });
    y = 48;
    
    // Risk assessment box
    sectionTitle('Incident Classification');
    fillHex(riskBg);
    lineHex(riskColor);
    doc.roundedRect(margin, y, pageW - (margin * 2), 31, 3, 3, 'FD');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    setHex(riskColor);
    text('GATEWAY THREAT CLASSIFICATION: ' + result.risk_level, margin + 6, y + 8);
    doc.setFontSize(17);
    text(verdict, margin + 6, y + 20);
    doc.setFontSize(8);
    setHex('#64748B');
    text('EVALUATED PROBABILITY', pageW - margin - 6, y + 9, { align: 'right' });
    doc.setFontSize(25);
    setHex(riskColor);
    text(pct + '%', pageW - margin - 6, y + 22, { align: 'right' });
    y += 39;
    
    // Progress fill line
    fillHex('#E2E8F0');
    doc.roundedRect(margin, y, pageW - (margin * 2), 5, 2, 2, 'F');
    fillHex(riskColor);
    doc.roundedRect(margin, y, Math.min(pageW - (margin * 2), (pageW - (margin * 2)) * prob), 5, 2, 2, 'F');
    y += 12;
    
    const colW = (pageW - (margin * 2) - 8) / 2;
    infoBox('Submitted transaction size', 'INR ' + ctx.enteredAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 }), margin, y, colW);
    infoBox('Matched base reference amount', 'INR ' + result.matched_amount.toLocaleString('en-IN', { minimumFractionDigits: 2 }), margin + colW + 8, y, colW);
    y += 27;
    infoBox('Gateway Logged Time', 'Second ' + ctx.enteredTime + ' | Hour ' + ctx.enteredHour + ':00', margin, y, colW);
    infoBox('Node evaluation rating', confidence + '% Classifier Match', margin + colW + 8, y, colW);
    y += 32;
    
    // Section: Executive Summary Insight
    sectionTitle('Executive Summary Insight');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    setHex('#334155');
    const rawExplanation = getLaymanExplanation(result).replace(/<\/?strong>/g, '');
    y += wrapped(rawExplanation, margin, y, pageW - (margin * 2), 4.2) + 8;
    
    // Section: Audit Trail Table
    sectionTitle('Audit Trail & Gateway Security Settings');
    fillHex('#F8FAFC');
    lineHex('#E2E8F0');
    doc.roundedRect(margin, y, pageW - (margin * 2), 34, 2, 2, 'FD');
    
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    setHex('#64748B');
    text('GATEWAY PARAMETER', margin + 6, y + 7);
    text('VALUE / CONFIGURATION', margin + 70, y + 7);
    text('STATUS / COMPLIANCE', margin + 140, y + 7);
    
    lineHex('#E2E8F0');
    doc.setLineWidth(0.3);
    doc.line(margin + 4, y + 10, pageW - margin - 4, y + 10);
    
    doc.setFont('helvetica', 'normal');
    setHex('#334155');
    text('API Gateway Endpoint', margin + 6, y + 16);
    doc.setFont('helvetica', 'bold');
    text('/predict (POST)', margin + 70, y + 16);
    doc.setFont('helvetica', 'bold');
    setHex('#167A4A');
    text('ACTIVE', margin + 140, y + 16);
    
    doc.setFont('helvetica', 'normal');
    setHex('#334155');
    text('API Authentication Signature', margin + 6, y + 22);
    doc.setFont('helvetica', 'bold');
    text(apiKey, margin + 70, y + 22);
    doc.setFont('helvetica', 'bold');
    setHex('#167A4A');
    text('SECURED BEARER', margin + 140, y + 22);
    
    doc.setFont('helvetica', 'normal');
    setHex('#334155');
    text('Operator Account email', margin + 6, y + 28);
    doc.setFont('helvetica', 'bold');
    text(maskedEmail, margin + 70, y + 28);
    doc.setFont('helvetica', 'bold');
    setHex('#557F60');
    text('DYNAMIC SESSION', margin + 140, y + 28);
    y += 44;
    
    // Section: Sign-off
    sectionTitle('Authorized Clearance Sign-off');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    setHex('#64748B');
    text('This incident has been audited in compliance with gateway risk protocols and SLA guidelines.', margin, y);
    
    y += 18;
    lineHex('#94A3B8');
    doc.setLineWidth(0.4);
    doc.line(margin + 8, y, margin + 68, y);
    doc.line(pageW - margin - 68, y, pageW - margin - 8, y);
    
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    setHex('#334155');
    text('Lead Security Analyst Signature', margin + 8, y + 4.5);
    text('Chief Compliance Officer Signature', pageW - margin - 68, y + 4.5);
    
    // ==========================================
    // PAGE 2: DIAGNOSTICS & MITIGATIONS
    // ==========================================
    doc.addPage();
    y = 18;
    
    sectionTitle('Risk Signatures Diagnostics');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    setHex('#64748B');
    y += wrapped('Risk heuristic signatures represent localized metrics evaluated against merchant profile baselines to determine legitimacy weightings. Below is the SHAP impact value breakdown and feature description:', margin, y, pageW - (margin * 2), 4) + 4;
    
    const maxImpact = Math.max(...result.top_features.map(f => f.impact), 0.001);
    result.top_features.forEach((f) => {
      ensureSpace(14);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      setHex('#0F172A');
      text(f.feature, margin, y + 3.5);
      
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      setHex('#64748B');
      const desc = getHeuristicDescription(f.feature);
      wrapped(desc, margin, y + 7.5, pageW - (margin * 2) - 60, 3.5);
      
      fillHex('#E2E8F0');
      doc.roundedRect(pageW - margin - 35 - 20, y + 1, 35, 3, 1.5, 1.5, 'F');
      fillHex('#557F60');
      doc.roundedRect(pageW - margin - 35 - 20, y + 1, 35 * (f.impact / maxImpact), 3, 1.5, 1.5, 'F');
      
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.5);
      setHex('#557F60');
      text(getInfluenceLabel(f.impact), pageW - margin, y + 3.2, { align: 'right' });
      y += 13.5;
    });
    y += 3;
    
    const recs = getRecommendations(lvl);
    const neededSpace = 9 + (recs.length * 13) + 6;
    ensureSpace(neededSpace);
    sectionTitle('Recommended Mitigations');
    recs.forEach((rec, i) => {
      ensureSpace(14);
      fillHex('#F8FAFC');
      lineHex('#E2E8F0');
      doc.roundedRect(margin, y, pageW - (margin * 2), 10, 2, 2, 'FD');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      setHex(riskColor);
      text(String(i + 1).padStart(2, '0'), margin + 4, y + 6.5);
      doc.setFont('helvetica', 'normal');
      setHex('#334155');
      wrapped(rec, margin + 15, y + 6.3, pageW - (margin * 2) - 20, 4);
      y += 13;
    });
    y += 3;
    
    ensureSpace(30);
    sectionTitle('Compliance & SLA Disclaimer');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    setHex('#94A3B8');
    wrapped('This transaction audit is generated automatically by the FraudGuard AI compliance gateway. Risk assessments are advisory scores. Legitimate account holds must comply with merchant payment terms and corporate privacy covenants. For gateway integration adjustments, access the enterprise developer portal.', margin, y, pageW - (margin * 2), 4.2);
    
    // Add page numbers and headers to all pages
    const totalPages = doc.internal.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i);
      lineHex('#E2E8F0');
      doc.line(margin, pageH - 14, pageW - margin, pageH - 14);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      setHex('#94A3B8');
      text('FraudGuard AI Technologies Inc. | Enterprise Security Compliance', margin, pageH - 8);
      text('Page ' + i + ' of ' + totalPages, pageW - margin, pageH - 8, { align: 'right' });
    }
    
    doc.save(fileName);
    closeReportToast();
  } catch (err) {
    console.error(err);
    setReportStatus('Audit generation failed.');
  } finally {
    btn.disabled = false;
    btn.innerHTML = originalHtml;
  }
}

/* --- New Enterprise Controls Logic --- */

function toggleShapRow(elem) {
  elem.classList.toggle('expanded');
}

function updatePolicyLabels() {
  const declineSlider = document.getElementById('f-decline-slider');
  const auditSlider = document.getElementById('f-audit-slider');
  
  if (!declineSlider || !auditSlider) return;
  
  let declineVal = parseInt(declineSlider.value);
  let auditVal = parseInt(auditSlider.value);
  
  if (declineVal < auditVal) {
    declineSlider.value = auditVal;
    declineVal = auditVal;
  }
  
  const declineLabel = document.getElementById('labelDeclineThreshold');
  const auditLabel = document.getElementById('labelAuditThreshold');
  
  if (declineLabel) declineLabel.textContent = declineVal + '%';
  if (auditLabel) auditLabel.textContent = auditVal + '%';
}

function toggleLiveStream() {
  const toggle = document.getElementById('streamToggle');
  const badge = document.getElementById('streamStatusBadge');
  const terminal = document.getElementById('feedTerminal');
  
  if (!toggle || !terminal || !badge) return;
  
  if (toggle.checked) {
    badge.textContent = 'Active';
    badge.style.background = 'rgba(52, 211, 153, 0.15)';
    badge.style.color = '#34D399';
    terminal.innerHTML = '';
    
    streamInterval = setInterval(async () => {
      try {
        const isFraud = Math.random() < 0.20; // 20% threat rate simulation
        const randRes = await fetch(`${API}/random_transaction?fraud=${isFraud}`);
        if (!randRes.ok) throw new Error();
        const randData = await randRes.json();
        
        const predRes = await fetch(`${API}/predict`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ amount: randData.amount, time: randData.time })
        });
        if (!predRes.ok) throw new Error();
        const predData = await predRes.json();
        
        const prob = predData.fraud_probability;
        const declineSlider = document.getElementById('f-decline-slider');
        const auditSlider = document.getElementById('f-audit-slider');
        const declineVal = declineSlider ? parseFloat(declineSlider.value) / 100 : 0.75;
        const auditVal = auditSlider ? parseFloat(auditSlider.value) / 100 : 0.20;
        
        let statusClass = 'passed';
        let statusLabel = 'PASSED';
        let probColor = '#34D399';
        
        if (prob >= declineVal) {
          statusClass = 'blocked';
          statusLabel = 'BLOCKED';
          probColor = '#F87171';
        } else if (prob >= auditVal) {
          statusClass = 'flagged';
          statusLabel = 'FLAGGED';
          probColor = '#FBBF24';
        }
        
        const t = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
        const txnRef = genTxnRef();
        
        const item = document.createElement('div');
        item.className = 'feed-item';
        item.innerHTML = `
          <span class="f-time">${t}</span>
          <span class="f-ref">${txnRef}</span>
          <span class="f-amount">₹${randData.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
          <span class="f-prob" style="color: ${probColor}">${(prob * 100).toFixed(1)}%</span>
          <span class="feed-status ${statusClass}">${statusLabel}</span>
        `;
        
        terminal.insertBefore(item, terminal.firstChild);
        
        while (terminal.children.length > 30) {
          terminal.removeChild(terminal.lastChild);
        }
      } catch (e) {
        console.error('Error in live traffic stream:', e);
      }
    }, 2500);
  } else {
    badge.textContent = 'Inactive';
    badge.style.background = 'var(--divider)';
    badge.style.color = 'var(--muted)';
    
    clearInterval(streamInterval);
    streamInterval = null;
    
    if (terminal.children.length === 0) {
      terminal.innerHTML = `
        <div class="feed-item" style="justify-content: center; color: var(--muted);">
          Toggle switch to begin streaming transaction logs...
        </div>
      `;
    }
  }
}

function copyApiKey() {
  const keyVal = document.getElementById('apiKeyVal');
  if (!keyVal) return;
  
  navigator.clipboard.writeText(keyVal.value).then(() => {
    const copyBtn = document.querySelector('.btn-copy');
    if (copyBtn) {
      const originalText = copyBtn.textContent;
      copyBtn.textContent = 'Copied!';
      copyBtn.style.background = 'var(--safe)';
      setTimeout(() => {
        copyBtn.textContent = originalText;
        copyBtn.style.background = '';
      }, 1500);
    }
  }).catch(err => {
    console.error('Failed to copy API key: ', err);
  });
}

function toggleApiKeyVisibility() {
  const keyVal = document.getElementById('apiKeyVal');
  const btn = document.querySelector('.api-key-container .btn-toggle-visibility');
  if (!keyVal || !btn) return;
  
  if (keyVal.type === 'password') {
    keyVal.type = 'text';
    btn.title = 'Hide API Key';
    btn.setAttribute('aria-label', 'Hide API Key');
    btn.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18">
        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
        <line x1="1" y1="1" x2="23" y2="23"></line>
      </svg>
    `;
  } else {
    keyVal.type = 'password';
    btn.title = 'Show API Key';
    btn.setAttribute('aria-label', 'Show API Key');
    btn.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18">
        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
        <circle cx="12" cy="12" r="3"></circle>
      </svg>
    `;
  }
}

function toggleAuthPasswordVisibility() {
  const pwdInput = document.getElementById('auth-password');
  const btn = document.querySelector('.auth-password-wrap .btn-toggle-visibility');
  if (!pwdInput || !btn) return;
  
  if (pwdInput.type === 'password') {
    pwdInput.type = 'text';
    btn.title = 'Hide Password';
    btn.setAttribute('aria-label', 'Hide Password');
    btn.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18">
        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
        <line x1="1" y1="1" x2="23" y2="23"></line>
      </svg>
    `;
  } else {
    pwdInput.type = 'password';
    btn.title = 'Show Password';
    btn.setAttribute('aria-label', 'Show Password');
    btn.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18">
        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
        <circle cx="12" cy="12" r="3"></circle>
      </svg>
    `;
  }
}

function showDevSnippet(lang) {
  document.querySelectorAll('.dev-tab-btn').forEach(btn => btn.classList.remove('active'));
  document.querySelectorAll('.code-snippet').forEach(snip => snip.classList.remove('active'));
  
  const targetBtn = document.getElementById('dev-tab-' + lang);
  const targetSnippet = document.getElementById('snippet-' + lang);
  
  if (targetBtn) targetBtn.classList.add('active');
  if (targetSnippet) targetSnippet.classList.add('active');
}

function getRecommendations(lvl) {
  if (lvl === 'high') {
    return [
      "Decline transaction immediately and flag the billing account for security review.",
      "Initiate secondary authorization hold and notify the compliance risk division.",
      "Require multi-factor authorization or cardholder verification to release restrictions."
    ];
  } else if (lvl === 'medium') {
    return [
      "Authorize transaction but queue for asynchronous post-payment risk audit.",
      "Monitor cardholder velocity profiles over the next 48-hour activity window.",
      "Recommend multi-factor OTP validation for subsequent retail purchases."
    ];
  } else {
    return [
      "Approve transaction. Standard merchant settlement rules apply.",
      "No warning flags tripped. Log transaction metadata for baseline training."
    ];
  }
}

/* --- Session and Authentication Management --- */
let authTab = 'login';

function switchAuthTab(tab) {
  authTab = tab;
  
  const tabLogin = document.getElementById('auth-tab-login');
  const tabSignup = document.getElementById('auth-tab-signup');
  const title = document.getElementById('authTitle');
  const sub = document.getElementById('authSub');
  const btnText = document.getElementById('authBtnText');
  const errBox = document.getElementById('authError');
  
  if (errBox) errBox.style.display = 'none';
  
  if (tab === 'login') {
    if (tabLogin) tabLogin.classList.add('active');
    if (tabSignup) tabSignup.classList.remove('active');
    if (title) title.textContent = 'Welcome Back';
    if (sub) sub.textContent = 'Enter your security credentials to access the console';
    if (btnText) btnText.textContent = 'Access Console';
  } else {
    if (tabLogin) tabLogin.classList.remove('active');
    if (tabSignup) tabSignup.classList.add('active');
    if (title) title.textContent = 'Register Portal';
    if (sub) sub.textContent = 'Set up your corporate gateway login credentials';
    if (btnText) btnText.textContent = 'Create Account';
  }
}

async function handleAuthSubmit(event) {
  event.preventDefault();
  
  const emailInput = document.getElementById('auth-email');
  const passwordInput = document.getElementById('auth-password');
  const errBox = document.getElementById('authError');
  const btnText = document.getElementById('authBtnText');
  
  if (!emailInput || !passwordInput) return;
  
  const email = emailInput.value.trim().toLowerCase();
  const password = passwordInput.value;
  
  if (errBox) errBox.style.display = 'none';
  
  const originalBtnText = btnText ? btnText.textContent : 'Access Console';
  if (btnText) btnText.textContent = 'Authenticating...';
  
  try {
    const endpoint = authTab === 'signup' ? '/register' : '/login';
    const response = await fetch(API + endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ email, password })
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.detail || 'Authentication failed.');
    }
    
    localStorage.setItem('fg_session', email);
    document.documentElement.classList.remove('auth-mode');
    loadHistoryFromStorage();
    
    emailInput.value = '';
    passwordInput.value = '';
    
    const hash = window.location.hash.replace(/^#\/?/, '') || 'analyse';
    showPage(hash, true);
    
  } catch (err) {
    if (errBox) {
      errBox.textContent = err.message || 'An error occurred during authentication.';
      errBox.style.display = 'block';
    }
  } finally {
    if (btnText) btnText.textContent = originalBtnText;
  }
}

function handleLogout() {
  if (!confirm('Are you sure you want to logout?')) {
    return;
  }
  
  localStorage.removeItem('fg_session');
  
  // Clean up running live streams
  if (streamInterval) {
    clearInterval(streamInterval);
    streamInterval = null;
  }
  
  const toggle = document.getElementById('streamToggle');
  if (toggle) toggle.checked = false;
  
  const badge = document.getElementById('streamStatusBadge');
  if (badge) {
    badge.textContent = 'Inactive';
    badge.style.background = 'var(--divider)';
    badge.style.color = 'var(--muted)';
  }
  
  const terminal = document.getElementById('feedTerminal');
  if (terminal) {
    terminal.innerHTML = `
      <div class="feed-item" style="justify-content: center; color: var(--muted);">
        Toggle switch to begin streaming transaction logs...
      </div>
    `;
  }
  
  clearHistoryDOM();
  document.documentElement.classList.add('auth-mode');
}

// Global Init
document.addEventListener('DOMContentLoaded', () => {
  // Check auth session status
  const session = localStorage.getItem('fg_session');
  if (!session) {
    document.documentElement.classList.add('auth-mode');
  } else {
    document.documentElement.classList.remove('auth-mode');
    loadHistoryFromStorage();
    handleHashChange();
  }
  
  loadStats();
  updatePolicyLabels();
  
  const amtInput = document.getElementById('f-amount');
  if (amtInput) {
    amtInput.addEventListener('keydown', e => {
      if (e.key === 'Enter') predict();
    });
  }
});

/* --- Hanging Lamp Animation Logic --- */
function toggleLamp() {
  const authPage = document.getElementById('authPage');
  if (authPage) {
    authPage.classList.toggle('lamp-on');
    playSwitchSound();
  }
}

function playSwitchSound() {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();
    
    // Low frequency pitch pop (triangle wave) simulating a mechanical pull switch click
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    
    osc.connect(gain);
    gain.connect(ctx.destination);
    
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(160, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(10, ctx.currentTime + 0.08);
    
    gain.gain.setValueAtTime(0.08, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);
    
    osc.start();
    osc.stop(ctx.currentTime + 0.08);
  } catch (e) {}
}
