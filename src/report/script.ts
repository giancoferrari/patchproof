export const REPORT_SCRIPT = String.raw`
(() => {
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const setCount = (kind) => {
    const items = $$('[data-filter-kind="' + kind + '"]');
    const visible = items.filter((item) => !item.classList.contains('hidden')).length;
    const target = document.querySelector('[data-count-for="' + kind + '"]');
    if (target) target.textContent = visible + ' shown';
  };

  $$('[data-filter]').forEach((select) => {
    select.addEventListener('change', () => {
      const kind = select.dataset.filter;
      const value = select.value;
      $$('[data-filter-kind="' + kind + '"]').forEach((item) => {
        item.classList.toggle('hidden', value !== 'all' && item.dataset.status !== value);
      });
      setCount(kind);
    });
  });

  $$('[data-copy]').forEach((button) => {
    button.addEventListener('click', async () => {
      const value = button.dataset.copy || '';
      try {
        await navigator.clipboard.writeText(value);
        button.dataset.copied = 'true';
        button.setAttribute('aria-label', 'Copied');
        setTimeout(() => {
          button.dataset.copied = 'false';
          button.setAttribute('aria-label', 'Copy value');
        }, 1600);
      } catch {
        button.setAttribute('aria-label', 'Copy failed');
      }
    });
  });

  const details = $$('details.evidence-item');
  const expand = document.querySelector('[data-expand-evidence]');
  const collapse = document.querySelector('[data-collapse-evidence]');
  if (expand) expand.addEventListener('click', () => details.forEach((item) => { item.open = true; }));
  if (collapse) collapse.addEventListener('click', () => details.forEach((item) => { item.open = false; }));

  const links = $$('.rail nav a');
  const fileItems = $$('.patch-file');
  const search = document.querySelector('[data-path-search]');
  const filterPaths = () => {
    const query = (search?.value || '').toLowerCase();
    fileItems.forEach((item) => {
      item.hidden = !item.querySelector('.file-path').textContent.toLowerCase().includes(query);
    });
    document.querySelector('[data-files-empty]').hidden = !fileItems.length || fileItems.some((item) => !item.hidden);
  };
  search?.addEventListener('input', filterPaths);

  let proof;
  function showPatch(item, targetLine) {
    const view = item.querySelector('.patch-view');
    if (!view || (view.childElementCount && !targetLine)) return;
    proof ??= JSON.parse(document.getElementById('patchproof-data').textContent);
    const file = proof.patch.files[Number(item.dataset.index)];
    const rows = [];
    let oldLine, newLine;
    let matchIndex = -1;
    for (const text of (file.patch || '').split(/\r?\n/)) {
      const header = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(text);
      if (header) {
        oldLine = Number(header[1]);
        newLine = Number(header[2]);
        rows.push({ text, kind: 'hunk' });
      } else if (newLine !== undefined && text) {
        const prefix = text[0];
        const left = prefix === '-' || prefix === ' ' ? oldLine++ : '';
        const right = prefix === '+' || prefix === ' ' ? newLine++ : '';
        if (right === targetLine) matchIndex = rows.length;
        rows.push({ text, left, right, kind: prefix === '+' ? 'add' : prefix === '-' ? 'del' : 'context' });
      }
    }
    const pageSize = 120;
    let page = Math.max(0, Math.floor(matchIndex / pageSize));
    view.replaceChildren();
    if (!rows.length) {
      const message = document.createElement('p');
      message.className = 'empty';
      message.textContent = 'This file has no text hunks in the recorded patch.';
      view.append(message);
      return;
    }
    if (targetLine && matchIndex < 0) {
      const note = document.createElement('p');
      note.className = 'empty';
      note.textContent = 'Line ' + targetLine + ' is outside the recorded hunks.';
      view.append(note);
    }
    const grid = document.createElement('div');
    grid.className = 'diff-grid';
    grid.tabIndex = 0;
    grid.setAttribute('role', 'region');
    grid.setAttribute('aria-label', 'Unified diff for ' + file.path + ', old and new line numbers');
    const previous = document.createElement('button');
    const next = document.createElement('button');
    const counter = document.createElement('span');
    function paint() {
      const start = page * pageSize;
      const fragment = document.createDocumentFragment();
      rows.slice(start, start + pageSize).forEach((row, i) => {
        const line = document.createElement('div');
        line.className = 'diff-row diff-' + row.kind;
        if (start + i === matchIndex) line.classList.add('diff-target');
        for (const value of [row.left, row.right, row.text]) {
          const cell = document.createElement('span');
          cell.textContent = String(value ?? '');
          line.append(cell);
        }
        fragment.append(line);
      });
      grid.replaceChildren(fragment);
      previous.disabled = page === 0;
      next.disabled = start + pageSize >= rows.length;
      counter.textContent = 'Page ' + (page + 1) + ' of ' + Math.ceil(rows.length / pageSize);
    }
    if (rows.length > pageSize) {
      const pager = document.createElement('div');
      pager.className = 'diff-pager';
      previous.type = next.type = 'button';
      previous.textContent = 'Previous';
      next.textContent = 'Next';
      previous.onclick = () => { page--; paint(); };
      next.onclick = () => { page++; paint(); };
      counter.setAttribute('role', 'status');
      pager.append(previous, counter, next);
      view.append(pager);
    }
    view.append(grid);
    paint();
    const highlighted = grid.querySelector('.diff-target');
    if (highlighted) grid.scrollTop = highlighted.getBoundingClientRect().top - grid.getBoundingClientRect().top - grid.clientHeight / 2;
  }
  fileItems.forEach((item) => item.addEventListener('toggle', () => {
    if (item.open) showPatch(item);
  }));

  function reveal(id, lineNumber) {
    const target = document.getElementById(id);
    if (!target) return;
    if (target.matches('.patch-file')) {
      if (target.hidden && search) { search.value = ''; filterPaths(); }
      target.open = true;
      showPatch(target, lineNumber);
    }
    if (target.matches('.evidence-item')) {
      if (target.classList.contains('hidden')) {
        const select = document.querySelector('[data-filter="evidence"]');
        select.value = 'all';
        select.dispatchEvent(new Event('change'));
      }
      target.open = true;
    }
  }
  function revealHash() {
    let id;
    try { id = decodeURIComponent(location.hash.slice(1)); } catch { return; }
    reveal(id);
  }
  document.addEventListener('click', (event) => {
    const link = event.target.closest('a[href^="#"]');
    if (!link || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    reveal(link.getAttribute('href').slice(1), Number(link.dataset.line) || undefined);
  });
  window.addEventListener('hashchange', revealHash);
  revealHash();
  const sections = links
    .map((link) => document.querySelector(link.getAttribute('href')))
    .filter(Boolean);
  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver((entries) => {
      const visible = entries.filter((entry) => entry.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (!visible) return;
      links.forEach((link) => link.setAttribute('aria-current', String(link.getAttribute('href') === '#' + visible.target.id)));
    }, { rootMargin: '-15% 0px -70% 0px', threshold: [0, 0.2, 0.8] });
    sections.forEach((section) => observer.observe(section));
  }
})();
`;
