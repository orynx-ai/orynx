const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// Reveal each section as it scrolls in. With reduced motion, show everything at once.
const reveals = document.querySelectorAll('.reveal');
if (reducedMotion) {
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

// The screens in tabs. They take turns on their own (the line under the tab is the time left) until you pick one;
// they wait while the pointer or focus is on them, or they are off screen. Arrow keys move between tabs.
const showcase = document.querySelector<HTMLElement>('[data-showcase]');
if (showcase) {
  const tabs = [...showcase.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
  const panels = tabs.map((tab) => document.getElementById(tab.getAttribute('aria-controls') ?? ''));
  let current = 0;

  const select = (index: number, focus = false) => {
    current = (index + tabs.length) % tabs.length;
    tabs.forEach((tab, at) => {
      const on = at === current;
      tab.setAttribute('aria-selected', String(on));
      tab.tabIndex = on ? 0 : -1;
      panels[at]?.classList.toggle('is-active', on);
    });
    if (focus) tabs[current]?.focus();
  };

  const stop = () => {
    showcase.classList.remove('is-playing');
  };

  tabs.forEach((tab, at) => {
    tab.addEventListener('click', () => {
      stop();
      select(at);
    });
    tab.addEventListener('keydown', (event) => {
      const step = { ArrowRight: 1, ArrowLeft: -1 }[event.key];
      const to =
        event.key === 'Home'
          ? 0
          : event.key === 'End'
            ? tabs.length - 1
            : step === undefined
              ? undefined
              : current + step;
      if (to === undefined) return;
      event.preventDefault();
      stop();
      select(to, true);
    });
    tab.addEventListener('animationend', () => {
      if (showcase.classList.contains('is-playing')) select(current + 1);
    });
  });
  select(0);

  if (!reducedMotion) {
    showcase.classList.add('is-playing');
    let hovered = false;
    let inView = false;
    const pause = () => {
      showcase.classList.toggle('is-paused', hovered || !inView || showcase.contains(document.activeElement));
    };
    showcase.addEventListener('pointerenter', () => {
      hovered = true;
      pause();
    });
    showcase.addEventListener('pointerleave', () => {
      hovered = false;
      pause();
    });
    showcase.addEventListener('focusin', pause);
    showcase.addEventListener('focusout', () => {
      setTimeout(pause);
    });
    new IntersectionObserver(([entry]) => {
      inView = entry?.isIntersecting ?? false;
      pause();
    }).observe(showcase);
  }
}

// Each typed line is as many characters wide as it holds.
for (const line of document.querySelectorAll<HTMLElement>('.terminal .type')) {
  line.style.setProperty('--n', String(line.textContent.length));
}

// A soft light under the pointer on each local-first tile.
for (const tile of document.querySelectorAll<HTMLElement>('.tile')) {
  tile.addEventListener('pointermove', (event) => {
    const box = tile.getBoundingClientRect();
    tile.style.setProperty('--mx', `${String(event.clientX - box.left)}px`);
    tile.style.setProperty('--my', `${String(event.clientY - box.top)}px`);
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
