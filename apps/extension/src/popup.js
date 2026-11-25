const $ = (id) => document.getElementById(id);

let currentJob = null;

async function getConfig() {
  return await chrome.storage.local.get([
    'webAppUrl',
    'supabaseUrl',
    'supabaseAnonKey',
    'accessToken',
    'refreshToken',
  ]);
}

async function apiFetch(path, body) {
  const cfg = await getConfig();
  if (!cfg.webAppUrl || !cfg.accessToken) {
    throw new Error('Sign in via Settings first.');
  }
  const res = await fetch(`${cfg.webAppUrl.replace(/\/$/, '')}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${cfg.accessToken}`,
    },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

function setBanner(type, text) {
  const el = $('statusBanner');
  el.className = `banner ${type}`;
  el.textContent = text;
}

async function inspectActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) {
    setBanner('warn', 'No active tab found.');
    return;
  }

  try {
    currentJob = await chrome.tabs.sendMessage(tab.id, { type: 'EXTRACT_JOB_INFO' });
  } catch {
    currentJob = {
      url: tab.url || '',
      title: tab.title || 'Job Page',
      company: '',
      description: '',
    };
  }

  $('jobTitle').textContent = currentJob.title || 'Unknown Role';
  $('jobCompany').textContent = currentJob.company || currentJob.url;

  const cfg = await getConfig();
  if (!cfg.accessToken) {
    setBanner('warn', 'Open Settings to connect your JobPilot account.');
    return;
  }

  try {
    const res = await apiFetch('/api/jobs/search', {
      url: currentJob.url,
      company: currentJob.company,
      title: currentJob.title,
      snippet: currentJob.description?.slice(0, 600),
      limit: 5,
    });

    if (res.alreadyApplied && res.topMatch) {
      setBanner(
        'warn',
        `Already Applied (${res.topMatch.applicationStatus}) — ${Math.round(
          res.topMatch.combinedSimilarity * 100,
        )}% match: ${res.topMatch.title} @ ${res.topMatch.company}`,
      );
    } else if (res.matches?.length > 0) {
      setBanner(
        'info',
        `Found ${res.matches.length} similar tracked post(s) — status: ${res.matches[0].applicationStatus}`,
      );
    } else {
      setBanner('ok', 'New job — not in your applied list yet.');
    }
  } catch (err) {
    setBanner('warn', err.message);
  }
}

$('toggleAuthBtn').addEventListener('click', () => {
  $('authSection').classList.toggle('hidden');
});

$('signInBtn').addEventListener('click', async () => {
  const webAppUrl = $('webAppUrl').value.trim();
  const supabaseUrl = $('supabaseUrl').value.trim().replace(/\/$/, '');
  const supabaseAnonKey = $('supabaseAnonKey').value.trim();
  const email = $('loginEmail').value.trim();
  const password = $('loginPassword').value;

  $('authMsg').textContent = 'Signing in...';
  try {
    const res = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: {
        apikey: supabaseAnonKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error_description || data.msg || 'Login failed');

    await chrome.storage.local.set({
      webAppUrl,
      supabaseUrl,
      supabaseAnonKey,
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
    });
    $('authMsg').textContent = 'Signed in!';
    $('authSection').classList.add('hidden');
    await inspectActiveTab();
  } catch (err) {
    $('authMsg').textContent = err.message;
  }
});

$('signOutBtn').addEventListener('click', async () => {
  await chrome.storage.local.remove(['accessToken', 'refreshToken']);
  $('authMsg').textContent = 'Signed out.';
  setBanner('warn', 'Signed out.');
});

$('saveBtn').addEventListener('click', async () => {
  if (!currentJob) return;
  setBanner('info', 'Saving job...');
  try {
    await apiFetch('/api/jobs/save', { ...currentJob, status: 'matched', channel: 'extension' });
    setBanner('ok', 'Saved to your job tracker!');
  } catch (err) {
    setBanner('warn', err.message);
  }
});

$('appliedBtn').addEventListener('click', async () => {
  if (!currentJob) return;
  setBanner('info', 'Marking as applied...');
  try {
    await apiFetch('/api/jobs/save', { ...currentJob, status: 'applied', channel: 'extension' });
    setBanner('ok', 'Marked as Applied in your tracker!');
  } catch (err) {
    setBanner('warn', err.message);
  }
});

$('draftBtn').addEventListener('click', async () => {
  if (!currentJob) return;
  setBanner('info', 'Generating human-like apply email...');
  try {
    const res = await apiFetch('/api/jobs/save', {
      ...currentJob,
      status: 'matched',
      channel: 'extension',
      generateDraft: true,
    });
    if (res.draft) {
      $('draftSubject').value = res.draft.subject;
      $('draftBody').value = res.draft.body;
      $('draftBox').classList.remove('hidden');
      setBanner('ok', 'Human-like apply email drafted!');
    }
  } catch (err) {
    setBanner('warn', err.message);
  }
});

$('copyDraftBtn').addEventListener('click', async () => {
  const fullText = `Subject: ${$('draftSubject').value}\n\n${$('draftBody').value}`;
  await navigator.clipboard.writeText(fullText);
  $('copyDraftBtn').textContent = 'Copied!';
  setTimeout(() => {
    $('copyDraftBtn').textContent = 'Copy Email';
  }, 1500);
});

$('searchBtn').addEventListener('click', async () => {
  const query = $('searchQuery').value.trim();
  if (!query) return;
  const container = $('searchResults');
  container.innerHTML = 'Searching...';
  try {
    const res = await apiFetch('/api/jobs/search', { query, limit: 6 });
    if (!res.matches?.length) {
      container.innerHTML = '<div class="result-item">No matches found.</div>';
      return;
    }
    container.innerHTML = res.matches
      .map(
        (m) =>
          `<div class="result-item"><strong>${m.title}</strong> @ ${m.company}<br/>Status: ${m.applicationStatus} (${Math.round(
            m.combinedSimilarity * 100,
          )}%)</div>`,
      )
      .join('');
  } catch (err) {
    container.innerHTML = `<div class="result-item">${err.message}</div>`;
  }
});

(async function init() {
  const cfg = await getConfig();
  if (cfg.webAppUrl) $('webAppUrl').value = cfg.webAppUrl;
  if (cfg.supabaseUrl) $('supabaseUrl').value = cfg.supabaseUrl;
  if (cfg.supabaseAnonKey) $('supabaseAnonKey').value = cfg.supabaseAnonKey;
  await inspectActiveTab();
})();
