let loaded = false;

export function loadRendererCss() {
  if (loaded || typeof document === 'undefined') return;
  loaded = true;

  const stylesheets = [
    {
      id: 'omf-bootstrap-css',
      href: 'https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css',
    },
    {
      id: 'omf-bootstrap-icons-css',
      href: 'https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.min.css',
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
  if (document.getElementById('omf-renderer-scope-css')) return;

  const style = document.createElement('style');
  style.id = 'omf-renderer-scope-css';
  style.textContent = `
    .omf-renderer-scope a:not([class*="btn"]) {
      color: inherit;
      text-decoration: inherit;
    }
    .omf-renderer-scope .formio-dialog {
      position: fixed;
      top: 0; left: 0; right: 0; bottom: 0;
      z-index: 10000;
      overflow: auto;
    }
    .omf-renderer-scope .formio-dialog-overlay {
      position: fixed;
      top: 0; left: 0; right: 0; bottom: 0;
      background: rgba(0,0,0,0.4);
      z-index: -1;
    }
    .omf-renderer-scope .formio-dialog-content {
      background: #f0f0f0;
      border-radius: 5px;
      width: 80%;
      max-width: 900px;
      margin: 40px auto;
      padding: 1em;
      position: relative;
    }
  `;
  document.head.appendChild(style);
}
