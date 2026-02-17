import { useState, useEffect } from 'react';
import { Settings, Save, RotateCcw, FileText, CheckCircle, AlertCircle, Database, Play, Terminal } from 'lucide-react';
import { fetchConfig, saveConfig, runDbUpdate, fetchDbStatus } from '../api';

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
    { id: 'options', label: 'Options Chains', desc: 'Greeks & IV via Tradier' },
    { id: 'ohlcv', label: 'OHLCV Prices', desc: 'Daily candlestick data' },
];

export default function Admin() {
    const [activeTab, setActiveTab] = useState('weights');
    const [content, setContent] = useState('');
    const [filename, setFilename] = useState('');
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [status, setStatus] = useState(null);
    const [dirty, setDirty] = useState(false);

    // DB Update state
    const [dbSteps, setDbSteps] = useState(['vix', 'options', 'ohlcv']);
    const [dbDryRun, setDbDryRun] = useState(false);
    const [dbRunning, setDbRunning] = useState(false);
    const [dbResult, setDbResult] = useState(null);
    const [dbStatus, setDbStatus] = useState(null);

    useEffect(() => {
        loadConfig(activeTab);
    }, [activeTab]);

    const loadConfig = async (key) => {
        setLoading(true);
        setStatus(null);
        setDirty(false);
        try {
            const data = await fetchConfig(key);
            setContent(data.content);
            setFilename(data.filename);
        } catch (err) {
            setContent(`# ${CONFIG_TABS.find(t => t.key === key)?.label || key}\n# Backend not connected — showing placeholder\n# Start the backend with: uvicorn backend.main:app --reload\n`);
            setFilename(`${key}.yaml`);
            setStatus({ type: 'error', message: 'Backend not connected. Start it to load real config.' });
        }
        setLoading(false);
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
        } catch (err) {
            setDbResult({ status: 'error', stderr: err.message });
        }
        setDbRunning(false);
    };

    const handleDbStatus = async () => {
        try {
            const result = await fetchDbStatus();
            setDbStatus(result);
        } catch (err) {
            setDbStatus({ status: 'error', output: err.message });
        }
    };

    return (
        <>
            <div className="page-header">
                <h2>Admin — Configuration & Tools</h2>
                <p>Edit scoring weights, thresholds, trading rules, and run maintenance tasks.</p>
            </div>

            <div className="page-content">
                {/* ============ DB UPDATE PANEL ============ */}
                <div className="card fade-in" style={{ marginBottom: 24 }}>
                    <div className="card-header">
                        <h3>
                            <Database size={14} style={{ marginRight: 6, verticalAlign: 'middle' }} />
                            Database Update
                        </h3>
                        <button className="btn btn-secondary" onClick={handleDbStatus} style={{ padding: '4px 12px', fontSize: 12 }}>
                            Check Status
                        </button>
                    </div>
                    <div className="card-body">
                        <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                            {/* Step checkboxes */}
                            <div style={{ flex: 1, minWidth: 200 }}>
                                <div className="form-label" style={{ marginBottom: 10 }}>Steps to run</div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                    {DB_STEPS.map((step) => (
                                        <label key={step.id} style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: 14 }}>
                                            <input
                                                type="checkbox"
                                                checked={dbSteps.includes(step.id)}
                                                onChange={() => toggleStep(step.id)}
                                                style={{ accentColor: 'var(--indigo)', width: 16, height: 16 }}
                                            />
                                            <span style={{ fontWeight: 500 }}>{step.label}</span>
                                            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>— {step.desc}</span>
                                        </label>
                                    ))}
                                </div>
                            </div>

                            {/* Options & Run */}
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

                        {/* DB Status Output */}
                        {dbStatus && (
                            <div style={{ marginTop: 16, padding: 12, background: 'var(--bg-input)', borderRadius: 'var(--radius-xs)', fontSize: 12, fontFamily: 'monospace', color: 'var(--text-secondary)', whiteSpace: 'pre-wrap', maxHeight: 200, overflow: 'auto' }}>
                                {dbStatus.output || 'No status available'}
                            </div>
                        )}

                        {/* DB Update Result */}
                        {dbResult && (
                            <div style={{ marginTop: 16 }}>
                                <div style={{
                                    padding: '8px 14px',
                                    borderRadius: 'var(--radius-xs)',
                                    marginBottom: 8,
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 8,
                                    fontSize: 13,
                                    fontWeight: 500,
                                    ...(dbResult.status === 'completed'
                                        ? { background: 'var(--green-glow)', color: 'var(--green)', border: '1px solid rgba(16,185,129,0.3)' }
                                        : { background: 'var(--red-glow)', color: 'var(--red)', border: '1px solid rgba(239,68,68,0.3)' }),
                                }}>
                                    {dbResult.status === 'completed' ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
                                    DB Update {dbResult.status}
                                </div>
                                {(dbResult.stdout || dbResult.stderr) && (
                                    <div style={{ padding: 12, background: 'var(--bg-input)', borderRadius: 'var(--radius-xs)', fontSize: 12, fontFamily: 'monospace', color: 'var(--text-secondary)', whiteSpace: 'pre-wrap', maxHeight: 300, overflow: 'auto' }}>
                                        <Terminal size={12} style={{ marginRight: 6, verticalAlign: 'middle', opacity: 0.5 }} />
                                        Output:
                                        {'\n'}{dbResult.stdout}
                                        {dbResult.stderr && <span style={{ color: 'var(--red)' }}>{'\n'}Errors:\n{dbResult.stderr}</span>}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>

                {/* ============ CONFIG EDITOR ============ */}
                {/* Tab Bar */}
                <div className="tabs fade-in" style={{ marginBottom: 20 }}>
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
                <div className="card fade-in" style={{ marginBottom: 16 }}>
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
                            <button className="btn btn-secondary" onClick={handleReset} disabled={loading}>
                                <RotateCcw size={14} />
                                Reset
                            </button>
                            <button
                                className={`btn ${dirty ? 'btn-success pulse' : 'btn-primary'}`}
                                onClick={handleSave}
                                disabled={saving || loading}
                            >
                                {saving ? <div className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} /> : <Save size={14} />}
                                {dirty ? 'Save & Reload' : 'Save'}
                            </button>
                        </div>
                    </div>
                </div>

                {/* Status Message */}
                {status && (
                    <div
                        className="fade-in"
                        style={{
                            padding: '10px 16px',
                            borderRadius: 'var(--radius-xs)',
                            marginBottom: 16,
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8,
                            fontSize: 13,
                            fontWeight: 500,
                            ...(status.type === 'success'
                                ? { background: 'var(--green-glow)', color: 'var(--green)', border: '1px solid rgba(16,185,129,0.3)' }
                                : { background: 'var(--red-glow)', color: 'var(--red)', border: '1px solid rgba(239,68,68,0.3)' }),
                        }}
                    >
                        {status.type === 'success' ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
                        {status.message}
                    </div>
                )}

                {/* YAML Editor */}
                <div className="card fade-in" style={{ animationDelay: '0.1s' }}>
                    <div className="card-body" style={{ padding: 0 }}>
                        {loading ? (
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
    );
}
