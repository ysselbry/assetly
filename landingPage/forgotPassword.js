/* =========================================================
   forgotPassword.html – 3-step reset flow
   Views: forgot | reset-code | reset-password | reset-done
   API (server.js): /api/forgot  /api/forgot/verify  /api/reset  /api/resend
   ========================================================= */
Assetly.loadIncludes().then(() => {
  'use strict';
  const { $, $$, CONFIG, state, api, setError, showFormError, validators, withBusy, init } = Assetly;

  const { go } = init({
    views: ['forgot', 'reset-code', 'reset-password', 'reset-done'],
    defaultView: 'forgot',
    needsEmail: ['reset-code', 'reset-password'],

    // Step 2: check the 6-digit code
    async onCodeSubmit(_view, code) {
      await api('/api/forgot/verify', { email: state.email, code });
      state.code = code;                      // /api/reset needs it again in step 3
      go('reset-password');
    },
    // Resend reset code
    async onResend() {
      const data = await api('/api/resend', { email: state.email, kind: 'reset' });
      return data.exp;
    },
  });

  /* Step 1: email ---------------------------------------------- */
  $('#form-forgot').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target, email = $('#fp-email');
    showFormError(form);
    if (!setError(email, validators.email(email))) return;

    await withBusy($('button[type=submit]', form), async () => {
      try {
        const data = await api('/api/forgot', { email: email.value.trim() });
        state.email = email.value.trim(); state.exp = data.exp;
        go('reset-code');
      } catch (err) {
        showFormError(form, err.message);
      }
    });
  });

  /* Step 3: new password --------------------------------------- */
  const pass = $('#np-pass'), confirm = $('#np-confirm');
  const rules = $$('#pw-rules li');
  const refreshRules = () =>
    rules.forEach((li) => li.classList.toggle('is-met', CONFIG.passwordRules[li.dataset.rule](pass.value)));
  pass.addEventListener('input', refreshRules);

  $('#form-reset').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    showFormError(form);
    const strong = Object.values(CONFIG.passwordRules).every((r) => r(pass.value));
    const match = pass.value === confirm.value;
    setError(confirm, !strong ? 'Meet all password requirements first.' : match ? '' : 'Passwords do not match.');
    if (!strong || !match) return;

    await withBusy($('button[type=submit]', form), async () => {
      try {
        await api('/api/reset', { email: state.email, code: state.code, pass: pass.value });
        form.reset(); refreshRules();
        state.code = '';
        go('reset-done');
      } catch (err) {
        showFormError(form, err.message);     // e.g. code expired → start over from step 1
      }
    });
  });
});
