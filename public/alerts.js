/* ── Kinabridge Toast Alert System ─────────────── */
/* Adapted from Kinabase UI AlertHandler architecture */

const AlertHandler = (() => {
  let nextId = 1;
  const alerts = new Map();
  let containerBottom = null;
  let containerTop = null;

  const DEFAULTS = {
    duration: 4000,
    variant: 'primary',
    position: 'bottom',
    showClose: true,
  };

  const VARIANT_ICONS = {
    success: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>',
    danger: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
    warning: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
    primary: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>',
    info: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>',
  };

  const escapeHtml = (str) => {
    const div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
  };

  const ensureContainers = () => {
    if (!containerBottom) {
      containerBottom = document.createElement('div');
      containerBottom.className = 'toast-box toast-box--bottom';
      document.body.appendChild(containerBottom);
    }
    if (!containerTop) {
      containerTop = document.createElement('div');
      containerTop.className = 'toast-box toast-box--top';
      document.body.appendChild(containerTop);
    }
  };

  const buildToastEl = (alert) => {
    const el = document.createElement('div');
    el.className = `toast-alert toast-alert--${alert.variant}`;
    el.dataset.id = alert.id;

    // Build inner HTML
    let html = '<div class="toast-inner">';

    // Icon
    const icon = VARIANT_ICONS[alert.variant] || VARIANT_ICONS.primary;
    html += `<div class="toast-icon">${icon}</div>`;

    html += '<div class="toast-body">';

    // Header row (title + action buttons)
    const hasHeaderActions = alert.showClose || alert.copyContent || alert.code;
    if (alert.title || hasHeaderActions) {
      html += '<div class="toast-header">';
      if (alert.title) {
        html += `<div class="toast-title">${escapeHtml(alert.title)}</div>`;
      }
      html += '<div class="toast-header-actions">';
      if (alert.code) {
        html += `<span class="toast-code">${escapeHtml(alert.code)}</span>`;
      }
      if (alert.copyContent) {
        html += '<button class="toast-action-btn" data-action="copy" title="Copy"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg></button>';
      }
      if (alert.showClose) {
        html += '<button class="toast-action-btn" data-action="close" title="Close"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>';
      }
      html += '</div></div>';
    }

    // Content
    if (alert.content) {
      html += `<div class="toast-content">${escapeHtml(alert.content)}</div>`;
    }

    // Action buttons
    if (alert.actions?.length) {
      html += '<div class="toast-actions">';
      alert.actions.forEach((action, idx) => {
        const variant = action.variant || alert.variant;
        html += `<button class="toast-btn toast-btn--${variant}" data-action-idx="${idx}">${escapeHtml(action.label)}</button>`;
      });
      html += '</div>';
    }

    html += '</div></div>';

    // Progress bar for timed alerts
    if (alert.duration !== 'never') {
      html += `<div class="toast-progress toast-progress--${alert.variant}"><div class="toast-progress-bar" style="animation-duration:${alert.duration}ms"></div></div>`;
    }

    el.innerHTML = html;

    // Event listeners
    const closeBtn = el.querySelector('[data-action="close"]');
    if (closeBtn) closeBtn.addEventListener('click', () => closeAlert(alert.id));

    const copyBtn = el.querySelector('[data-action="copy"]');
    if (copyBtn) {
      copyBtn.addEventListener('click', () => {
        navigator.clipboard?.writeText(alert.copyContent).then(() => {
          copyBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
          setTimeout(() => {
            copyBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
          }, 1500);
        });
      });
    }

    // Action button listeners
    el.querySelectorAll('[data-action-idx]').forEach((btn) => {
      const idx = Number(btn.dataset.actionIdx);
      btn.addEventListener('click', async () => {
        const btns = el.querySelectorAll('.toast-btn');
        btns.forEach(b => b.disabled = true);
        try {
          await alert.actions[idx].onClick();
        } catch { /* ignore */ }
        closeAlert(alert.id);
      });
    });

    return el;
  };

  const closeAlert = (id) => {
    const entry = alerts.get(id);
    if (!entry) return;

    clearTimeout(entry.timer);
    entry.el.classList.add('toast-alert--exiting');

    setTimeout(() => {
      entry.el.remove();
      alerts.delete(id);
    }, 300);
  };

  /**
   * Show a toast alert.
   * @param {Object} alert
   * @param {string} alert.content - Main message text (required)
   * @param {string} [alert.title] - Bold title
   * @param {'success'|'danger'|'warning'|'primary'|'info'} [alert.variant='primary']
   * @param {number|'never'} [alert.duration=4000] - Auto-dismiss ms, or 'never'
   * @param {'top'|'bottom'} [alert.position='bottom']
   * @param {boolean} [alert.showClose=true]
   * @param {string} [alert.code] - Error code badge
   * @param {string} [alert.copyContent] - Text for copy button
   * @param {Array<{label: string, onClick: Function, variant?: string}>} [alert.actions]
   * @returns {number} Alert id for programmatic dismissal
   */
  const addAlert = (alert) => {
    ensureContainers();

    const merged = { ...DEFAULTS, ...alert, id: nextId++ };
    const el = buildToastEl(merged);

    const container = merged.position === 'top' ? containerTop : containerBottom;
    if (merged.position === 'top') {
      container.appendChild(el);
    } else {
      container.insertBefore(el, container.firstChild);
    }

    // Trigger entrance animation on next frame
    requestAnimationFrame(() => el.classList.add('toast-alert--active'));

    let timer = null;
    if (merged.duration !== 'never') {
      timer = setTimeout(() => closeAlert(merged.id), merged.duration);
    }

    alerts.set(merged.id, { el, timer, alert: merged });
    return merged.id;
  };

  // Convenience methods
  const success = (content, opts = {}) => addAlert({ ...opts, content, variant: 'success' });
  const danger = (content, opts = {}) => addAlert({ copyContent: content, ...opts, content, variant: 'danger' });
  const warning = (content, opts = {}) => addAlert({ ...opts, content, variant: 'warning' });
  const info = (content, opts = {}) => addAlert({ ...opts, content, variant: 'primary' });

  return { addAlert, closeAlert, success, danger, warning, info };
})();

// Expose globally
window.AlertHandler = AlertHandler;
