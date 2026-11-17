// Only fetch public post metadata and images from fixed upstream hosts.
const MEDIA = /^[A-Za-z0-9_-]{1,100}\.(?:jpe?g|png|webp)$/i;
const HANDLE = /^[A-Za-z0-9_]{1,15}$/;

async function upstream(url) {
  return fetch(url, { redirect: 'error', signal: AbortSignal.timeout(6500) });
}

function photoFile(url) {
  try {
    const location = new URL(url);
    if (location.origin !== 'https://pbs.twimg.com') return;
    const match = location.pathname.match(/^\/media\/([\w.-]+)$/);
    if (!match) return;
    const file = match[1].includes('.') ? match[1] : match[1] + '.' + location.searchParams.get('format');
    if (MEDIA.test(file)) return file;
  } catch { /* The upstream record has no usable photo URL. */ }
}

async function readPost(id) {
  // X uses a per-post token on its public embed endpoint.
  const token = ((Number(id) / 1e15) * Math.PI).toString(36).replace(/(0+|\.)/g, '');
  const sources = [
    ['https://cdn.syndication.twimg.com/tweet-result?id=' + id + '&token=' + token, 'embed'],
    ['https://api.fxtwitter.com/status/' + id, 'fx'],
  ];
  for (const [url, kind] of sources) {
    try {
      const response = await upstream(url);
      if (!response.ok) continue;
      const data = await response.json();
      const post = kind === 'embed' ? data : data.tweet;
      const handle = post?.user?.screen_name || post?.author?.screen_name;
      if (String(post?.id_str || post?.id) !== id || !HANDLE.test(handle || '')) continue;
      const media = post.mediaDetails || post.media?.all ||
        (post.photos || []).map(p => ({ ...p, type: 'photo' }));
      const photos = [];
      for (const [i, item] of media.entries()) {
        if (item.type !== 'photo') continue;
        const file = photoFile(item.media_url_https || item.url);
        if (!file) throw Error('Incomplete upstream photo');
        photos.push({ number: i + 1, file, alt: String(item.ext_alt_text || item.altText || '').slice(0, 1000) });
      }
      return { id, handle, photos };
    } catch { /* Try the other public embed source. */ }
  }
  throw Error('Could not read this post. Check that it is public and try again.');
}

async function servePhoto(file, res) {
  const base = 'https://pbs.twimg.com/media/' + file;
  // Keep the response inside the Vercel Function response limit.
  for (const url of [base, base + '?name=medium', base + '?name=small']) {
    try {
      const upstreamImage = await upstream(url);
      const type = (upstreamImage.headers.get('content-type') || '').split(';')[0];
      if (!upstreamImage.ok || !/^image\/(jpeg|png|webp)$/.test(type) ||
          Number(upstreamImage.headers.get('content-length')) > 3500000) {
        await upstreamImage.body?.cancel();
        continue;
      }
      const reader = upstreamImage.body.getReader();
      const chunks = [];
      let size = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > 3500000) { await reader.cancel(); break; }
        chunks.push(value);
      }
      if (!size || size > 3500000) continue;
      res.setHeader('Content-Type', type);
      res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=604800');
      return res.status(200).send(Buffer.concat(chunks));
    } catch { /* Try a smaller rendition. */ }
  }
  return res.status(502).json({ error: 'X could not supply this photo. Try again shortly.' });
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).end();
  }
  const params = new URL(req.url, 'https://localhost').searchParams;
  if (params.has('file')) {
    const file = params.get('file');
    if (!MEDIA.test(file)) return res.status(400).json({ error: 'Invalid image name.' });
    return servePhoto(file, res);
  }
  const id = params.get('id');
  if (!/^\d{1,20}$/.test(id || '')) return res.status(400).json({ error: 'Invalid X post ID.' });
  try {
    const post = await readPost(id);
    res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=600');
    return res.status(200).json(post);
  } catch (error) {
    return res.status(502).json({ error: error.message });
  }
}
