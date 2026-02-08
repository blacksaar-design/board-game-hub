const express = require('express');
const path = require('path');
const { createProxyMiddleware } = require('http-proxy-middleware');
const app = express();
const PORT = 8080;

app.use(express.static(__dirname));

// --- VOGELSPIEL TUNNEL ---
// Alles was mit /bird-game anfängt, geht direkt an Port 3000
app.use('/bird-game', createProxyMiddleware({
    target: 'http://127.0.0.1:3000',
    changeOrigin: true,
    ws: true,
    pathRewrite: {
        '^/bird-game': '', // Entferne das Präfix beim Weiterleiten
    },
    onProxyRes: (proxyRes, req, res) => {
        // Fix für MIME-Type Fehler (stellt sicher, dass JS als JS ankommt)
        if (req.url.endsWith('.js')) {
            res.setHeader('Content-Type', 'application/javascript');
        }
    }
}));

// --- INVESTMENT TUNNEL ---
// Alles was mit /investment-game anfängt, geht direkt an Port 3001
app.use('/investment-game', createProxyMiddleware({
    target: 'http://127.0.0.1:3001',
    changeOrigin: true,
    ws: true,
    pathRewrite: {
        '^/investment-game': '',
    },
    onProxyRes: (proxyRes, req, res) => {
        if (req.url.endsWith('.js')) {
            res.setHeader('Content-Type', 'application/javascript');
        }
    }
}));

// Assets Fallback
app.use('/assets', createProxyMiddleware({
    target: 'http://127.0.0.1:3000/assets',
    changeOrigin: true,
}));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
    console.log(`🚀 Smart Game Hub läuft auf http://localhost:${PORT}`);
    console.log(`Alles ist bereit. Viel Spaß beim Testen!`);
});
