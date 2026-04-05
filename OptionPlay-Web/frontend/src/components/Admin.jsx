import { useState, useEffect } from 'react';
import { Settings, Save, RotateCcw, FileText, CheckCircle, AlertCircle, Database, Play, Terminal, ChevronDown, RefreshCw, TrendingUp } from 'lucide-react';
import { fetchConfig, saveConfig, runDbUpdate, fetchDbCoverage, runFundamentalsUpdate } from '../api';

const CONFIG_TABS = [
    { key: 'weights', label: 'Scoring Weights', desc: 'Strategy weights, sector factors, regime overrides' },
    { key: 'thresholds', label: 'Thresholds', desc: 'Technical indicator thresholds per strategy' },
    { key: 'scanner', label: 'Scanner', desc: 'Scan filters, stability tiers, output limits' },
    { key: 'strategies', label: 'Strategies', desc: 'VIX profiles, exit/roll logic, trained weights' },
    { key: 'rules', label: 'Trading Rules', desc: 'Entry, spread, VIX regime, risk management' },
    { key: 'settings', label: 'Settings', desc: 'Data sources, API, performance, infrastructure' },
];

const DB_STEPS = [
    { id: 'vix', label: 'VIX Data', desc: 'Historical VIX levels' },
    { id: 'options', label: 'Options Chains', desc: 'Greeks & IV via IBKR' },
    { id: 'ohlcv', label: 'OHLCV Prices', desc: 'Daily candlestick data' },
];

const FUND_MODES = [
    { value: 'full', label: 'Full Update', desc: 'yfinance + stability + earnings' },
    { value: 'yfinance-only', label: 'yfinance Only', desc: 'Sector, beta, analyst ratings' },
    { value: 'stability-only', label: 'Stability Only', desc: 'Recalculate stability scores' },
    { value: 'earnings-only', label: 'Earnings Only', desc: 'Earnings beat rate' },
    { value: 'proxy-stability', label: 'Proxy Stability', desc: 'Fill missing scores via beta/HV' },
];

const BADGE_CLASS = { green: 'badge badge-green', amber: 'badge badge-amber', red: 'badge badge-red' };

// ──────────────────────────────────────────────────────────
// Coverage card for a single data type
// ──────────────────────────────────────────────────────────

function CoverageCard({ label, data }) {
    if (!data) return null;
    const badgeClass = BADGE_CLASS[data.badge] || 'badge badge-amber';
    const staleLabel = data.days_stale == null
        ? (data.future_events != null ? `${data.future_events} future` : '—')
        : data.days_stale === 0 ? 'today' : `${data.days_stale}d ago`;

    return (
        <div className="stat-card" style={{ padding: '12px 14px' }}>
            <div className="stat-label">{label}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
                <span className={badgeClass}>{staleLabel}</span>
                {data.last_date && (
                    <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: "'JetBrains Mono', monospace" }}>
                        {data.last_date}
                    </span>
                )}
            </div>
            <div style={{ display: 'flex', gap: 12, marginTop: 6, flexWrap: 'wrap' }}>
                {data.row_count != null && (
                    <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                        {data.row_count.toLocaleString()} rows
                    </span>
                )}
                {data.symbol_count != null && (
                    <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                        {data.symbol_count} symbols
                    </span>
                )}
                {data.greeks_count != null && (
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                        {data.greeks_count.toLocaleString()} greeks
                    </span>
                )}
                {data.future_symbols != null && (
                    <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                        {data.future_symbols} with upcoming
                    </span>
                )}
            </div>
        </div>
    );
}

// ──────────────────────────────────────────────────────────
// Collapsible header
// ──────────────────────────────────────────────────────────

function CollapsibleHeader({ icon, title, right, collapsed, onToggle }) {
    return (
        <button className="card-header-toggle" onClick={onToggle} type="button">
            <div className="header-left">
                <h3>{icon} {title}</h3>
            </div>
            <div className="header-right">
                {right}
                <ChevronDown size={16} className={`chevron${collapsed ? ' collapsed' : ''}`} />
            </div>
        </button>
    );
}

// ──────────────────────────────────────────────────────────
// Skeleton
// ──────────────────────────────────────────────────────────

function AdminSkeleton() {
    return (
        <>
            {/* DB Update panel skeleton */}
            <div className="skeleton-card analysis-section fade-in">
                <div className="skeleton skeleton-title" />
                <div className="skeleton skeleton-line w-80" />
                <div className="skeleton skeleton-line w-60" />
                <div className="skeleton skeleton-line w-40" />
            </div>
            {/* Tab bar skeleton */}
            <div className="skeleton-card analysis-section fade-in" style={{ animationDelay: '0.05s' }}>
                <div style={{ display: 'flex', gap: 8 }}>
                    {[0, 1, 2, 3, 4, 5].map(i => (
                        <div key={i} className="skeleton" style={{ height: 32, width: 100, borderRadius: 'var(--radius-xs)' }} />
                    ))}
                </div>
            </div>
            {/* Editor card skeleton */}
            <div className="skeleton-card fade-in" style={{ animationDelay: '0.1s' }}>
                <div className="skeleton skeleton-title" />
                <div className="skeleton" style={{ height: 300, borderRadius: 'var(--radius-xs)' }} />
            </div>
        </>
    );
}

// ──────────────────────────────────────────────────────────
// Main Component
// ──────────────────────────────────────────────────────────

export default function Admin() {
    const [activeTab, setActiveTab] = useState('weights');
    const [content, setContent] = useState('');
    const [filename, setFilename] = useState('');
    const [configLoading, setConfigLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [status, setStatus] = useState(null);
    const [dirty, setDirty] = useState(false);

    // Page-level loading skeleton
    const [loading, setLoading] = useState(true);
    const [collapsed, setCollapsed] = useState({});

    // DB Update state
    const [dbSteps, setDbSteps] = useState(['vix', 'options', 'ohlcv']);
    const [dbDryRun, setDbDryRun] = useState(false);
    const [dbRunning, setDbRunning] = useState(false);
    const [dbResult, setDbResult] = useState(null);

    // Coverage state
    const [coverage, setCoverage] = useState(null);
    const [coverageLoading, setCoverageLoading] = useState(false);
    const [coverageError, setCoverageError] = useState(null);

    // Fundamentals update state
    const [fundMode, setFundMode] = useState('full');
    const [fundRunning, setFundRunning] = useState(false);
    const [fundResult, setFundResult] = useState(null);

    useEffect(() => {
        const timer = setTimeout(() => setLoading(false), 800);
        loadCoverage();
        return () => clearTimeout(timer);
    }, []);

    useEffect(() => {
        loadConfig(activeTab);
    }, [activeTab]);

    const toggleSection = (id) => setCollapsed(prev => ({ ...prev, [id]: !prev[id] }));

    const loadCoverage = async () => {
        setCoverageLoading(true);
        setCoverageError(null);
        try {
            const data = await fetchDbCoverage();
            setCoverage(data);
        } catch (err) {
            setCoverageError(err.message);
        }
        setCoverageLoading(false);
    };

    const loadConfig = async (key) => {
        setConfigLoading(true);
        setStatus(null);
        setDirty(false);
        try {
            const data = await fetchConfig(key);
            setContent(data.content);
            setFilename(data.filename);
        } catch (_err) {
            setContent(`# ${CONFIG_TABS.find(t => t.key === key)?.label || key}\n# Backend not connected — showing placeholder\n# Start the backend with: uvicorn backend.main:app --reload\n`);
            setFilename(`${key}.yaml`);
            setStatus({ type: 'error', message: 'Backend not connected. Start it to load real config.' });
        }
        setConfigLoading(false);
    };

    const handleSave = async () => {
        setSaving(true);
        setStatus(null);
        try {
            await saveConfig(activeTab, content);
            setStatus({ type: 'success', message: `Saved & reloaded ${filename} successfully!` });
            setDirty(false);
        } catch (err) {
            setStatus({ type: 'error', message: err.message });
        }
        setSaving(false);
    };

    const handleReset = () => {
        loadConfig(activeTab);
    };

    const toggleStep = (stepId) => {
        setDbSteps(prev =>
            prev.includes(stepId) ? prev.filter(s => s !== stepId) : [...prev, stepId]
        );
    };

    const handleDbUpdate = async () => {
        setDbRunning(true);
        setDbResult(null);
        try {
            const result = await runDbUpdate(dbSteps, dbDryRun);
            setDbResult(result);
            if (result.status === 'completed') await loadCoverage();
        } catch (err) {
            setDbResult({ status: 'error', stderr: err.message });
        }
        setDbRunning(false);
    };

    const handleFundamentalsUpdate = async () => {
        setFundRunning(true);
        setFundResult(null);
        try {
            const result = await runFundamentalsUpdate(fundMode);
            setFundResult(result);
            if (result.status === 'completed') await loadCoverage();
        } catch (err) {
            setFundResult({ status: 'error', stderr: err.message });
        }
        setFundRunning(false);
    };

    return (
        <>
            <div className="page-header">
                <h2>Admin — Configuration & Tools</h2>
                <p>Edit scoring weights, thresholds, trading rules, and run maintenance tasks.</p>
            </div>

            <div className="page-content">
                {loading && <AdminSkeleton />}

                {!loading && (
                    <>
                        {/* ============ DB UPDATE PANEL ============ */}
                        <div className="card analysis-section fade-in">
                            <CollapsibleHeader
                                icon={<Database size={14} style={{ verticalAlign: 'middle' }} />}
                                title="Database Update"
                                right={
                                    <button
                                        className="btn btn-secondary"
                                        onClick={(e) => { e.stopPropagation(); loadCoverage(); }}
                                        disabled={coverageLoading}
                                        style={{ padding: '4px 10px', fontSize: 12 }}
                                        title="Refresh coverage stats"
                                    >
                                        <RefreshCw size={12} className={coverageLoading ? 'spinning' : ''} />
                                        Refresh
                                    </button>
                                }
                                collapsed={collapsed.dbUpdate}
                                onToggle={() => toggleSection('dbUpdate')}
                            />
                            <div className={`card-body-collapsible${collapsed.dbUpdate ? ' collapsed' : ''}`}>
                                <div className="card-body">

                                    {/* === Coverage Grid === */}
                                    <div style={{ marginBottom: 20 }}>
                                        <div className="form-label" style={{ marginBottom: 10 }}>Data Coverage</div>
                                        {coverageLoading && !coverage && (
                                            <div className="coverage-grid">
                                                {[0, 1, 2, 3, 4].map(i => (
                                                    <div key={i} className="skeleton" style={{ height: 80, borderRadius: 'var(--radius-xs)' }} />
                                                ))}
                                            </div>
                                        )}
                                        {coverageError && !coverage && (
                                            <div className="admin-status-msg error">
                                                <AlertCircle size={14} /> Coverage unavailable: {coverageError}
                                            </div>
                                        )}
                                        {coverage && (
                                            <div className="coverage-grid">
                                                <CoverageCard label="VIX" data={coverage.tables?.vix} />
                                                <CoverageCard label="Options" data={coverage.tables?.options} />
                                                <CoverageCard label="OHLCV" data={coverage.tables?.ohlcv} />
                                                <CoverageCard label="Fundamentals" data={coverage.tables?.fundamentals} />
                                                <CoverageCard label="Earnings" data={coverage.tables?.earnings} />
                                            </div>
                                        )}
                                    </div>

                                    {/* === DB Update (VIX / Options / OHLCV) === */}
                                    <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: 16, marginBottom: 16 }}>
                                        <div className="form-label" style={{ marginBottom: 10 }}>Run DB Update (VIX / Options / OHLCV)</div>
                                        <div className="admin-db-layout">
                                            <div style={{ flex: 1, minWidth: 200 }}>
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                                    {DB_STEPS.map((step) => (
                                                        <label key={step.id} className="admin-step-label">
                                                            <input
                                                                type="checkbox"
                                                                checked={dbSteps.includes(step.id)}
                                                                onChange={() => toggleStep(step.id)}
                                                            />
                                                            <span style={{ fontWeight: 500 }}>{step.label}</span>
                                                            <span className="admin-step-meta">— {step.desc}</span>
                                                        </label>
                                                    ))}
                                                </div>
                                            </div>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'flex-end' }}>
                                                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}>
                                                    <input
                                                        type="checkbox"
                                                        checked={dbDryRun}
                                                        onChange={(e) => setDbDryRun(e.target.checked)}
                                                        style={{ accentColor: 'var(--amber)', width: 16, height: 16 }}
                                                    />
                                                    <span>Dry Run</span>
                                                </label>
                                                <button
                                                    className="btn btn-primary"
                                                    onClick={handleDbUpdate}
                                                    disabled={dbRunning || dbSteps.length === 0}
                                                    style={{ minWidth: 160 }}
                                                >
                                                    {dbRunning ? (
                                                        <>
                                                            <div className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} />
                                                            Running...
                                                        </>
                                                    ) : (
                                                        <>
                                                            <Play size={14} />
                                                            Run DB Update
                                                        </>
                                                    )}
                                                </button>
                                            </div>
                                        </div>

                                        {/* DB Update Result */}
                                        {dbResult && (
                                            <div style={{ marginTop: 16 }}>
                                                <div className={`admin-status-msg ${dbResult.status === 'completed' ? 'success' : 'error'}`}>
                                                    {dbResult.status === 'completed' ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
                                                    DB Update {dbResult.status}
                                                </div>
                                                {(dbResult.stdout || dbResult.stderr) && (
                                                    <div className="admin-output-panel">
                                                        <Terminal size={12} style={{ marginRight: 6, verticalAlign: 'middle', opacity: 0.5 }} />
                                                        Output:
                                                        {'\n'}{dbResult.stdout}
                                                        {dbResult.stderr && <span style={{ color: 'var(--red)' }}>{'\n'}Errors:{'\n'}{dbResult.stderr}</span>}
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>

                                    {/* === Fundamentals Update === */}
                                    <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: 16 }}>
                                        <div className="form-label" style={{ marginBottom: 10 }}>Run Fundamentals Update</div>
                                        <div className="admin-db-layout">
                                            <div style={{ flex: 1, minWidth: 200 }}>
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                                    {FUND_MODES.map(opt => (
                                                        <label key={opt.value} className="admin-step-label">
                                                            <input
                                                                type="radio"
                                                                name="fundMode"
                                                                value={opt.value}
                                                                checked={fundMode === opt.value}
                                                                onChange={() => setFundMode(opt.value)}
                                                                style={{ accentColor: 'var(--indigo)', width: 16, height: 16 }}
                                                            />
                                                            <span style={{ fontWeight: 500 }}>{opt.label}</span>
                                                            <span className="admin-step-meta">— {opt.desc}</span>
                                                        </label>
                                                    ))}
                                                </div>
                                            </div>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'flex-end' }}>
                                                <button
                                                    className="btn btn-primary"
                                                    onClick={handleFundamentalsUpdate}
                                                    disabled={fundRunning}
                                                    style={{ minWidth: 180 }}
                                                >
                                                    {fundRunning ? (
                                                        <>
                                                            <div className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} />
                                                            Running...
                                                        </>
                                                    ) : (
                                                        <>
                                                            <TrendingUp size={14} />
                                                            Update Fundamentals
                                                        </>
                                                    )}
                                                </button>
                                            </div>
                                        </div>

                                        {/* Fundamentals Result */}
                                        {fundResult && (
                                            <div style={{ marginTop: 16 }}>
                                                <div className={`admin-status-msg ${fundResult.status === 'completed' ? 'success' : 'error'}`}>
                                                    {fundResult.status === 'completed' ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
                                                    Fundamentals Update {fundResult.status}
                                                </div>
                                                {(fundResult.stdout || fundResult.stderr) && (
                                                    <div className="admin-output-panel">
                                                        <Terminal size={12} style={{ marginRight: 6, verticalAlign: 'middle', opacity: 0.5 }} />
                                                        Output:
                                                        {'\n'}{fundResult.stdout}
                                                        {fundResult.stderr && <span style={{ color: 'var(--red)' }}>{'\n'}Errors:{'\n'}{fundResult.stderr}</span>}
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>

                                </div>
                            </div>
                        </div>

                        {/* ============ CONFIG EDITOR ============ */}
                        {/* Tab Bar */}
                        <div className="tabs analysis-section fade-in" style={{ animationDelay: '0.05s' }}>
                            {CONFIG_TABS.map((tab) => (
                                <button
                                    key={tab.key}
                                    className={`tab ${activeTab === tab.key ? 'active' : ''}`}
                                    onClick={() => setActiveTab(tab.key)}
                                >
                                    {tab.label}
                                </button>
                            ))}
                        </div>

                        {/* Config Description */}
                        <div className="card analysis-section fade-in" style={{ animationDelay: '0.1s' }}>
                            <div className="card-body" style={{ padding: '12px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                    <FileText size={16} style={{ color: 'var(--text-accent)' }} />
                                    <div>
                                        <span style={{ fontWeight: 600, marginRight: 8 }}>{filename}</span>
                                        <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                                            {CONFIG_TABS.find(t => t.key === activeTab)?.desc}
                                        </span>
                                    </div>
                                </div>
                                <div style={{ display: 'flex', gap: 8 }}>
                                    <button className="btn btn-secondary" onClick={handleReset} disabled={configLoading}>
                                        <RotateCcw size={14} />
                                        Reset
                                    </button>
                                    <button
                                        className={`btn ${dirty ? 'btn-success pulse' : 'btn-primary'}`}
                                        onClick={handleSave}
                                        disabled={saving || configLoading}
                                    >
                                        {saving ? <div className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} /> : <Save size={14} />}
                                        {dirty ? 'Save & Reload' : 'Save'}
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* Status Message */}
                        {status && (
                            <div className={`admin-status-msg ${status.type} analysis-section fade-in`}>
                                {status.type === 'success' ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
                                {status.message}
                            </div>
                        )}

                        {/* YAML Editor */}
                        <div className="card fade-in" style={{ animationDelay: '0.15s' }}>
                            <CollapsibleHeader
                                icon={<Settings size={14} style={{ verticalAlign: 'middle' }} />}
                                title="Config Editor"
                                collapsed={collapsed.configEditor}
                                onToggle={() => toggleSection('configEditor')}
                            />
                            <div className={`card-body-collapsible${collapsed.configEditor ? ' collapsed' : ''}`}>
                                <div className="card-body" style={{ padding: 0 }}>
                                    {configLoading ? (
                                        <div className="loading-spinner" style={{ minHeight: 400 }}>
                                            <div className="spinner" />
                                        </div>
                                    ) : (
                                        <textarea
                                            className="form-textarea"
                                            value={content}
                                            onChange={(e) => {
                                                setContent(e.target.value);
                                                setDirty(true);
                                                setStatus(null);
                                            }}
                                            spellCheck={false}
                                            style={{
                                                border: 'none',
                                                borderRadius: 'var(--radius)',
                                                minHeight: 500,
                                            }}
                                        />
                                    )}
                                </div>
                            </div>
                        </div>
                    </>
                )}
            </div>
        </>
    );
}
