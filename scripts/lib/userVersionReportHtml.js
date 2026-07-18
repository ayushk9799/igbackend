const serializeForHtml = (value) => (
    JSON.stringify(value)
        .replaceAll('<', '\\u003c')
        .replaceAll('>', '\\u003e')
        .replaceAll('&', '\\u0026')
        .replaceAll('\u2028', '\\u2028')
        .replaceAll('\u2029', '\\u2029')
);

export const createUserVersionReportHtml = (report) => {
    const reportJson = serializeForHtml(report);

    return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>User Platform & Version Report</title>
  <style>
    :root {
      color-scheme: light;
      --ink: #17211b;
      --muted: #65736a;
      --line: #dfe7e1;
      --paper: #ffffff;
      --wash: #f3f6f2;
      --green: #1f6a48;
      --green-soft: #dff2e7;
      --amber: #946216;
      --amber-soft: #fff0ca;
      --red: #a43c35;
      --red-soft: #fde6e3;
      --blue: #275d91;
      --blue-soft: #e4effa;
      --shadow: 0 18px 55px rgba(27, 48, 35, .09);
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: linear-gradient(180deg, #eaf0e8 0, var(--wash) 260px, var(--wash) 100%);
      color: var(--ink);
      font-family: Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    button, input, select { font: inherit; }
    .shell { width: min(1500px, calc(100% - 32px)); margin: 0 auto; padding: 38px 0 56px; }
    header { display: flex; align-items: end; justify-content: space-between; gap: 24px; margin-bottom: 24px; }
    .eyebrow { margin: 0 0 7px; color: var(--green); font-size: 12px; font-weight: 800; letter-spacing: .12em; text-transform: uppercase; }
    h1 { margin: 0; font-family: Georgia, "Times New Roman", serif; font-size: clamp(30px, 4vw, 48px); font-weight: 500; letter-spacing: -.035em; }
    .generated { color: var(--muted); font-size: 13px; white-space: nowrap; }
    .cards { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 12px; margin-bottom: 16px; }
    .card { min-height: 112px; padding: 18px; border: 1px solid rgba(255,255,255,.8); border-radius: 16px; background: rgba(255,255,255,.84); box-shadow: var(--shadow); }
    .card-label { color: var(--muted); font-size: 12px; font-weight: 750; letter-spacing: .05em; text-transform: uppercase; }
    .card-value { margin-top: 12px; font-family: Georgia, "Times New Roman", serif; font-size: 34px; line-height: 1; }
    .card-note { margin-top: 8px; color: var(--muted); font-size: 12px; }
    .panel { border: 1px solid var(--line); border-radius: 18px; background: var(--paper); box-shadow: var(--shadow); overflow: hidden; }
    .filters { display: grid; grid-template-columns: minmax(220px, 1.8fr) repeat(4, minmax(145px, 1fr)) auto; gap: 10px; padding: 16px; border-bottom: 1px solid var(--line); background: #fbfcfb; }
    .control { display: grid; gap: 5px; }
    .control label { color: var(--muted); font-size: 11px; font-weight: 750; text-transform: uppercase; letter-spacing: .06em; }
    input, select { width: 100%; min-height: 40px; padding: 8px 10px; border: 1px solid #ccd7cf; border-radius: 9px; background: white; color: var(--ink); outline: none; }
    input:focus, select:focus { border-color: var(--green); box-shadow: 0 0 0 3px rgba(31,106,72,.12); }
    .button-stack { align-self: end; display: flex; gap: 8px; }
    button { min-height: 40px; padding: 8px 13px; border: 1px solid #c8d3cb; border-radius: 9px; background: white; color: var(--ink); cursor: pointer; font-weight: 700; }
    button:hover { border-color: var(--green); color: var(--green); }
    button.primary { border-color: var(--green); background: var(--green); color: white; }
    button.primary:hover { background: #174f37; color: white; }
    .table-meta { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 13px 16px; border-bottom: 1px solid var(--line); }
    #result-count { color: var(--muted); font-size: 13px; }
    .table-wrap { overflow: auto; max-height: 65vh; }
    table { width: 100%; min-width: 1300px; border-collapse: separate; border-spacing: 0; font-size: 13px; }
    th { position: sticky; top: 0; z-index: 2; padding: 11px 12px; border-bottom: 1px solid var(--line); background: #f7f9f7; color: #4d5c52; text-align: left; font-size: 11px; letter-spacing: .045em; text-transform: uppercase; white-space: nowrap; cursor: pointer; }
    th:hover { color: var(--green); }
    td { padding: 11px 12px; border-bottom: 1px solid #edf1ee; vertical-align: top; }
    tbody tr:hover { background: #f8faf8; }
    .name { font-weight: 750; }
    .email, .muted { color: var(--muted); }
    .email { margin-top: 3px; font-size: 12px; }
    .mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; }
    .pill { display: inline-flex; align-items: center; min-height: 24px; padding: 3px 8px; border-radius: 999px; font-size: 11px; font-weight: 750; white-space: nowrap; }
    .pill.ios { background: var(--blue-soft); color: var(--blue); }
    .pill.android { background: var(--green-soft); color: var(--green); }
    .pill.unknown, .pill.missing { background: var(--amber-soft); color: var(--amber); }
    .pill.good { background: var(--green-soft); color: var(--green); }
    .pill.bad { background: var(--red-soft); color: var(--red); }
    .missing-list { display: flex; flex-wrap: wrap; gap: 4px; max-width: 280px; }
    .pagination { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 14px 16px; background: #fbfcfb; }
    .page-controls { display: flex; align-items: center; gap: 8px; }
    .page-controls button:disabled { cursor: not-allowed; opacity: .45; }
    #page-label { min-width: 110px; color: var(--muted); text-align: center; font-size: 13px; }
    .empty { padding: 52px 20px; color: var(--muted); text-align: center; }
    @media (max-width: 1100px) {
      .cards { grid-template-columns: repeat(3, 1fr); }
      .filters { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .filters .control:first-child { grid-column: 1 / -1; }
      .button-stack { align-self: auto; }
    }
    @media (max-width: 650px) {
      .shell { width: min(100% - 18px, 1500px); padding-top: 24px; }
      header { align-items: start; flex-direction: column; }
      .generated { white-space: normal; }
      .cards { grid-template-columns: repeat(2, 1fr); }
      .filters { grid-template-columns: 1fr; }
      .filters .control:first-child { grid-column: auto; }
      .button-stack { flex-wrap: wrap; }
      .pagination { align-items: start; flex-direction: column; }
    }
  </style>
</head>
<body>
  <main class="shell">
    <header>
      <div>
        <p class="eyebrow">Penguin Couple · Operations</p>
        <h1>User platform & version report</h1>
      </div>
      <div class="generated" id="generated-at"></div>
    </header>

    <section class="cards" id="summary-cards" aria-label="Report summary"></section>

    <section class="panel">
      <div class="filters">
        <div class="control">
          <label for="search">Search users</label>
          <input id="search" type="search" placeholder="Name, email, user ID, version…">
        </div>
        <div class="control">
          <label for="platform">Platform</label>
          <select id="platform"><option value="">All platforms</option></select>
        </div>
        <div class="control">
          <label for="version">Version</label>
          <select id="version"><option value="">All versions</option></select>
        </div>
        <div class="control">
          <label for="metadata">Metadata</label>
          <select id="metadata">
            <option value="">Complete or missing</option>
            <option value="complete">Complete only</option>
            <option value="missing">Missing only</option>
          </select>
        </div>
        <div class="control">
          <label for="missing-field">Missing field</label>
          <select id="missing-field">
            <option value="">Any field</option>
            <option value="platform">Platform</option>
            <option value="appVersion">App version</option>
            <option value="appBuildNumber">Build number</option>
            <option value="deviceInfoUpdatedAt">Device update date</option>
            <option value="fcmToken">FCM token</option>
          </select>
        </div>
        <div class="button-stack">
          <button id="reset" type="button">Reset</button>
          <button id="export" class="primary" type="button">Export filtered</button>
        </div>
      </div>

      <div class="table-meta">
        <div id="result-count"></div>
        <div class="control" style="display:flex;align-items:center;gap:8px">
          <label for="page-size" style="white-space:nowrap">Rows</label>
          <select id="page-size" style="width:auto;min-height:34px">
            <option>25</option><option selected>50</option><option>100</option><option>250</option>
          </select>
        </div>
      </div>

      <div class="table-wrap">
        <table>
          <thead><tr>
            <th data-sort="name">User</th>
            <th data-sort="platform">Platform</th>
            <th data-sort="appVersion">Version</th>
            <th data-sort="appBuildNumber">Build</th>
            <th data-sort="metadataComplete">Metadata</th>
            <th data-sort="missingFields">Missing fields</th>
            <th data-sort="hasFcmToken">FCM</th>
            <th data-sort="isPaired">Paired</th>
            <th data-sort="deviceInfoUpdatedAt">Device info updated</th>
            <th data-sort="lastSeen">Last seen</th>
            <th data-sort="createdAt">Created</th>
          </tr></thead>
          <tbody id="rows"></tbody>
        </table>
        <div class="empty" id="empty" hidden>No users match these filters.</div>
      </div>

      <div class="pagination">
        <div class="muted" id="range-label"></div>
        <div class="page-controls">
          <button id="previous" type="button">Previous</button>
          <span id="page-label"></span>
          <button id="next" type="button">Next</button>
        </div>
      </div>
    </section>
  </main>

  <script id="report-data" type="application/json">${reportJson}</script>
  <script>
    (function () {
      'use strict';
      const report = JSON.parse(document.getElementById('report-data').textContent);
      const users = report.users || [];
      const summary = report.summary || {};
      const state = { page: 1, pageSize: 50, sortKey: 'createdAt', sortDirection: -1 };
      const elements = Object.fromEntries([
        'search', 'platform', 'version', 'metadata', 'missing-field', 'page-size',
        'rows', 'empty', 'result-count', 'range-label', 'page-label', 'previous', 'next'
      ].map(function (id) { return [id, document.getElementById(id)]; }));

      const numberFormat = new Intl.NumberFormat();
      const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });
      const text = function (value) { return value === null || value === undefined || value === '' ? '—' : String(value); };
      const formatDate = function (value) {
        if (!value) return '—';
        const date = new Date(value);
        return Number.isNaN(date.getTime()) ? '—' : dateFormat.format(date);
      };
      const create = function (tag, className, content) {
        const node = document.createElement(tag);
        if (className) node.className = className;
        if (content !== undefined) node.textContent = content;
        return node;
      };
      const addCell = function (row, content, className) {
        const cell = create('td', className || '');
        if (content instanceof Node) cell.appendChild(content); else cell.textContent = content;
        row.appendChild(cell);
      };
      const versionKey = function (user) {
        return [user.platform, user.appVersion || 'missing', user.appBuildNumber || 'missing'].join('|');
      };

      document.getElementById('generated-at').textContent = 'Generated ' + formatDate(summary.generatedAt);
      const cards = [
        ['Total users', summary.totalUsers || 0, 'All user records'],
        ['Complete metadata', summary.metadataComplete || 0, 'Platform, version and build available'],
        ['Missing metadata', (summary.missing && summary.missing.anyVersionMetadata) || 0, 'Needs device/version refresh'],
        ['With FCM token', summary.withFcmToken || 0, 'Push-capable user records'],
        ['Paired users', summary.pairedUsers || 0, 'Currently linked accounts']
      ];
      const cardRoot = document.getElementById('summary-cards');
      cards.forEach(function (item) {
        const card = create('article', 'card');
        card.append(create('div', 'card-label', item[0]), create('div', 'card-value', numberFormat.format(item[1])), create('div', 'card-note', item[2]));
        cardRoot.appendChild(card);
      });

      Object.keys(summary.byPlatform || {}).sort().forEach(function (platform) {
        const option = create('option', '', platform + ' (' + summary.byPlatform[platform].total + ')');
        option.value = platform;
        elements.platform.appendChild(option);
      });
      (summary.versions || []).forEach(function (version) {
        const option = create('option', '', version.platform + ' · v' + version.appVersion + ' · build ' + version.appBuildNumber + ' (' + version.count + ')');
        option.value = [version.platform, version.appVersion, version.appBuildNumber].join('|');
        elements.version.appendChild(option);
      });

      function filteredUsers() {
        const query = elements.search.value.trim().toLowerCase();
        const platform = elements.platform.value;
        const version = elements.version.value;
        const metadata = elements.metadata.value;
        const missingField = elements['missing-field'].value;
        return users.filter(function (user) {
          if (platform && user.platform !== platform) return false;
          if (version && versionKey(user) !== version) return false;
          if (metadata === 'complete' && !user.metadataComplete) return false;
          if (metadata === 'missing' && user.metadataComplete) return false;
          if (missingField === 'fcmToken' && user.hasFcmToken) return false;
          if (missingField && missingField !== 'fcmToken' && !(user.missingFields || []).includes(missingField)) return false;
          if (query) {
            const haystack = [user.name, user.email, user.userId, user.platform, user.appVersion, user.appBuildNumber, (user.missingFields || []).join(' ')].join(' ').toLowerCase();
            if (!haystack.includes(query)) return false;
          }
          return true;
        });
      }

      function sortedUsers(filtered) {
        const key = state.sortKey;
        const direction = state.sortDirection;
        return filtered.slice().sort(function (a, b) {
          let left = key === 'missingFields' ? (a.missingFields || []).join(',') : a[key];
          let right = key === 'missingFields' ? (b.missingFields || []).join(',') : b[key];
          if (typeof left === 'boolean') { left = left ? 1 : 0; right = right ? 1 : 0; }
          if (typeof left === 'number' && typeof right === 'number') return (left - right) * direction;
          return String(left || '').localeCompare(String(right || ''), undefined, { numeric: true, sensitivity: 'base' }) * direction;
        });
      }

      function renderRow(user) {
        const row = document.createElement('tr');
        const identity = create('div');
        identity.append(create('div', 'name', text(user.name)), create('div', 'email', text(user.email)), create('div', 'mono muted', user.userId));
        addCell(row, identity);
        addCell(row, create('span', 'pill ' + user.platform, user.platform));
        addCell(row, text(user.appVersion), 'mono');
        addCell(row, text(user.appBuildNumber), 'mono');
        addCell(row, create('span', 'pill ' + (user.metadataComplete ? 'good' : 'bad'), user.metadataComplete ? 'Complete' : 'Missing'));
        const missing = create('div', 'missing-list');
        if ((user.missingFields || []).length === 0) missing.appendChild(create('span', 'muted', 'None'));
        (user.missingFields || []).forEach(function (field) { missing.appendChild(create('span', 'pill missing', field)); });
        addCell(row, missing);
        addCell(row, create('span', 'pill ' + (user.hasFcmToken ? 'good' : 'bad'), user.hasFcmToken ? 'Available' : 'Missing'));
        addCell(row, user.isPaired ? 'Yes' : 'No');
        addCell(row, formatDate(user.deviceInfoUpdatedAt));
        addCell(row, formatDate(user.lastSeen));
        addCell(row, formatDate(user.createdAt));
        return row;
      }

      function render() {
        const filtered = sortedUsers(filteredUsers());
        const pageCount = Math.max(1, Math.ceil(filtered.length / state.pageSize));
        state.page = Math.min(state.page, pageCount);
        const start = (state.page - 1) * state.pageSize;
        const pageRows = filtered.slice(start, start + state.pageSize);
        elements.rows.replaceChildren.apply(elements.rows, pageRows.map(renderRow));
        elements.empty.hidden = filtered.length !== 0;
        elements['result-count'].textContent = numberFormat.format(filtered.length) + ' of ' + numberFormat.format(users.length) + ' users';
        elements['range-label'].textContent = filtered.length ? 'Showing ' + (start + 1) + '–' + Math.min(start + state.pageSize, filtered.length) : 'No rows';
        elements['page-label'].textContent = 'Page ' + state.page + ' of ' + pageCount;
        elements.previous.disabled = state.page <= 1;
        elements.next.disabled = state.page >= pageCount;
      }

      function reset() {
        ['search', 'platform', 'version', 'metadata', 'missing-field'].forEach(function (id) { elements[id].value = ''; });
        state.page = 1;
        render();
      }

      function csvEscape(value) {
        const string = value === null || value === undefined ? '' : String(value);
        return /[",\\n\\r]/.test(string) ? '"' + string.replaceAll('"', '""') + '"' : string;
      }
      function exportFiltered() {
        const filtered = sortedUsers(filteredUsers());
        const columns = ['userId','name','email','platform','appVersion','appBuildNumber','metadataComplete','missingFields','hasFcmToken','isPaired','deviceInfoUpdatedAt','lastSeen','createdAt'];
        const lines = [columns.join(',')].concat(filtered.map(function (user) {
          return columns.map(function (column) {
            const value = column === 'missingFields' ? (user.missingFields || []).join('|') : user[column];
            return csvEscape(value);
          }).join(',');
        }));
        const url = URL.createObjectURL(new Blob([lines.join('\\n') + '\\n'], { type: 'text/csv;charset=utf-8' }));
        const link = document.createElement('a');
        link.href = url;
        link.download = 'filtered-user-version-report.csv';
        link.click();
        URL.revokeObjectURL(url);
      }

      ['search', 'platform', 'version', 'metadata', 'missing-field'].forEach(function (id) {
        elements[id].addEventListener(id === 'search' ? 'input' : 'change', function () { state.page = 1; render(); });
      });
      elements['page-size'].addEventListener('change', function () { state.pageSize = Number(elements['page-size'].value); state.page = 1; render(); });
      elements.previous.addEventListener('click', function () { state.page -= 1; render(); });
      elements.next.addEventListener('click', function () { state.page += 1; render(); });
      document.getElementById('reset').addEventListener('click', reset);
      document.getElementById('export').addEventListener('click', exportFiltered);
      document.querySelectorAll('th[data-sort]').forEach(function (header) {
        header.addEventListener('click', function () {
          const key = header.dataset.sort;
          state.sortDirection = state.sortKey === key ? state.sortDirection * -1 : 1;
          state.sortKey = key;
          state.page = 1;
          render();
        });
      });
      render();
    }());
  </script>
</body>
</html>`;
};
