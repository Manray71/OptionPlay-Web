import { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';

const MarketDataContext = createContext(null);

/**
 * useSSE — subscribes to a Server-Sent Events endpoint.
 * Returns { data, connected, error }.
 * Browser EventSource handles auto-reconnect on disconnect.
 */
function useSSE(url) {
    const [data, setData] = useState(null);
    const [connected, setConnected] = useState(false);
    const [error, setError] = useState(null);
    const esRef = useRef(null);

    useEffect(() => {
        const es = new EventSource(url);
        esRef.current = es;

        es.addEventListener('snapshot', (e) => {
            try {
                setData(JSON.parse(e.data));
                setConnected(true);
                setError(null);
            } catch (err) {
                console.warn('SSE snapshot parse error:', err);
            }
        });

        es.addEventListener('update', (e) => {
            try {
                setData(JSON.parse(e.data));
            } catch (err) {
                console.warn('SSE update parse error:', err);
            }
        });

        es.addEventListener('heartbeat', () => {
            // Keepalive — no action needed
        });

        es.onopen = () => {
            setConnected(true);
            setError(null);
        };

        es.onerror = () => {
            setConnected(false);
            // EventSource auto-reconnects — no manual retry needed
        };

        return () => {
            es.close();
            esRef.current = null;
        };
    }, [url]);

    return { data, connected, error };
}

/**
 * MarketDataProvider — wraps the app, subscribes to SSE stream,
 * and provides live market data through context.
 */
export function MarketDataProvider({ children }) {
    const { data, connected, error } = useSSE('/api/json/stream');

    const value = {
        // Decomposed data fields
        vix: data?.vix ?? null,
        quotes: data?.quotes ?? null,
        positions: data?.positions ?? null,
        summary: data?.summary ?? null,

        // Metadata
        connected,
        error,
        pollingActive: data?.polling_active ?? false,
        marketSession: data?.market_session ?? 'unknown',
        version: data?.version ?? 0,
        lastUpdate: data?.timestamp ?? null,
    };

    return (
        <MarketDataContext.Provider value={value}>
            {children}
        </MarketDataContext.Provider>
    );
}

/**
 * useMarketData — convenience hook for consumers.
 * Returns null-safe object even if provider is missing (graceful degradation).
 */
export function useMarketData() {
    const ctx = useContext(MarketDataContext);
    if (!ctx) {
        // Graceful fallback — components work without provider
        return {
            vix: null, quotes: null, positions: null, summary: null,
            connected: false, error: null, pollingActive: false,
            marketSession: 'unknown', version: 0, lastUpdate: null,
        };
    }
    return ctx;
}

export default MarketDataContext;
