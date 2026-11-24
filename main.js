(() => {
  const REF_W = 1264;
  const REF_H = 2780;

  const CYCLE_MS = 7000;
  const BLOW_MS = 2000;
  const FADE_MS = 2600;

  const RIGHT = { x: 900, y: 1450, w: 364, h: 1330 };
  const LEFT = { x: -24, y: 0, w: 364, h: 1330 };

  const stage = document.getElementById('stage');
  const canvas = document.getElementById('smoke');
  const ctx = canvas.getContext('2d', { alpha: true });
  const hint = document.getElementById('hint');
  const snd = document.getElementById('snd');

  const params = new URLSearchParams(location.search);
  const freeze = params.has('t') ? Math.max(0, parseFloat(params.get('t')) || 0) : null;

  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  let fit = 1;

  function layout() {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    fit = Math.min(vw / REF_W, vh / REF_H);
    const w = REF_W * fit;
    const h = REF_H * fit;

    stage.style.width = w + 'px';
    stage.style.height = h + 'px';
    stage.style.setProperty('--u', fit + 'px');

    canvas.width = Math.max(1, Math.round(REF_W * fit * dpr));
    canvas.height = Math.max(1, Math.round(REF_H * fit * dpr));
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    ctx.setTransform(fit * dpr, 0, 0, fit * dpr, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
  }

  const smooth = (t) => {
    t = Math.max(0, Math.min(1, t));
    return t * t * (3 - 2 * t);
  };
  const easeOutCubic = (t) => 1 - Math.pow(1 - Math.max(0, Math.min(1, t)), 3);

  const tmpR = document.createElement('canvas');
  tmpR.width = RIGHT.w; tmpR.height = RIGHT.h;
  const ctxR = tmpR.getContext('2d');

  const tmpL = document.createElement('canvas');
  tmpL.width = LEFT.w; tmpL.height = LEFT.h;
  const ctxL = tmpL.getContext('2d');

  let imgR = null;
  let imgL = null;

  function loadImg(src) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = src;
    });
  }

  function load() {
    return Promise.all([
      loadImg('assets/smoke_right.png'),
      loadImg('assets/smoke_left.png')
    ]).then(([a, b]) => { imgR = a; imgL = b; });
  }

  let audioEnabled = false;

  function enableAudio() {
    if (audioEnabled) return;
    audioEnabled = true;
    hint.classList.add('gone');
    snd.volume = 0;
    const pr = snd.play();
    if (pr && pr.then) {
      pr.then(() => {
        snd.pause();
        snd.currentTime = 0;
        snd.volume = 0.9;
      }).catch(() => { snd.volume = 0.9; });
    } else {
      try { snd.pause(); snd.currentTime = 0; } catch (e) {}
      snd.volume = 0.9;
    }
  }

  function playSound() {
    if (!audioEnabled || freeze !== null) return;
    try {
      snd.currentTime = 0;
      snd.volume = 0.9;
      const pr = snd.play();
      if (pr && pr.catch) pr.catch(() => {});
    } catch (e) {}
  }

  window.addEventListener('pointerdown', enableAudio, { passive: true });
  window.addEventListener('touchstart', enableAudio, { passive: true });
  window.addEventListener('keydown', enableAudio);

  function maskLayers(c, img, w, h, reveal, fromBottom) {
    c.clearRect(0, 0, w, h);
    if (!img) return;
    c.globalCompositeOperation = 'source-over';
    c.drawImage(img, 0, 0);

    const rh = Math.max(0, Math.min(1, reveal)) * h;
    const feather = Math.min(170, Math.max(1, rh * 0.45));
    const g = c.createLinearGradient(0, 0, 0, h);

    if (fromBottom) {
      const edge = Math.max(0, (h - rh) / h);
      const featherEdge = Math.min(1, (h - rh + feather) / h);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(Math.min(0.999, edge), 'rgba(0,0,0,0)');
      g.addColorStop(Math.min(0.9999, featherEdge), 'rgba(0,0,0,1)');
      g.addColorStop(1, 'rgba(0,0,0,1)');
    } else {
      const edge = Math.min(1, rh / h);
      const featherEdge = Math.max(0, (rh - feather) / h);
      g.addColorStop(0, 'rgba(0,0,0,1)');
      g.addColorStop(Math.max(0.0001, featherEdge), 'rgba(0,0,0,1)');
      g.addColorStop(Math.min(0.9999, edge), 'rgba(0,0,0,0)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
    }

    c.globalCompositeOperation = 'destination-in';
    c.fillStyle = g;
    c.fillRect(0, 0, w, h);
    c.globalCompositeOperation = 'source-over';
  }

  function renderColumn(reveal, alpha) {
    if (alpha <= 0.001 || reveal <= 0.001) return;

    ctx.globalAlpha = alpha;

    maskLayers(ctxR, imgR, RIGHT.w, RIGHT.h, reveal, false);
    ctx.drawImage(tmpR, 0, 0, RIGHT.w, RIGHT.h, RIGHT.x, RIGHT.y, RIGHT.w, RIGHT.h);

    maskLayers(ctxL, imgL, LEFT.w, LEFT.h, reveal, true);
    ctx.drawImage(tmpL, 0, 0, LEFT.w, LEFT.h, LEFT.x, LEFT.y, LEFT.w, LEFT.h);

    ctx.globalAlpha = 1;
  }

  function compute(ms) {
    const t = ms % CYCLE_MS;
    if (t < BLOW_MS) {
      return { reveal: easeOutCubic(t / BLOW_MS), alpha: 1 };
    }
    return { reveal: 1, alpha: 1 - smooth((t - BLOW_MS) / FADE_MS) };
  }

  let t0 = 0;
  let cycle = -1;

  function frame(now) {
    const elapsed = now - t0;
    const ci = Math.floor(elapsed / CYCLE_MS);
    if (ci !== cycle) {
      cycle = ci;
      playSound();
    }
    const { reveal, alpha } = compute(elapsed);
    ctx.clearRect(0, 0, REF_W, REF_H);
    renderColumn(reveal, alpha);
    requestAnimationFrame(frame);
  }

  layout();
  window.addEventListener('resize', layout);
  window.addEventListener('orientationchange', () => setTimeout(layout, 120));

  load().then(() => {
    if (freeze !== null) {
      const { reveal, alpha } = compute(freeze * 1000);
      ctx.clearRect(0, 0, REF_W, REF_H);
      renderColumn(reveal, alpha);
      return;
    }
    t0 = performance.now();
    requestAnimationFrame(frame);
  });
})();
