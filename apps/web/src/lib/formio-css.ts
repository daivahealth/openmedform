let loaded = false;

export function loadFormioCss() {
  if (loaded || typeof document === 'undefined') return;
  loaded = true;

  const stylesheets = [
    {
      id: 'formio-bootstrap-css',
      href: 'https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css',
    },
    {
      id: 'formio-bootstrap-icons-css',
      href: 'https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.min.css',
    },
    {
      id: 'formio-css',
      href: '/vendor/formio.full.min.css',
    },
  ];

  for (const { id, href } of stylesheets) {
    if (document.getElementById(id)) continue;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    link.id = id;
    document.head.appendChild(link);
  }

  injectScopeOverrides();
}

function injectScopeOverrides() {
  if (document.getElementById('formio-scope-css')) return;

  const style = document.createElement('style');
  style.id = 'formio-scope-css';
  style.textContent = `
    /*
     * Undo Bootstrap's global resets for elements outside formio containers.
     * Bootstrap sets styles on body, *, a, button, input etc. that conflict with Tailwind.
     * We re-apply Tailwind-compatible defaults for the app shell here.
     */

    /* Fix links outside formio (Bootstrap adds underlines and changes colors) */
    :where(:not(.formio-builder-scope, .formio-renderer-scope, .formio-dialog)) a:not([class*="btn"]) {
      color: inherit;
      text-decoration: inherit;
    }

    /* Fix buttons outside formio (Bootstrap resets button styles) */
    :where(:not(.formio-builder-scope, .formio-renderer-scope)) button {
      background-color: transparent;
    }

    /* Ensure formio builder layout is correct */
    .formio-builder-scope .formbuilder {
      display: flex;
    }

    .formio-builder-scope .formarea {
      flex: 1;
      min-height: 400px;
      padding: 8px;
    }

    .formio-builder-scope .formcomponents {
      min-width: 220px;
      padding: 16px 18px;
      transition: min-width 0.2s ease, width 0.2s ease, padding 0.2s ease, opacity 0.2s ease;
      overflow: hidden;
    }

    .formio-builder-scope.sidebar-collapsed .formcomponents {
      min-width: 0;
      width: 0;
      padding: 0;
      opacity: 0;
      pointer-events: none;
    }

    .formio-builder-scope .formcomponents .form-group {
      margin-bottom: 4px;
    }

    .formio-builder-scope .formcomponents .builder-group-button {
      padding: 10px 12px;
    }

    .formio-builder-scope .formcomponents .formio-builder-form {
      padding: 0 4px;
    }

    .formio-builder-scope .formcomponents input.form-control {
      padding: 8px 12px;
      margin-bottom: 8px;
    }

    /* Drag-and-drop containers need visible height */
    .formio-builder-scope .drag-container {
      min-height: 80px;
      padding: 10px;
    }

    .formio-builder-scope .formio-component-hidden {
      display: inherit;
    }

    /* Builder component buttons should look clickable */
    .formio-builder-scope .formcomponent {
      cursor: grab;
    }

    .formio-builder-scope .formcomponent:active {
      cursor: grabbing;
    }

    /* Dialog z-index reinforcement (main styles in globals.css) */
    .formio-dialog {
      z-index: 10000 !important;
    }
  `;
  document.head.appendChild(style);
}
