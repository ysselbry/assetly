/* =========================================================
   landingPage.html – Log in, Sign up, Verify email, Verified
   Views: login | signup | verify | verified
   API (server.js): /api/login  /api/signup  /api/verify  /api/resend
   ========================================================= */

/* After a successful login, the token is saved and the user is sent here.
   Change these to match your dashboard. */
const AUTH = { tokenKey: 'token', userKey: 'user', dashboardUrl: '../index.html' };

Assetly.loadIncludes().then(() => {
  'use strict';
  const { $, state, api, setError, showFormError, validators, withBusy, init } = Assetly;

  const { go } = init({
    views: ['login', 'signup', 'verify', 'verified'],
    defaultView: 'login',
    needsEmail: ['verify'],

    // Verify email: send the 6-digit code
    async onCodeSubmit(_view, code) {
      const data = await api('/api/verify', { email: state.email, code });
      $('[data-pending-note]').hidden = data.status !== 'pending';   // waiting for custodian approval
      go('verified');
    },
    // Resend verification code
    async onResend() {
      const data = await api('/api/resend', { email: state.email, kind: 'verify' });
      return data.exp;
    },
  });

  /* Log in ---------------------------------------------------- */
  $('#form-login').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target, email = $('#login-email'), pass = $('#login-password');
    showFormError(form);
    const ok = [setError(email, validators.email(email)), setError(pass, validators.required(pass, 'Password'))].every(Boolean);
    if (!ok) return;

    await withBusy($('button[type=submit]', form), async () => {
      try {
        const data = await api('/api/login', { email: email.value.trim(), pass: pass.value });
        localStorage.setItem(AUTH.tokenKey, data.token);
        localStorage.setItem(AUTH.userKey, JSON.stringify(data.user));
        location.href = AUTH.dashboardUrl;
      } catch (err) {
        if (err.data?.step === 'verify') {            // account not verified yet → new code was sent
          state.email = err.data.email; state.exp = err.data.exp;
          go('verify');
        } else {
          showFormError(form, err.message);           // wrong password, locked, waiting/rejected…
        }
      }
    });
  });

  /* Sign up --------------------------------------------------- */
  $('#form-signup').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    const first = $('#su-first'), last = $('#su-last'), email = $('#su-email'),
          pass = $('#su-pass'), confirm = $('#su-confirm');
    showFormError(form);
    const ok = [
      setError(first, validators.required(first, 'First name')),
      setError(last, validators.required(last, 'Last name')),
      setError(email, validators.email(email)),
      setError(pass, validators.password(pass)),
      setError(confirm, confirm.value && confirm.value === pass.value ? '' : 'Passwords do not match.'),
    ].every(Boolean);
    if (!ok) return;

    await withBusy($('button[type=submit]', form), async () => {
      try {
        const data = await api('/api/signup', {
          first: first.value.trim(), last: last.value.trim(), email: email.value.trim(), pass: pass.value,
        });
        state.email = data.email; state.exp = data.exp;
        form.reset();
        go('verify');
      } catch (err) {
        showFormError(form, err.message);
      }
    });
  });
});
