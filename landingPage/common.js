/* =========================================================
   Assetly – shared front-end helpers (loaded on every auth page)
   window.Assetly = { CONFIG, state, $, $$, api, setError, showFormError,
                      validators, loadIncludes, startTimers, init }
   ========================================================= */
window.Assetly = (() => {
  'use strict';

  /* 1. Config ---------------------------------------------- */
  const CONFIG = {
    codeLength: 6,
    resendCooldownSeconds: 30,
    passwordRules: {
      length: (v) => v.length >= 8,
      number: (v) => /\d/.test(v),
      symbol: (v) => /[^A-Za-z0-9]/.test(v),
    },
  };
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  // email/code carried between steps; exp = code expiry (ms timestamp from the server)
  const state = { email: '', code: '', exp: 0 };

  /* 2. Helpers --------------------------------------------- */
  const $  = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const formatTime = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

  /* POST JSON to the Express API. Throws Error(message) with .data and .status */
  async function api(url, body = {}) {
    let res;
    try {
      res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    } catch {
      throw new Error("Can't reach the server. Make sure it is running (npm start).");
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error(data.error || 'Something went wrong. Try again.'), { data, status: res.status });
    return data;
  }

  /* Load <div data-include="file.html"> partials into the page */
  const loadIncludes = () =>
    Promise.all($$('[data-include]').map(async (el) => {
      const res = await fetch(el.dataset.include);
      el.outerHTML = await res.text();
    }));

  /* 3. Validation + messages ------------------------------- */
  function setError(input, message) {
    const field = input.closest('.field');
    const out = $('.field__error', field);
    field.classList.toggle('has-error', Boolean(message));
    if (out) { out.textContent = message || ''; out.hidden = !message; }
    return !message;
  }
  function showFormError(form, message = '') {
    const out = $('[data-form-error]', form);
    out.textContent = message;
    out.hidden = !message;
  }
  const validators = {
    required: (input, label) => (input.value.trim() ? '' : `${label} is required.`),
    email: (input) =>
      !input.value.trim() ? 'Email is required.'
      : EMAIL_RE.test(input.value.trim()) ? '' : 'Enter a valid email, like name@school.edu.',
    password: (input) =>
      Object.values(CONFIG.passwordRules).every((r) => r(input.value)) ? '' : 'Use 8+ characters with a number and a symbol.',
  };

  /* Disable a submit button while a request is running */
  async function withBusy(button, task) {
    button.disabled = true;
    try { return await task(); } finally { button.disabled = false; }
  }

  /* 4. Password visibility toggle + live error clearing ---- */
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-toggle-password]');
    if (!btn) return;
    const input = $('input', btn.parentElement);
    const hidden = input.type === 'password';
    input.type = hidden ? 'text' : 'password';
    btn.classList.toggle('is-on', hidden);
    btn.setAttribute('aria-label', hidden ? 'Hide password' : 'Show password');
  });
  document.addEventListener('input', (e) => {
    if (e.target.matches('.field input')) setError(e.target, '');
  });

  /* 5. OTP boxes ------------------------------------------- */
  function buildOtp(container) {
    for (let i = 0; i < CONFIG.codeLength; i++) {
      const input = document.createElement('input');
      Object.assign(input, { type: 'text', inputMode: 'numeric', maxLength: 1, autocomplete: 'one-time-code' });
      input.setAttribute('aria-label', `Digit ${i + 1}`);
      container.appendChild(input);
    }
    const boxes = $$('input', container);
    container.addEventListener('input', (e) => {
      const i = boxes.indexOf(e.target);
      e.target.value = e.target.value.replace(/\D/g, '');
      if (e.target.value && boxes[i + 1]) boxes[i + 1].focus();
      container.classList.remove('has-error');
    });
    container.addEventListener('keydown', (e) => {
      const i = boxes.indexOf(e.target);
      if (e.key === 'Backspace' && !e.target.value && boxes[i - 1]) boxes[i - 1].focus();
      if (e.key === 'ArrowLeft' && boxes[i - 1]) boxes[i - 1].focus();
      if (e.key === 'ArrowRight' && boxes[i + 1]) boxes[i + 1].focus();
    });
    container.addEventListener('paste', (e) => {
      e.preventDefault();
      const digits = (e.clipboardData.getData('text') || '').replace(/\D/g, '').slice(0, CONFIG.codeLength);
      digits.split('').forEach((d, i) => (boxes[i].value = d));
      boxes[Math.min(digits.length, boxes.length - 1)].focus();
    });
  }
  const getCode  = (otp) => $$('input', otp).map((b) => b.value).join('');
  const resetOtp = (otp) => $$('input', otp).forEach((b) => (b.value = ''));

  /* 6. Expiry (from server timestamp) + resend cooldown ---- */
  const timers = new WeakMap();
  function stopTimers(view) { clearInterval(timers.get(view)); timers.delete(view); }
  function startTimers(view, exp, resetCooldown = true) {
    stopTimers(view);
    const expiryEl = $('[data-expiry]', view);
    const resendBtn = $('[data-resend]', view);
    let resend = resetCooldown ? CONFIG.resendCooldownSeconds : 0;
    const render = () => {
      expiryEl.textContent = formatTime(Math.max(0, Math.round((exp - Date.now()) / 1000)));
      resendBtn.disabled = resend > 0;
      resendBtn.innerHTML = resend > 0 ? `Resend code in <span>${formatTime(resend)}</span>` : 'Resend code';
    };
    render();
    timers.set(view, setInterval(() => { resend = Math.max(0, resend - 1); render(); }, 1000));
  }

  /* 7. Page bootstrap (router + OTP wiring) ---------------- */
  /* options:
       views, defaultView, needsEmail (views that require state.email),
       onCodeSubmit(viewName, code)  async – throw to show an error
       onResend(viewName)            async – return the new exp timestamp */
  function init({ views, defaultView, needsEmail = [], onCodeSubmit, onResend }) {
    $$('[data-otp]').forEach(buildOtp);

    function show(name) {
      if (!views.includes(name) || (needsEmail.includes(name) && !state.email)) name = defaultView;
      $$('[data-view]').forEach((v) => { v.hidden = v.dataset.view !== name; if (v.hidden) stopTimers(v); });
      $$('[data-email-target]').forEach((el) => (el.textContent = state.email || 'name@school.edu'));
      const view = $(`[data-view="${name}"]`);
      if ($('[data-otp]', view) && state.exp) startTimers(view, state.exp);
      const first = $('input', view);
      if (first) first.focus({ preventScroll: true });
    }
    const go = (name) => { location.hash === `#${name}` ? show(name) : (location.hash = name); };
    window.addEventListener('hashchange', () => show(location.hash.slice(1)));

    document.addEventListener('click', async (e) => {
      const resendBtn = e.target.closest('[data-resend]');
      if (resendBtn && !resendBtn.disabled) {
        const view = resendBtn.closest('[data-view]');
        resendBtn.disabled = true;
        try {
          state.exp = await onResend(view.dataset.view);
          resetOtp($('[data-otp]', view));
          startTimers(view, state.exp);
        } catch (err) {
          const out = $('[data-otp-error]', view);
          out.textContent = err.message; out.hidden = false;
          startTimers(view, state.exp, false);
        }
      }

      const submit = e.target.closest('[data-otp-submit]');
      if (submit) {
        const view = submit.closest('[data-view]');
        const otp = $('[data-otp]', view), out = $('[data-otp-error]', view);
        const code = getCode(otp);
        const showError = (msg) => { otp.classList.toggle('has-error', Boolean(msg)); out.textContent = msg; out.hidden = !msg; };
        if (code.length !== CONFIG.codeLength) return showError('Enter all 6 digits of the code.');
        showError('');
        await withBusy(submit, async () => {
          try { await onCodeSubmit(view.dataset.view, code); resetOtp(otp); }
          catch (err) { showError(err.message); }
        });
      }
    });

    show(location.hash.slice(1) || defaultView);
    return { show, go };
  }

  return { CONFIG, state, $, $$, api, setError, showFormError, validators, withBusy, loadIncludes, init };
})();
