import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import { MarketDataProvider } from './contexts/MarketDataContext';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
        <MarketDataProvider>
            <App />
        </MarketDataProvider>
    </React.StrictMode>,
);
