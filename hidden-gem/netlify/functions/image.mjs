// GET  /.netlify/functions/image?key=<editKey>   → binary image with content-type
// POST /.netlify/functions/image                   → multipart form:
//        page     = pageKey   (e.g. "home")
//        editKey  = full key  (e.g. "home:img:2")
//        file     = the image file
//      Stores binary in the `site-images` blob store AND updates
//      `site-content/{page}` with the public URL so the override
//      persists across page loads.

import { getStore } from '@netlify/blobs';

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB per image

export default async (req) => {
  const imageStore = getStore('site-images');

  if (req.method === 'GET') {
    const url = new URL(req.url);
    const key = url.searchParams.get('key');
    if (!key) return text('missing key', 400);
    const result = await imageStore.getWithMetadata(key, {
      type: 'arrayBuffer',
      consistency: 'strong'
    });
    if (!result || !result.data) return text('not found', 404);
    const contentType =
      (result.metadata && result.metadata.contentType) || 'application/octet-stream';
    return new Response(result.data, {
      headers: {
        'content-type': contentType,
        // Safe to cache aggressively because every upload gets a new ?v= cache-buster
        'cache-control': 'public, max-age=604800'
      }
    });
  }

  if (req.method === 'POST') {
    let form;
    try {
      form = await req.formData();
    } catch {
      return text('invalid form data', 400);
    }
    const page = form.get('page');
    const editKey = form.get('editKey');
    const file = form.get('file');
    if (!page || !editKey || !file || typeof file === 'string') {
      return text('missing page, editKey, or file', 400);
    }
    if (file.size > MAX_BYTES) {
      return text(`file too large (max ${MAX_BYTES / (1024 * 1024)} MB)`, 413);
    }
    if (!String(file.type || '').startsWith('image/')) {
      return text('only image files are allowed', 415);
    }

    const buf = await file.arrayBuffer();
    const contentType = file.type || 'application/octet-stream';
    await imageStore.set(editKey, buf, { metadata: { contentType } });

    // Persist the URL override in the page's content blob
    const contentStore = getStore('site-content');
    const existing =
      (await contentStore.get(page, { type: 'json', consistency: 'strong' })) || {};
    const imgUrl = `/.netlify/functions/image?key=${encodeURIComponent(editKey)}&v=${Date.now()}`;
    existing[editKey] = imgUrl;
    await contentStore.setJSON(page, existing);

    return new Response(JSON.stringify({ ok: true, url: imgUrl }), {
      status: 200,
      headers: {
        'content-type': 'application/json',
        'cache-control': 'no-store'
      }
    });
  }

  return text('method not allowed', 405);
};

function text(msg, status = 200) {
  return new Response(msg, {
    status,
    headers: {
      'content-type': 'text/plain',
      'cache-control': 'no-store'
    }
  });
}
