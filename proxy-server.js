// proxy-server.js
const express = require('express');
const { JSDOM } = require('jsdom');
const fetch = require('node-fetch');
const path = require('path');

const app = express();
const port = 3001;

app.use(express.json());

app.post('/revisar', async (req, res) => {
    const { url } = req.body;
    if (!url) {
        return res.status(400).json({ error: 'URL no proporcionada' });
    }

    try {
        console.log(`[PROXY] Recibida solicitud para revisar y descargar: ${url}`);
        
        // 1. Obtener el HTML principal
        const response = await fetch(url);
        const html = await response.text();
        
        // 2. Analizar el HTML para encontrar todos los recursos
        const dom = new JSDOM(html);
        const document = dom.window.document;
        
        const allResourceUrls = new Set();
        document.querySelectorAll('link[rel="stylesheet"]').forEach(link => allResourceUrls.add(link.href));
        document.querySelectorAll('script[src]').forEach(script => allResourceUrls.add(script.src));
        document.querySelectorAll('img[src]').forEach(img => allResourceUrls.add(img.src));
        document.querySelectorAll('a[href]').forEach(a => {
            try {
                if (a.href.startsWith(url) || a.href.startsWith('http')) {
                    allResourceUrls.add(a.href);
                }
            } catch(e) {/* Ignorar URLs inválidas */}
        });

        // 3. Descargar todos los recursos en paralelo
        const downloadPromises = Array.from(allResourceUrls).map(async (resourceUrl) => {
            try {
                const resourceResponse = await fetch(resourceUrl);
                const contentType = resourceResponse.headers.get('content-type') || 'application/octet-stream';
                const content = await resourceResponse.text();
                return { url: resourceUrl, content, contentType };
            } catch (error) {
                console.warn(`[PROXY] No se pudo descargar ${resourceUrl}: ${error.message}`);
                return { url: resourceUrl, error: error.message, content: null, contentType: 'error' };
            }
        });

        const downloadedResources = await Promise.all(downloadPromises);

        res.json({
            success: true,
            url: url,
            mainHtml: html,
            resources: downloadedResources,
            count: downloadedResources.length
        });

    } catch (error) {
        console.error(`[PROXY] Error al procesar la URL ${url}:`, error);
        res.status(500).json({ error: 'Error al procesar la URL', details: error.message });
    }
});

app.listen(port, () => {
    console.log(`[PROXY] Servidor de escucha activo en http://localhost:${port}`);
    console.log('[PROXY] La consola web ahora puede realizar escaneos y descargas reales a través de este proxy.');
});