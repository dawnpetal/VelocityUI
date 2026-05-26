const toast = (() => {
  function _build(text, type, duration, options = {}) {
    const container = document.getElementById('toastContainer');
    if (!container) return null;
    const el = document.createElement('div');
    el.className = `toast toast-${type} ${type}`;
    const content = document.createElement('div');
    content.className = 'toast-content';
    const msg = document.createElement('span');
    msg.className = 'toast-message';
    msg.textContent = text;
    content.appendChild(msg);
    const actions = Array.isArray(options.actions)
      ? options.actions
      : options.label
        ? [{ label: options.label, onClick: options.onClick, primary: true }]
        : [];
    if (actions.length) {
      const actionWrap = document.createElement('div');
      actionWrap.className = 'toast-actions';
      for (const action of actions) {
        if (!action?.label) continue;
        const btn = document.createElement('button');
        btn.className = `toast-action${action.primary ? ' toast-action-primary' : ''}`;
        btn.type = 'button';
        btn.textContent = action.label;
        btn.addEventListener('click', async (event) => {
          event.preventDefault();
          event.stopPropagation();
          btn.disabled = true;
          try {
            if (typeof action.onClick === 'function') await action.onClick();
            if (action.dismiss !== false) _remove(el);
          } catch (err) {
            btn.disabled = false;
            console.warn('[toast] action failed', err);
          }
        });
        actionWrap.appendChild(btn);
      }
      if (actionWrap.childElementCount) content.appendChild(actionWrap);
    }
    const dismiss = document.createElement('button');
    dismiss.className = 'toast-dismiss';
    dismiss.innerHTML = '&#x2715;';
    dismiss.addEventListener('click', () => _remove(el));
    el.appendChild(content);
    el.appendChild(dismiss);
    container.appendChild(el);
    if (duration > 0) el._toastTimer = setTimeout(() => _remove(el), duration);
    return { el, msg };
  }
  function show(text, type = 'info', duration = 2500, options = {}) {
    return _build(text, type, duration, options);
  }
  function progress(text, type = 'info') {
    const view = _build(text, type, 0);
    if (!view) return null;
    const bar = document.createElement('span');
    bar.className = 'toast-progress is-indeterminate';
    view.el.appendChild(bar);
    const update = (nextText, value = null) => {
      if (nextText) view.msg.textContent = nextText;
      const pct = Number(value);
      const determinate = Number.isFinite(pct);
      bar.classList.toggle('is-indeterminate', !determinate);
      bar.style.transform = determinate ? `scaleX(${Math.max(0.02, Math.min(1, pct))})` : '';
    };
    const settle = (nextText, nextType, duration) => {
      update(nextText, 1);
      view.el.className = `toast toast-${nextType} ${nextType}`;
      clearTimeout(view.el._toastTimer);
      view.el._toastTimer = setTimeout(() => _remove(view.el), duration);
    };
    return {
      update,
      finish: (nextText) => settle(nextText, 'ok', 2200),
      fail: (nextText) => settle(nextText, 'warn', 3200),
      dismiss: () => _remove(view.el),
    };
  }
  function _remove(el) {
    if (el._removed) return;
    el._removed = true;
    clearTimeout(el._toastTimer);
    el.style.animation = 'toastOut 0.16s ease forwards';
    const cleanup = () => el.remove();
    el.addEventListener('animationend', cleanup, {
      once: true,
    });
    setTimeout(cleanup, 300);
  }
  return {
    show,
    progress,
  };
})();
