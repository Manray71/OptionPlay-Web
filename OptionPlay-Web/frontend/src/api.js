const API_BASE = '/api';

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

// Admin API
export async function fetchConfigFiles() {
    const res = await fetch(`${API_BASE}/admin/files`);
    if (!res.ok) throw new Error('Failed to fetch config files');
    return res.json();
}

export async function fetchConfig(fileKey) {
    const res = await fetch(`${API_BASE}/admin/${fileKey}`);
    if (!res.ok) throw new Error(`Failed to fetch config: ${fileKey}`);
    return res.json();
}

export async function saveConfig(fileKey, content) {
    const res = await fetch(`${API_BASE}/admin/${fileKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ steps, dry_run: dryRun }),
    });
    if (!res.ok) throw new Error('DB update request failed');
    return res.json();
}

export async function fetchDbStatus() {
    const res = await fetch(`${API_BASE}/admin/db-status`);
    if (!res.ok) throw new Error('Failed to fetch DB status');
    return res.json();
}
