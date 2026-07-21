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
