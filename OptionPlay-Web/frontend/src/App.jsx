import { useState, useCallback, useRef } from 'react';
import { useMarketData } from './contexts/MarketDataContext';
import {
    LayoutDashboard,
    Search,
    BarChart3,
    Briefcase,
    Eye,
    Settings,
    Activity,
} from 'lucide-react';
import Dashboard from './components/Dashboard';
import Scanner from './components/Scanner';
import Analysis from './components/Analysis';
import Portfolio from './components/Portfolio';
import ShadowTracker from './components/ShadowTracker';
import Admin from './components/Admin';
import { fetchAnalysisJson } from './api';

const NAV_ITEMS = [
    { id: 'dashboard', label: 'Market Overview', icon: LayoutDashboard },
    { id: 'scanner', label: 'Scanner', icon: Search },
    { id: 'analysis', label: 'Analysis', icon: BarChart3 },
    { id: 'portfolio', label: 'Portfolio', icon: Briefcase },
    { id: 'shadow', label: 'Shadow Tracker', icon: Eye },
    { id: 'admin', label: 'Admin', icon: Settings },
];

function App() {
    // Read initial page/symbol from URL query params (for new-window links)
    const _params = new URLSearchParams(window.location.search);
    const _initPage = _params.get('page') || 'dashboard';
    const _initSymbol = _params.get('symbol') || '';

    const [activePage, setActivePage] = useState(_initPage);
    const [analysisSymbol, setAnalysisSymbol] = useState(_initSymbol);

    // Lifted scanner state so results persist across page switches
    const [scanResults, setScanResults] = useState(null);
    const [scanTime, setScanTime] = useState(null);

    // Analysis cache — pre-fetched after scan completes
    const analysisCacheRef = useRef({});

    // Prefetch progress — lifted to App so it survives Scanner unmount
    const [prefetchProgress, setPrefetchProgress] = useState(null);

    const prefetchAnalyses = useCallback((symbols) => {
        const cache = analysisCacheRef.current;

        // Extract trade rec fields from analysis and merge into scan results
        const enrichScanResult = (sym, data) => {
            const rec = data.recommendation || {};
            const credit = rec.estimated_credit;
            const quality = rec.quality;
            const shortStrike = rec.short_strike;
            const longStrike = rec.long_strike;
            const riskReward = rec.risk_reward_ratio;
            const dataSource = rec.data_source;
            const marketClosed = dataSource === 'mid_price' || dataSource === 'black_scholes';
            setScanResults(prev => {
                if (!prev) return prev;
                return prev.map(r => r.symbol === sym
                    ? { ...r, credit: credit ?? null, tradeQuality: quality ?? 'none', shortStrike: shortStrike ?? null, longStrike: longStrike ?? null, riskReward: riskReward ?? null, marketClosed }
                    : r
                );
            });
        };

        // Enrich from already-cached analyses immediately
        const alreadyCached = symbols.filter(s => cache[s]);
        if (alreadyCached.length) {
            for (const sym of alreadyCached) {
                enrichScanResult(sym, cache[sym]);
            }
        }

        const toFetch = symbols.filter(s => !cache[s]);
        if (!toFetch.length) {
            setPrefetchProgress({ done: symbols.length, total: symbols.length });
            return;
        }
        let done = alreadyCached.length;
        const total = symbols.length;
        setPrefetchProgress({ done, total });

        const queue = [...toFetch];
        const CONCURRENCY = 3;
        const next = () => {
            const sym = queue.shift();
            if (!sym) return Promise.resolve();
            return fetchAnalysisJson(sym)
                .then(data => {
                    if (!data.error) {
                        cache[sym] = data;
                        enrichScanResult(sym, data);
                    }
                })
                .catch(() => {})
                .finally(() => {
                    done++;
                    setPrefetchProgress({ done, total });
                    return next();
                });
        };
        Promise.all(Array.from({ length: CONCURRENCY }, () => next()));
    }, [setScanResults]);

    // Navigate to analysis with a pre-selected symbol
    const navigateToAnalysis = useCallback((symbol) => {
        setAnalysisSymbol(symbol);
        setActivePage('analysis');
    }, []);

    // Live connection status from SSE
    const { connected: sseConnected, pollingActive } = useMarketData();

    const renderPage = () => {
        switch (activePage) {
            case 'dashboard': return <Dashboard onSymbolClick={navigateToAnalysis} />;
            case 'scanner': return <Scanner onSymbolClick={navigateToAnalysis} scanResults={scanResults} setScanResults={setScanResults} scanTime={scanTime} setScanTime={setScanTime} analysisCache={analysisCacheRef} prefetchAnalyses={prefetchAnalyses} prefetchProgress={prefetchProgress} setPrefetchProgress={setPrefetchProgress} />;
            case 'analysis': return <Analysis initialSymbol={analysisSymbol} onSymbolConsumed={() => setAnalysisSymbol('')} analysisCache={analysisCacheRef} />;
            case 'portfolio': return <Portfolio />;
            case 'shadow': return <ShadowTracker />;
            case 'admin': return <Admin />;
            default: return <Dashboard onSymbolClick={navigateToAnalysis} />;
        }
    };

    return (
        <div className="app-layout">
            {/* Sidebar */}
            <aside className="sidebar">
                <div className="sidebar-logo">
                    <div className="logo-icon">OP</div>
                    <h1>OptionPlay</h1>
                </div>

                <nav className="sidebar-nav">
                    {NAV_ITEMS.map((item) => {
                        const Icon = item.icon;
                        return (
                            <button
                                key={item.id}
                                className={`nav-item ${activePage === item.id ? 'active' : ''}`}
                                onClick={() => setActivePage(item.id)}
                            >
                                <Icon />
                                <span>{item.label}</span>
                            </button>
                        );
                    })}
                </nav>

                <div className="sidebar-footer">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                        <Activity size={14} style={{ color: sseConnected ? 'var(--green)' : 'var(--text-dim, #666)' }} />
                        <span style={{ fontSize: 12, color: sseConnected ? 'var(--green)' : 'var(--text-dim, #666)' }}>
                            {sseConnected ? (pollingActive ? 'Live' : 'Connected') : 'Reconnecting...'}
                        </span>
                    </div>
                    <div className="version">OptionPlay Web v1.0.0</div>
                </div>
            </aside>

            {/* Main Content */}
            <main className="main-content">
                {renderPage()}
            </main>
        </div>
    );
}

export default App;
