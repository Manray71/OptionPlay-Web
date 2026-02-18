import { useState, useCallback, useRef } from 'react';
import {
    LayoutDashboard,
    Search,
    BarChart3,
    Briefcase,
    Settings,
    Activity,
} from 'lucide-react';
import Dashboard from './components/Dashboard';
import Scanner from './components/Scanner';
import Analysis from './components/Analysis';
import Portfolio from './components/Portfolio';
import Admin from './components/Admin';

const NAV_ITEMS = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'scanner', label: 'Scanner', icon: Search },
    { id: 'analysis', label: 'Analysis', icon: BarChart3 },
    { id: 'portfolio', label: 'Portfolio', icon: Briefcase },
    { id: 'admin', label: 'Admin', icon: Settings },
];

function App() {
    const [activePage, setActivePage] = useState('dashboard');
    const [analysisSymbol, setAnalysisSymbol] = useState('');

    // Lifted scanner state so results persist across page switches
    const [scanResults, setScanResults] = useState(null);
    const [scanTime, setScanTime] = useState(null);

    // Analysis cache — pre-fetched after scan completes
    const analysisCacheRef = useRef({});

    // Navigate to analysis with a pre-selected symbol
    const navigateToAnalysis = useCallback((symbol) => {
        setAnalysisSymbol(symbol);
        setActivePage('analysis');
    }, []);

    const renderPage = () => {
        switch (activePage) {
            case 'dashboard': return <Dashboard onSymbolClick={navigateToAnalysis} />;
            case 'scanner': return <Scanner onSymbolClick={navigateToAnalysis} scanResults={scanResults} setScanResults={setScanResults} scanTime={scanTime} setScanTime={setScanTime} analysisCache={analysisCacheRef} />;
            case 'analysis': return <Analysis initialSymbol={analysisSymbol} onSymbolConsumed={() => setAnalysisSymbol('')} analysisCache={analysisCacheRef} />;
            case 'portfolio': return <Portfolio />;
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
                        <Activity size={14} style={{ color: 'var(--green)' }} />
                        <span style={{ fontSize: 12, color: 'var(--green)' }}>Connected</span>
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
