import { parsePost, missingPhotos, publish } from './publish.js';

const $ = id => document.getElementById(id);
const form = $('submission');
const button = form.querySelector('button');
const storageKey = 'never-give-up:publisher';
// GitHub Pages serves static files. It uses the same public extractor as the Vercel site.
const api = location.hostname.endsWith('.github.io')
  ? 'https://never-give-up-red.vercel.app/api/x-post' : '../api/x-post';

function message(text, error = false) {
  $('status').textContent = text;
  $('status').toggleAttribute('data-error', error);
}

function remember(token) {
  try {
    if (token) localStorage.setItem(storageKey, token);
    else localStorage.removeItem(storageKey);
    $('forget').hidden = !token;
  } catch { /* Publishing still works when browser storage is disabled. */ }
}

try {
  $('token').value = localStorage.getItem(storageKey) || '';
  $('remember').checked = Boolean($('token').value);
  $('forget').hidden = !$('token').value;
} catch { /* Storage is optional. */ }

$('remember').addEventListener('change', () => { if (!$('remember').checked) remember(''); });
$('forget').addEventListener('click', () => {
  remember('');
  $('token').value = '';
  $('remember').checked = false;
  message('Saved access cleared.');
});

async function preparePhoto(post, photo) {
  const res = await fetch(api + '?file=' + encodeURIComponent(photo.file));
  if (!res.ok) throw Error('Could not download photo ' + photo.number + ' from X. Try again.');
  const url = URL.createObjectURL(await res.blob());
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const scale = Math.min(1, 980 / img.naturalWidth, 1200 / img.naturalHeight);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const data = canvas.toDataURL('image/webp', 0.84);
    const [mime, contents] = data.split(',');
    const ext = { 'data:image/webp;base64': 'webp', 'data:image/png;base64': 'png' }[mime];
    if (!ext || !contents) throw Error('Could not encode this photo.');
    return { ...photo, width: canvas.width, height: canvas.height, contents,
      path: 'images/x-' + post.id + '-' + photo.number + '.' + ext };
  } finally { URL.revokeObjectURL(url); }
}

function preview(photos) {
  $('result').replaceChildren();
  for (const p of photos) {
    const img = new Image();
    img.alt = p.alt || 'Photo ' + p.number;
    img.src = api + '?file=' + encodeURIComponent(p.file);
    $('result').append(img);
  }
}

function addLink(label, href) {
  const link = document.createElement('a');
  link.textContent = label;
  link.href = href;
  $('result').append(link);
}

form.addEventListener('submit', async event => {
  event.preventDefault();
  if (button.disabled) return;
  $('result').replaceChildren();
  const link = parsePost($('post').value);
  if (!link) return message('Paste an X or Twitter post link, such as https://x.com/name/status/123.', true);
  button.disabled = true;
  try {
    message('Finding photos…');
    const response = await fetch(api + '?id=' + link.id);
    if (!response.headers.get('content-type')?.includes('application/json')) throw Error('The photo extractor is unavailable. Try again shortly.');
    const post = await response.json();
    if (!response.ok) throw Error(post.error || 'Could not read this post.');
    const photos = post.photos.filter(p => !link.number || p.number === link.number);
    if (!photos.length) throw Error(link.number ? 'That attachment is not a photo on this post.' : 'This post has no attached photos. Video and text-only posts cannot be added.');
    preview(photos);

    const token = $('token').value.trim();
    if (!token) {
      const wall = await fetch('../index.html', { cache: 'no-store' });
      if (wall.ok && !missingPhotos(await wall.text(), post.id, photos).length) {
        message('Already on the wall.');
        addLink('View the wall ↗', '../');
        return;
      }
      $('access').open = true;
      $('token').focus();
      return message('Photos found. Set up publishing access below, then click “add to the wall”.');
    }
    message('Preparing ' + photos.length + (photos.length === 1 ? ' photo…' : ' photos…'));
    const prepared = await Promise.all(photos.map(p => preparePhoto(post, p)));
    message('Publishing to GitHub…');
    const added = await publish(token, post, prepared);
    if ($('remember').checked) remember(token);
    if (added.count) {
      message(added.count + (added.count === 1 ? ' photo added.' : ' photos added.') + ' The wall will update when deployment finishes.');
      addLink('View commit ↗', added.url);
      form.reset();
    } else message('Already on the wall.');
    addLink('View the wall ↗', '../');
  } catch (error) {
    message(error.message || 'Submission failed. Please try again.', true);
  } finally { button.disabled = false; }
});
