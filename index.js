import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { serveStatic } from '@hono/node-server/serve-static'; // Helper for files
import { HTMLRewriter } from 'node-html-rewriter';

const app = new Hono();

// 1. Serve Frontend Files (index.html and sw.js)
app.use('/sw.js', serveStatic({ path: './public/sw.js' }));
app.get('/', serveStatic({ path: './public/index.html' }));

// 2. CORS Middleware
app.use('/proxy', cors());

// 3. Proxy Logic (Moved to /proxy endpoint to separate from frontend)
app.all('/proxy', async (c) => {
  const url = new URL(c.req.url);
  const proxyOrigin = `${url.protocol}//${url.host}`;
  const encodedUrl = c.req.query('id');

  if (!encodedUrl) return c.text("Missing 'id' parameter.", 400);

  try {
    const targetUrlString = Buffer.from(encodedUrl, 'base64').toString('utf-8');
    const targetUrl = new URL(targetUrlString);

    const headers = new Headers(c.req.raw.headers);
    headers.set('Host', targetUrl.host);
    headers.set('Referer', targetUrl.origin);
    headers.set('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/119.0.0.0 Safari/537.36');
    
    ['cf-connecting-ip', 'x-real-ip', 'x-forwarded-for'].forEach(h => headers.delete(h));

    const response = await fetch(targetUrl.href, {
      method: c.req.method,
      headers: headers,
      body: c.req.method !== 'GET' && c.req.method !== 'HEAD' ? await c.req.arrayBuffer() : null,
      redirect: 'follow'
    });

    const contentType = response.headers.get('content-type') || '';

    // HTML Rewriting
    if (contentType.includes('text/html')) {
      const rewriter = new HTMLRewriter()
        .on('a, img, link, script, form, iframe, source, video', {
          element(e) {
            ['href', 'src', 'action', 'poster'].forEach(attr => {
              const val = e.getAttribute(attr);
              if (val && !val.startsWith('data:') && !val.startsWith('javascript:') && !val.startsWith('#')) {
                try {
                  const absolute = new URL(val, targetUrl.href).href;
                  const b64 = Buffer.from(absolute).toString('base64');
                  // Update path to /proxy
                  e.setAttribute(attr, `${proxyOrigin}/proxy?id=${b64}`);
                } catch {}
              }
            });
          }
        });
      return c.body(await rewriter.transform(response).arrayBuffer(), 200, { 'Content-Type': 'text/html' });
    }

    // Default return
    return new Response(response.body, { status: response.status, headers: response.headers });
  } catch (e) {
    return c.text(`Proxy Error: ${e.message}`, 500);
  }
});

const port = process.env.PORT || 3000;
serve({ fetch: app.fetch, port });