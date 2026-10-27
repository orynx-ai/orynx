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

// The tour video's own player: a start button over the poster, then a bar that hides itself while it plays.
const player = document.querySelector<HTMLElement>('[data-player]');
const video = player?.querySelector('video');
if (player && video) {
  const start = player.querySelector<HTMLButtonElement>('[data-start]');
  const startLabel = player.querySelector<HTMLElement>('[data-start-label]');
  const bar = player.querySelector<HTMLElement>('[data-bar]');
  const toggle = player.querySelector<HTMLButtonElement>('[data-toggle]');
  const seek = player.querySelector<HTMLInputElement>('[data-seek]');
  const cc = player.querySelector<HTMLButtonElement>('[data-cc]');
  const mute = player.querySelector<HTMLButtonElement>('[data-mute]');
  const full = player.querySelector<HTMLButtonElement>('[data-full]');
  const current = player.querySelector<HTMLElement>('[data-current]');
  const total = player.querySelector<HTMLElement>('[data-total]');
  const track = video.textTracks[0];

  if (start && bar && toggle && seek && cc && mute && full && current && total) {
    video.controls = false;
    start.hidden = false;
    if (track) track.mode = 'hidden';

    const clock = (s: number) => `${String(Math.floor(s / 60))}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
    const fullscreen = () => document.fullscreenElement === player;
    const sync = () => {
      const playing = !video.paused && !video.ended;
      player.classList.toggle('is-playing', playing);
      toggle.setAttribute('aria-label', playing ? 'Pause' : 'Play');
      const p = video.duration ? video.currentTime / video.duration : 0;
      seek.value = String(Math.round(p * 1000));
      seek.style.setProperty('--p', `${String(p * 100)}%`);
      seek.setAttribute('aria-valuetext', `${clock(video.currentTime)} of ${clock(video.duration || 0)}`);
      current.textContent = clock(video.currentTime);
      mute.setAttribute('aria-pressed', String(video.muted));
      mute.setAttribute('aria-label', video.muted ? 'Unmute' : 'Mute');
      full.setAttribute('aria-label', fullscreen() ? 'Exit full screen' : 'Full screen');
    };
    const play = () => {
      start.hidden = true;
      bar.hidden = false;
      void video.play();
    };
    const flip = () => {
      if (video.paused || video.ended) play();
      else video.pause();
    };

    // The bar fades out 2.5 s after the pointer stops, unless the video is paused or focus is in the bar.
    let idle = 0;
    const wake = () => {
      player.classList.remove('is-idle');
      clearTimeout(idle);
      idle = window.setTimeout(() => {
        if (!video.paused && !bar.contains(document.activeElement)) player.classList.add('is-idle');
      }, 2500);
    };

    start.addEventListener('click', play);
    video.addEventListener('click', flip);
    toggle.addEventListener('click', flip);
    seek.addEventListener('input', () => {
      if (video.duration) video.currentTime = (Number(seek.value) / 1000) * video.duration;
      sync();
    });
    cc.addEventListener('click', () => {
      if (!track) return;
      track.mode = track.mode === 'showing' ? 'hidden' : 'showing';
      cc.setAttribute('aria-pressed', String(track.mode === 'showing'));
    });
    mute.addEventListener('click', () => {
      video.muted = !video.muted;
    });
    full.addEventListener('click', () => {
      // iPhone Safari can only put the video itself in full screen, with its own controls.
      const ios = video as HTMLVideoElement & { webkitEnterFullscreen?: () => void };
      if (fullscreen()) void document.exitFullscreen();
      else if ('requestFullscreen' in player) void player.requestFullscreen();
      else ios.webkitEnterFullscreen?.();
    });
    player.addEventListener('keydown', (event) => {
      if (event.target instanceof HTMLInputElement || event.metaKey || event.ctrlKey) return;
      const key = event.key.toLowerCase();
      const button = { m: mute, f: full, c: cc }[key];
      const action =
        key === 'k' || key === ' '
          ? flip
          : button &&
            (() => {
              button.click();
            });
      if (!action || (key === ' ' && event.target instanceof HTMLButtonElement)) return;
      event.preventDefault();
      action();
    });
    player.addEventListener('pointermove', wake);
    player.addEventListener('focusin', wake);
    for (const type of ['play', 'pause', 'timeupdate', 'seeked', 'volumechange', 'loadedmetadata']) {
      video.addEventListener(type, sync);
    }
    video.addEventListener('play', wake);
    video.addEventListener('loadedmetadata', () => {
      total.textContent = clock(video.duration);
    });
    video.addEventListener('ended', () => {
      if (startLabel) startLabel.textContent = 'Watch again';
      start.hidden = false;
      bar.hidden = true;
      player.classList.remove('is-idle');
    });
    document.addEventListener('fullscreenchange', sync);
  }
}
