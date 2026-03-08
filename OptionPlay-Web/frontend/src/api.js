const API_BASE = '/api';

// ── Admin auth helper ──

function adminHeaders() {
    return {
        'Content-Type': 'application/json',
        'X-Admin-Key': import.meta.env.VITE_ADMIN_KEY || '',
    };
}

function adminGetHeaders() {
    return {
        'X-Admin-Key': import.meta.env.VITE_ADMIN_KEY || '',
    };
}

// ── General API (no auth required) ──

export async function fetchVix() {
    const res = await fetch(`${API_BASE}/vix`);
    if (!res.ok) throw new Error('Failed to fetch VIX');
    return res.text();
}

export async function fetchQuote(symbol) {
    const res = await fetch(`${API_BASE}/quote/${symbol}`);
    if (!res.ok) throw new Error(`Failed to fetch quote for ${symbol}`);
    return res.text();
}

export async function fetchAnalysis(symbol) {
    const res = await fetch(`${API_BASE}/analyze/${symbol}`);
    if (!res.ok) throw new Error(`Failed to fetch analysis for ${symbol}`);
    return res.text();
}

export async function runScan(criteria = {}) {
    const res = await fetch(`${API_BASE}/scan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(criteria),
    });
    if (!res.ok) throw new Error('Scan failed');
    return res.text();
}

// ── JSON API (structured data, no auth required) ──

export async function fetchVixJson() {
    const res = await fetch(`${API_BASE}/json/vix`);
    if (!res.ok) throw new Error('Failed to fetch VIX JSON');
    return res.json();
}

export async function fetchQuotesJson(symbols) {
    const res = await fetch(`${API_BASE}/json/quotes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbols }),
    });
    if (!res.ok) throw new Error('Failed to fetch quotes');
    return res.json();
}

export async function runScanJson(criteria = {}) {
    const res = await fetch(`${API_BASE}/json/scan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(criteria),
    });
    if (!res.ok) throw new Error('Scan failed');
    return res.json();
}

export async function fetchAnalysisJson(symbol) {
    const res = await fetch(`${API_BASE}/json/analyze/${encodeURIComponent(symbol)}`);
    if (!res.ok) throw new Error(`Failed to fetch analysis for ${symbol}`);
    return res.json();
}

export async function fetchPortfolioPositions(status = 'all') {
    const res = await fetch(`${API_BASE}/json/portfolio/positions?status=${encodeURIComponent(status)}`);
    if (!res.ok) throw new Error('Failed to fetch portfolio positions');
    return res.json();
}

export async function fetchPortfolioSummary() {
    const res = await fetch(`${API_BASE}/json/portfolio/summary`);
    if (!res.ok) throw new Error('Failed to fetch portfolio summary');
    return res.json();
}

// ── Dashboard Market Overview API ──

export async function fetchEventsJson(days = 30) {
    const res = await fetch(`${API_BASE}/json/events?days=${days}`);
    if (!res.ok) throw new Error('Failed to fetch events');
    return res.json();
}

export async function fetchSectorsJson() {
    const res = await fetch(`${API_BASE}/json/sectors`);
    if (!res.ok) throw new Error('Failed to fetch sectors');
    return res.json();
}

export async function fetchEarningsCalendarJson(count = 5) {
    const res = await fetch(`${API_BASE}/json/earnings-calendar?count=${count}`);
    if (!res.ok) throw new Error('Failed to fetch earnings calendar');
    return res.json();
}

export async function fetchMarketNewsJson(count = 5) {
    const res = await fetch(`${API_BASE}/json/market-news?count=${count}`);
    if (!res.ok) throw new Error('Failed to fetch market news');
    return res.json();
}

// Shadow Trade Logging
export async function logShadowTrade(tradeData) {
    const res = await fetch(`${API_BASE}/json/shadow-log`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(tradeData),
    });
    if (!res.ok) throw new Error('Failed to log shadow trade');
    return res.json();
}

// ── Admin API (auth required) ──

export async function fetchConfigFiles() {
    const res = await fetch(`${API_BASE}/admin/files`, { headers: adminGetHeaders() });
    if (!res.ok) throw new Error('Failed to fetch config files');
    return res.json();
}

export async function fetchConfig(fileKey) {
    const res = await fetch(`${API_BASE}/admin/${fileKey}`, { headers: adminGetHeaders() });
    if (!res.ok) throw new Error(`Failed to fetch config: ${fileKey}`);
    return res.json();
}

export async function saveConfig(fileKey, content) {
    const res = await fetch(`${API_BASE}/admin/${fileKey}`, {
        method: 'POST',
        headers: adminHeaders(),
        body: JSON.stringify({ content }),
    });
    if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Failed to save');
    }
    return res.json();
}

// DB Update API
export async function runDbUpdate(steps = ['vix', 'options', 'ohlcv'], dryRun = false) {
    const res = await fetch(`${API_BASE}/admin/db-update`, {
        method: 'POST',
        headers: adminHeaders(),
        body: JSON.stringify({ steps, dry_run: dryRun }),
    });
    if (!res.ok) throw new Error('DB update request failed');
    return res.json();
}

export async function fetchDbStatus() {
    const res = await fetch(`${API_BASE}/admin/db-status`, { headers: adminGetHeaders() });
    if (!res.ok) throw new Error('Failed to fetch DB status');
    return res.json();
}

export async function fetchDbCoverage() {
    const res = await fetch(`${API_BASE}/admin/db-coverage`, { headers: adminGetHeaders() });
    if (!res.ok) throw new Error('Failed to fetch DB coverage');
    return res.json();
}

export async function runFundamentalsUpdate(mode = 'full') {
    const res = await fetch(`${API_BASE}/admin/fundamentals-update`, {
        method: 'POST',
        headers: adminHeaders(),
        body: JSON.stringify({ mode }),
    });
    if (!res.ok) throw new Error('Fundamentals update request failed');
    return res.json();
}
