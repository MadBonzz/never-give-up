const repository = 'MadBonzz/never-give-up';
const marker = '<!-- submissions -->';

export function parsePost(input) {
  let url;
  try {
    const raw = input.trim();
    url = new URL(raw.includes('://') ? raw : 'https://' + raw);
  } catch { return null; }
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.port ||
      !/^(?:(?:www|mobile|m)\.)?(?:x|twitter)\.com$/.test(url.hostname)) return null;
  const match = url.pathname.match(/^\/(?:[\w]{1,15}|i\/web)\/status\/(\d{1,20})(?:\/photo\/([1-4]))?\/?$/);
  return match ? { id: match[1], number: Number(match[2]) || null } : null;
}

export function missingPhotos(html, id, photos) {
  const saved = new Set();
  // Read just the anchors. Parsing the entire gallery in a document can fetch its images.
  for (const match of html.matchAll(/<a\s+href="([^"]+)"\s+data-credit=/g)) {
    const link = parsePost(match[1]);
    if (link?.id === id) saved.add(link.number || 1);
  }
  return photos.filter(photo => !saved.has(photo.number));
}

function escapeAttribute(text) {
  return String(text).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

function addCards(html, post, photos) {
  if (html.split(marker).length !== 2) throw Error('The gallery’s insertion point is missing or ambiguous.');
  const cards = photos.map(p => {
    const credit = '@' + post.handle;
    const alt = p.alt || 'Photo ' + p.number + ' posted by ' + credit + ' on X.';
    return '      <a href="https://x.com/' + post.handle + '/status/' + post.id + '/photo/' + p.number +
      '" data-credit="' + escapeAttribute(credit) + '">\n' +
      '        <img src="./' + p.path + '" width="' + p.width + '" height="' + p.height +
      '" loading="lazy" alt="' + escapeAttribute(alt) + '">\n      </a>';
  });
  return html.replace(marker, () => marker + '\n' + cards.join('\n'));
}

async function github(token, query, variables = {}) {
  const response = await fetch('https://api.github.com/graphql', {
    method: 'POST', redirect: 'error', credentials: 'omit', cache: 'no-store',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });
  const json = await response.json();
  if (response.status === 401) throw Error('GitHub rejected the token. Replace it under Publishing access.');
  if (!response.ok || json.errors?.length) {
    throw Error(json.errors?.[0]?.message || json.message || 'GitHub could not publish the photos.');
  }
  return json.data;
}

async function latest(token) {
  const data = await github(token, `query {
    repository(owner: "MadBonzz", name: "never-give-up") {
      ref(qualifiedName: "refs/heads/main") {
        target { ... on Commit { oid file(path: "index.html") { object { ... on Blob { text } } } } }
      }
    }
  }`);
  const commit = data.repository?.ref?.target;
  if (!commit?.file?.object?.text) throw Error('Could not read the gallery on GitHub.');
  return { head: commit.oid, html: commit.file.object.text };
}

function textBase64(text) {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 8192) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  }
  return btoa(binary);
}

// Update images and the wall together. If main moves, rebuild from the new HEAD.
export async function publish(token, post, photos) {
  let revision = await latest(token);
  for (let attempt = 0; attempt < 3; attempt++) {
    const fresh = missingPhotos(revision.html, post.id, photos);
    if (!fresh.length) return { count: 0 };
    const html = addCards(revision.html, post, fresh);
    const additions = fresh.map(({ path, contents }) => ({ path, contents }));
    additions.push({ path: 'index.html', contents: textBase64(html) });
    const input = {
      branch: { repositoryNameWithOwner: repository, branchName: 'main' },
      expectedHeadOid: revision.head,
      message: { headline: 'Add photos from @' + post.handle + ' (' + post.id + ')' },
      fileChanges: { additions },
    };
    try {
      const result = await github(token, `mutation($input: CreateCommitOnBranchInput!) {
        createCommitOnBranch(input: $input) { commit { url } }
      }`, { input });
      return { count: fresh.length, url: result.createCommitOnBranch.commit.url };
    } catch (error) {
      const next = await latest(token);
      if (next.head === revision.head) throw error;
      revision = next;
    }
  }
  throw Error('The gallery changed during publishing. Submit the link again.');
}
