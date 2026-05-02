/**
 * Web Proxy Service Worker
 * This file must be placed at the root of your frontend domain.
 */

const PROXY_URL = ""; // Must match your PROXY in index.html

self.addEventListener('install', (event) => {
    self.skipWaiting(); // Activate worker immediately
});

self.addEventListener('activate', (event) => {
    event.waitUntil(clients.claim()); // Take control of all open tabs
});

self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // 1. Only intercept requests that are NOT for our own frontend domain
    // and are NOT already going to the proxy.
    if (url.origin !== self.location.origin && !url.href.startsWith(PROXY_URL)) {
        
        // 2. Wrap the destination URL in the proxy format
        // We use the same 'id' parameter logic as the frontend
        const proxiedUrl = `${PROXY_URL}?id=${btoa(event.request.url)}`;

        event.respondWith(
            fetch(proxiedUrl, {
                method: event.request.method,
                headers: event.request.headers,
                body: event.request.method !== 'GET' && event.request.method !== 'HEAD' ? event.request.body : null,
                redirect: 'follow'
            }).catch(err => {
                console.error("SW Fetch Error:", err);
                return fetch(event.request); // Fallback to direct fetch if proxy fails
            })
        );
    }
});