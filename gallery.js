// Each image links straight to its source when JavaScript is unavailable.
const wall = document.querySelector('.wall');
const entries = [...wall.querySelectorAll('a')];
const dialog = document.querySelector('dialog');
const full = document.querySelector('#full');
const source = document.querySelector('#source');
const random = document.querySelector('#random');

if (typeof dialog.showModal === 'function' && entries.length) {
  let previous = -1;

  function openImage(entry) {
    const thumbnail = entry.querySelector('img');
    full.src = thumbnail.src;
    full.alt = thumbnail.alt;
    source.href = entry.href;
    source.textContent = 'via ' + entry.dataset.credit + ' ↗';
    previous = entries.indexOf(entry);
    dialog.showModal();
  }

  wall.addEventListener('click', event => {
    const entry = event.target.closest('a');
    if (!entry || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    openImage(entry);
  });

  random.hidden = false;
  random.addEventListener('click', () => {
    const pool = entries.filter((_, index) => index !== previous || entries.length === 1);
    openImage(pool[Math.floor(Math.random() * pool.length)]);
  });
  dialog.addEventListener('click', event => {
    if (event.target === dialog) dialog.close();
  });
}
