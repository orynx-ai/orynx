// Reveal each section as it scrolls in. With reduced motion, show everything at once.
const reveals = document.querySelectorAll('.reveal');
if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
  reveals.forEach((el) => {
    el.classList.add('is-visible');
  });
} else {
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      }
    },
    { rootMargin: '0px 0px -8% 0px' },
  );
  reveals.forEach((el) => {
    observer.observe(el);
  });
}

// Copy the get-started commands. If the clipboard is blocked, select the code so ⌘C still works.
const status = document.querySelector('[data-copy-status]');
for (const button of document.querySelectorAll<HTMLButtonElement>('[data-copy]')) {
  const label = button.textContent;
  button.addEventListener('click', () => {
    const show = (text: string) => {
      button.textContent = text;
      if (status) status.textContent = text;
      setTimeout(() => {
        button.textContent = label;
      }, 2000);
    };
    // Through a promise, so a page without the clipboard API (plain http) lands in the fallback too.
    Promise.resolve()
      .then(() => navigator.clipboard.writeText(button.dataset['copy'] ?? ''))
      .then(
        () => {
          show('Copied');
        },
        () => {
          const code = button.closest('figure')?.querySelector('code');
          if (code) window.getSelection()?.selectAllChildren(code);
          show('Selected');
        },
      );
  });
}

const year = document.querySelector('[data-year]');
if (year) year.textContent = String(new Date().getFullYear());
