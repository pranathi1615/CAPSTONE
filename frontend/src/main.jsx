import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './index.css';
import './i18n';
import { registerSW } from 'virtual:pwa-register';

// Register PWA Service Worker for offline app shell caching
registerSW({
  immediate: true,
  onNeedRefresh() {
    console.log('[PWA] New content available, refresh required.');
  },
  onOfflineReady() {
    console.log('[PWA] CareBridge offline app shell is ready for field use.');
  },
});

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
