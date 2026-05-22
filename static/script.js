const messagesEl     = document.getElementById('messages');
const chatArea       = document.getElementById('chatArea');
const userInput      = document.getElementById('userInput');
const sendBtn        = document.getElementById('sendBtn');
const attachBtn      = document.getElementById('attachBtn');
const sidebarEl      = document.getElementById('sidebar');
const sidebarToggle  = document.getElementById('sidebarToggle');
const sidebarListEl  = document.getElementById('sidebarList');
const sidebarEmptyEl = document.getElementById('sidebarEmpty');
const saveStatusEl   = document.getElementById('saveStatus');
const adminBtn       = document.getElementById('adminBtn');

let history       = [];
let loading       = false;
let selectedFiles = [];
let currentConvId = null;
let sidebarOpen   = false;
let currentCode   = null;   // active guest invite code
let ownerToken    = null;   // active owner session token
let isOwner       = false;
let sessionDone   = false;  // true after guest code is consumed

// ─── Init ──────────────────────────────────────────────────────────

window.addEventListener('DOMContentLoaded', async () => {
  await checkAuth();
  showWelcome();
  loadConversationList();

  userInput.addEventListener('input', () => {
    userInput.style.height = 'auto';
    userInput.style.height = Math.min(userInput.scrollHeight, 160) + 'px';
  });

  userInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  // Code input: auto-format as XXXX-XXXX
  const codeInputEl = document.getElementById('codeInput');
  codeInputEl.addEventListener('input', () => {
    let v = codeInputEl.value.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 8);
    if (v.length > 4) v = v.slice(0, 4) + '-' + v.slice(4);
    codeInputEl.value = v;
  });
  codeInputEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') submitCode();
  });

  // Owner form: Enter key submits
  document.getElementById('ownerPassword').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') submitOwnerLogin();
  });
  document.getElementById('ownerUsername').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') submitOwnerLogin();
  });

  userInput.focus();
});

function showWelcome() {
  addBotMessage(
    'こんにちは！**PromptoAI** へようこそ。\n\n' +
    'Claude Code で使える高精度なプロンプトを一緒に作り上げます。\n' +
    '画像・PDF・Excel ファイルを添付して参考資料を共有することもできます。\n\n' +
    'まず教えてください — **どんなツールを作りたいですか？**'
  );
}

// ─── Auth ──────────────────────────────────────────────────────────

async function checkAuth() {
  // 1. Try owner session first
  const storedToken = localStorage.getItem('promptai_owner_token');
  if (storedToken) {
    const res  = await safeFetch('/auth/verify', { method: 'POST', json: { token: storedToken } });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.owner_mode) {
      ownerToken = storedToken;
      isOwner    = true;
      adminBtn.classList.remove('hidden');
      return;
    }
    localStorage.removeItem('promptai_owner_token');
  }

  // 2. Try guest code
  const storedCode = localStorage.getItem('promptai_code');
  if (storedCode) {
    const res  = await safeFetch('/auth/verify', { method: 'POST', json: { code: storedCode } });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      currentCode = storedCode;
      if (data.owner_mode) {
        // No auth configured (local dev) — treat as owner
        isOwner = true;
        adminBtn.classList.remove('hidden');
      }
      return;
    }
    localStorage.removeItem('promptai_code');
  }

  // 3. Try no-auth (local dev mode)
  const res  = await safeFetch('/auth/verify', { method: 'POST', json: {} });
  const data = await res.json().catch(() => ({}));
  if (res.ok && data.owner_mode) {
    isOwner = true;
    adminBtn.classList.remove('hidden');
    return;
  }

  // 4. Show login modal
  showLoginModal();
}

async function safeFetch(url, { method = 'GET', json } = {}) {
  try {
    const opts = { method, headers: {} };
    if (json !== undefined) {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(json);
    }
    return await fetch(url, opts);
  } catch {
    return new Response('{}', { status: 0 });
  }
}

// ─── Login modal ───────────────────────────────────────────────────

function showLoginModal() {
  const overlay = document.getElementById('loginModalOverlay');
  overlay.classList.remove('hidden');
  switchLoginTab('guest');
  setTimeout(() => document.getElementById('codeInput').focus(), 60);
}

function hideLoginModal() {
  document.getElementById('loginModalOverlay').classList.add('hidden');
}

function switchLoginTab(tab) {
  const tabGuest  = document.getElementById('tabGuest');
  const tabOwner  = document.getElementById('tabOwner');
  const paneGuest = document.getElementById('paneGuest');
  const paneOwner = document.getElementById('paneOwner');

  if (tab === 'guest') {
    tabGuest.classList.add('active');
    tabOwner.classList.remove('active');
    paneGuest.classList.remove('hidden');
    paneOwner.classList.add('hidden');
    clearLoginError('code');
    setTimeout(() => document.getElementById('codeInput').focus(), 40);
  } else {
    tabOwner.classList.add('active');
    tabGuest.classList.remove('active');
    paneOwner.classList.remove('hidden');
    paneGuest.classList.add('hidden');
    clearLoginError('owner');
    setTimeout(() => document.getElementById('ownerUsername').focus(), 40);
  }
}

// Guest submit
async function submitCode() {
  const codeInputEl  = document.getElementById('codeInput');
  const submitBtn    = document.getElementById('codeSubmitBtn');
  const raw = codeInputEl.value.replace(/-/g, '').trim().toUpperCase();

  if (raw.length < 8) {
    setLoginError('code', '8文字のコードを入力してください');
    codeInputEl.classList.add('error');
    return;
  }

  submitBtn.disabled = true;
  submitBtn.textContent = '確認中...';
  codeInputEl.classList.remove('error');
  clearLoginError('code');

  try {
    const res  = await fetch('/auth/verify', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ code: raw }),
    });
    const data = await res.json();

    if (res.ok) {
      currentCode = raw;
      if (data.owner_mode) {
        isOwner = true;
        adminBtn.classList.remove('hidden');
      } else {
        localStorage.setItem('promptai_code', currentCode);
      }
      hideLoginModal();
    } else if (res.status === 403) {
      setLoginError('code', 'このコードはすでに使用済みです');
      codeInputEl.classList.add('error');
    } else {
      setLoginError('code', '無効なコードです。ご確認ください');
      codeInputEl.classList.add('error');
    }
  } catch {
    setLoginError('code', '接続エラーが発生しました');
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = '開始する';
  }
}

// Owner submit
async function submitOwnerLogin() {
  const usernameEl = document.getElementById('ownerUsername');
  const passwordEl = document.getElementById('ownerPassword');
  const submitBtn  = document.getElementById('ownerLoginBtn');
  const username   = usernameEl.value.trim();
  const password   = passwordEl.value;

  if (!username || !password) {
    setLoginError('owner', 'ユーザー名とパスワードを入力してください');
    return;
  }

  submitBtn.disabled = true;
  submitBtn.textContent = 'ログイン中...';
  usernameEl.classList.remove('error');
  passwordEl.classList.remove('error');
  clearLoginError('owner');

  try {
    const res  = await fetch('/auth/login', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ username, password }),
    });
    const data = await res.json();

    if (res.ok && data.token) {
      ownerToken = data.token;
      isOwner    = true;
      localStorage.setItem('promptai_owner_token', ownerToken);
      adminBtn.classList.remove('hidden');
      hideLoginModal();
      passwordEl.value = '';
    } else if (res.status === 503) {
      setLoginError('owner', 'オーナーパスワードが設定されていません (.env を確認してください)');
    } else {
      setLoginError('owner', 'ユーザー名またはパスワードが正しくありません');
      usernameEl.classList.add('error');
      passwordEl.classList.add('error');
    }
  } catch {
    setLoginError('owner', '接続エラーが発生しました');
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'ログイン';
  }
}

async function ownerLogout() {
  if (ownerToken) {
    await fetch('/auth/logout', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ token: ownerToken }),
    }).catch(() => {});
  }
  ownerToken = null;
  isOwner    = false;
  localStorage.removeItem('promptai_owner_token');
  adminBtn.classList.add('hidden');
  closeAdminPanel();
  showLoginModal();
}

function setLoginError(type, msg) {
  document.getElementById(type === 'code' ? 'codeError' : 'ownerError').textContent = msg;
}

function clearLoginError(type) {
  document.getElementById(type === 'code' ? 'codeError' : 'ownerError').textContent = '';
}

// ─── Admin panel ───────────────────────────────────────────────────

function openAdminPanel() {
  document.getElementById('adminModalOverlay').classList.remove('hidden');
  loadAdminCodes();
}

function closeAdminPanel(e) {
  if (!e || e.target === document.getElementById('adminModalOverlay')) {
    document.getElementById('adminModalOverlay').classList.add('hidden');
  }
}

async function loadAdminCodes() {
  const listEl = document.getElementById('adminCodesList');
  const labelEl = document.getElementById('adminCodesLabel');
  listEl.innerHTML = '<div class="admin-loading">読み込み中...</div>';

  try {
    const res  = await fetch('/admin/codes', {
      headers: { 'X-Owner-Token': ownerToken || '' }
    });
    const data = await res.json();

    if (!res.ok) {
      listEl.innerHTML = '<div class="admin-loading">読み込みエラー</div>';
      return;
    }

    const entries = Object.entries(data);
    const unused  = entries.filter(([, v]) => !v.used);
    const used    = entries.filter(([, v]) =>  v.used);

    labelEl.textContent = `コード一覧（未使用 ${unused.length} / 使用済 ${used.length}）`;

    if (entries.length === 0) {
      listEl.innerHTML = '<div class="admin-codes-empty">コードがありません。「コードを発行」で作成してください。</div>';
      return;
    }

    // Unused first, then used
    const sorted = [...unused, ...used];
    listEl.innerHTML = '';
    sorted.forEach(([code, info]) => {
      const row = document.createElement('div');
      row.className = 'admin-code-row';

      const fmt = `${code.slice(0,4)}-${code.slice(4)}`;
      const createdAt = info.created_at
        ? new Date(info.created_at).toLocaleDateString('ja-JP')
        : '';

      row.innerHTML = `
        <div class="admin-code-val">${fmt}</div>
        <div class="admin-code-meta">
          <div class="admin-code-date">${createdAt}</div>
          <div class="admin-code-status ${info.used ? 'used' : 'unused'}">
            ${info.used ? '使用済' : '未使用'}
          </div>
        </div>
        <div class="admin-code-actions">
          ${!info.used ? `<button class="copy-btn" onclick="copyAdminCode('${fmt}', this)">コピー</button>` : ''}
          <button class="del-btn" onclick="deleteCode('${code}', this)">削除</button>
        </div>
      `;
      listEl.appendChild(row);
    });
  } catch {
    listEl.innerHTML = '<div class="admin-loading">読み込みエラー</div>';
  }
}

async function generateCodes(n) {
  try {
    const res  = await fetch('/admin/codes/generate', {
      method:  'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Owner-Token': ownerToken || '',
      },
      body: JSON.stringify({ count: n }),
    });
    const data = await res.json();
    if (res.ok && data.codes) {
      loadAdminCodes();
    }
  } catch {
    alert('コード生成に失敗しました');
  }
}

async function deleteCode(code, btn) {
  btn.disabled = true;
  try {
    await fetch(`/admin/codes/${code}`, {
      method:  'DELETE',
      headers: { 'X-Owner-Token': ownerToken || '' },
    });
    const row = btn.closest('.admin-code-row');
    row.style.opacity = '0';
    row.style.transition = 'opacity 0.2s';
    setTimeout(() => loadAdminCodes(), 220);
  } catch {
    btn.disabled = false;
  }
}

async function copyAdminCode(fmt, btn) {
  try {
    await navigator.clipboard.writeText(fmt);
    const orig = btn.textContent;
    btn.textContent = 'コピー済';
    btn.style.color = '#34d399';
    setTimeout(() => {
      btn.textContent = orig;
      btn.style.color = '';
    }, 1800);
  } catch {
    btn.textContent = '失敗';
  }
}

// ─── Session complete (guest) ───────────────────────────────────────

function showSessionComplete() {
  sessionDone = true;
  document.getElementById('inputInner').style.display = 'none';
  document.getElementById('sessionComplete').classList.add('visible');
  document.querySelector('.input-hint').style.display = 'none';
  localStorage.removeItem('promptai_code');
  currentCode = null;
}

// ─── Sidebar ───────────────────────────────────────────────────────

function toggleSidebar() {
  sidebarOpen = !sidebarOpen;
  sidebarEl.classList.toggle('collapsed', !sidebarOpen);
  sidebarToggle.classList.toggle('active', sidebarOpen);
}

// ─── Conversation list ─────────────────────────────────────────────

async function loadConversationList() {
  try {
    const res  = await fetch('/conversations');
    const list = await res.json();
    renderSidebarList(list);
  } catch (e) {
    console.error('会話履歴の読み込みに失敗:', e);
  }
}

function renderSidebarList(list) {
  sidebarListEl.innerHTML = '';

  if (!list || list.length === 0) {
    sidebarListEl.appendChild(sidebarEmptyEl);
    return;
  }

  list.forEach(conv => {
    const item = document.createElement('div');
    item.className = 'conv-item' + (conv.id === currentConvId ? ' active' : '');
    item.dataset.id = conv.id;

    const body = document.createElement('div');
    body.className = 'conv-item-body';
    body.onclick = () => openConversation(conv.id);

    const title = document.createElement('div');
    title.className = 'conv-item-title';
    title.textContent = conv.title;

    const date = document.createElement('div');
    date.className = 'conv-item-date';
    date.textContent = relativeDate(conv.updated_at);

    body.appendChild(title);
    body.appendChild(date);

    const delBtn = document.createElement('button');
    delBtn.className = 'conv-item-del';
    delBtn.title = '削除';
    delBtn.innerHTML = '✕';
    delBtn.onclick = (e) => deleteConversation(e, conv.id);

    item.appendChild(body);
    item.appendChild(delBtn);
    sidebarListEl.appendChild(item);
  });
}

function updateActiveItem() {
  document.querySelectorAll('.conv-item').forEach(el => {
    el.classList.toggle('active', el.dataset.id === currentConvId);
  });
}

// ─── Open a past conversation ──────────────────────────────────────

async function openConversation(id) {
  try {
    const res  = await fetch(`/conversations/${id}`);
    const data = await res.json();
    if (data.error) return;

    history       = data.messages || [];
    currentConvId = data.id;

    messagesEl.innerHTML = '';
    history.forEach(msg => {
      if (msg.role === 'user') {
        const text = typeof msg.content === 'string'
          ? msg.content
          : msg.content.find(b => b.type === 'text')?.text || '';
        addUserMessage(text, []);
      } else {
        addBotMessage(typeof msg.content === 'string' ? msg.content : '');
      }
    });

    updateActiveItem();
    userInput.focus();
  } catch (e) {
    console.error('会話の読み込みに失敗:', e);
  }
}

// ─── Auto-save ─────────────────────────────────────────────────────

async function saveCurrentConversation() {
  if (history.length === 0) return;
  showSaveStatus('saving');
  try {
    const res  = await fetch('/conversations/save', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ id: currentConvId, messages: history }),
    });
    const data = await res.json();
    currentConvId = data.id;
    showSaveStatus('saved');
    updateActiveItem();
    loadConversationList();
  } catch (e) {
    console.error('保存に失敗:', e);
  }
}

let saveStatusTimer = null;
function showSaveStatus(state) {
  clearTimeout(saveStatusTimer);
  saveStatusEl.className = `save-status visible ${state}`;
  saveStatusEl.innerHTML = state === 'saving'
    ? '保存中...'
    : `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg> 保存済み`;
  if (state === 'saved') {
    saveStatusTimer = setTimeout(() => {
      saveStatusEl.classList.remove('visible');
    }, 2500);
  }
}

// ─── Delete conversation ───────────────────────────────────────────

async function deleteConversation(e, id) {
  e.stopPropagation();
  const item = document.querySelector(`.conv-item[data-id="${id}"]`);
  if (item) { item.style.opacity = '0'; item.style.transition = 'opacity 0.2s'; }
  try {
    await fetch(`/conversations/${id}`, { method: 'DELETE' });
    if (id === currentConvId) {
      currentConvId = null;
      history = [];
      messagesEl.innerHTML = '';
      showWelcome();
    }
    setTimeout(() => loadConversationList(), 200);
  } catch (e) {
    console.error('削除に失敗:', e);
    loadConversationList();
  }
}

// ─── New chat ──────────────────────────────────────────────────────

function resetChat() {
  history       = [];
  currentConvId = null;
  selectedFiles = [];
  renderFilePreviews();
  messagesEl.innerHTML = '';
  showWelcome();
  updateActiveItem();
  userInput.focus();
}

// ─── File handling ─────────────────────────────────────────────────

function openFilePicker() {
  document.getElementById('fileInput').click();
}

function handleFileSelect(e) {
  selectedFiles.push(...Array.from(e.target.files));
  e.target.value = '';
  renderFilePreviews();
}

function removeFile(index) {
  selectedFiles.splice(index, 1);
  renderFilePreviews();
}

function renderFilePreviews() {
  const container = document.getElementById('filePreviews');
  container.innerHTML = '';

  if (selectedFiles.length === 0) {
    container.style.display = 'none';
    attachBtn.classList.remove('has-files');
    return;
  }

  container.style.display = 'flex';
  attachBtn.classList.add('has-files');

  selectedFiles.forEach((file, index) => {
    const chip = document.createElement('div');
    chip.className = 'file-chip';

    if (file.type.startsWith('image/')) {
      const img = document.createElement('img');
      img.src = URL.createObjectURL(file);
      img.className = 'file-chip-thumb';
      chip.appendChild(img);
    } else {
      const icon = document.createElement('span');
      icon.className = 'file-chip-icon';
      icon.textContent = file.name.toLowerCase().endsWith('.pdf') ? '📄' : '📊';
      chip.appendChild(icon);
    }

    const name = document.createElement('span');
    name.className = 'file-chip-name';
    name.textContent = file.name;
    chip.appendChild(name);

    const rm = document.createElement('button');
    rm.className = 'file-chip-remove';
    rm.textContent = '✕';
    rm.onclick = () => removeFile(index);
    chip.appendChild(rm);

    container.appendChild(chip);
  });
}

// ─── Send message ──────────────────────────────────────────────────

async function sendMessage() {
  const text  = userInput.value.trim();
  const files = [...selectedFiles];
  if ((!text && files.length === 0) || loading || sessionDone) return;

  addUserMessage(text, files);

  const historyText = text
    ? (files.length ? `${text}\n[添付: ${files.map(f => f.name).join(', ')}]` : text)
    : `[添付: ${files.map(f => f.name).join(', ')}]`;
  history.push({ role: 'user', content: historyText });

  userInput.value = '';
  userInput.style.height = 'auto';
  selectedFiles = [];
  renderFilePreviews();

  loading = true;
  sendBtn.disabled = true;
  const typingEl = showTyping();

  try {
    const formData = new FormData();
    formData.append('messages', JSON.stringify(history));
    files.forEach(f => formData.append('files', f));
    formData.append('code',          currentCode   || '');
    formData.append('session_token', ownerToken    || '');

    const res  = await fetch('/chat', { method: 'POST', body: formData });
    const data = await res.json();

    if (!res.ok) {
      typingEl.remove();
      history.pop();

      if (res.status === 401 || res.status === 403) {
        localStorage.removeItem('promptai_code');
        localStorage.removeItem('promptai_owner_token');
        currentCode = null;
        ownerToken  = null;
        isOwner     = false;
        adminBtn.classList.add('hidden');

        const msg = res.status === 403
          ? 'このコードはすでに使用済みです。別のコードを入力してください。'
          : '認証が必要です。ログインしてください。';
        addBotMessage(msg);
        showLoginModal();
      } else {
        addBotMessage('エラーが発生しました。もう一度お試しください。');
      }
      return;
    }

    const reply = data.content;
    history.push({ role: 'assistant', content: reply });
    typingEl.remove();
    addBotMessage(reply);

    // Guest code consumed → show session complete
    if (data.code_consumed) {
      showSessionComplete();
    }

    saveCurrentConversation();

  } catch (err) {
    typingEl.remove();
    addBotMessage('エラーが発生しました。もう一度お試しください。');
    console.error(err);
  } finally {
    loading = false;
    if (!sessionDone) sendBtn.disabled = false;
    userInput.focus();
  }
}

// ─── Message rendering ─────────────────────────────────────────────

function addUserMessage(text, files = []) {
  const wrap = document.createElement('div');
  wrap.className = 'message user';

  const avatar = document.createElement('div');
  avatar.className = 'message-avatar user-avatar';
  avatar.textContent = 'U';

  const content = document.createElement('div');
  content.className = 'message-content';

  const bubble = document.createElement('div');
  bubble.className = 'message-bubble';

  if (text) {
    const textEl = document.createElement('div');
    textEl.innerHTML = formatText(text);
    bubble.appendChild(textEl);
  }

  if (files.length > 0) {
    const attachments = document.createElement('div');
    attachments.className = 'msg-attachments';
    files.forEach(file => {
      const badge = document.createElement('div');
      badge.className = 'msg-attachment';
      if (file.type.startsWith('image/')) {
        const img = document.createElement('img');
        img.src = URL.createObjectURL(file);
        img.className = 'msg-attachment-thumb';
        badge.appendChild(img);
      } else {
        const icon = document.createElement('span');
        icon.textContent = file.name.toLowerCase().endsWith('.pdf') ? '📄' : '📊';
        badge.appendChild(icon);
      }
      const name = document.createElement('span');
      name.textContent = file.name;
      badge.appendChild(name);
      attachments.appendChild(badge);
    });
    bubble.appendChild(attachments);
  }

  content.appendChild(bubble);
  wrap.appendChild(avatar);
  wrap.appendChild(content);
  messagesEl.appendChild(wrap);
  scrollToBottom();
}

function addBotMessage(rawText) {
  const wrap = document.createElement('div');
  wrap.className = 'message bot';

  const avatar = document.createElement('div');
  avatar.className = 'message-avatar bot-avatar';
  avatar.textContent = 'P';

  const content = document.createElement('div');
  content.className = 'message-content';

  const bubble = document.createElement('div');
  bubble.className = 'message-bubble';

  const promptRe = /<prompt>([\s\S]*?)<\/prompt>/;
  const match    = rawText.match(promptRe);

  if (match) {
    const promptText = match[1].trim();
    const parts      = rawText.split(promptRe);
    const before     = (parts[0] || '').trim();
    const after      = (parts[2] || '').trim();

    if (before) {
      const p = document.createElement('div');
      p.innerHTML = formatText(before);
      bubble.appendChild(p);
    }
    bubble.appendChild(buildPromptCard(promptText));
    if (after) {
      const p = document.createElement('div');
      p.style.marginTop = '12px';
      p.innerHTML = formatText(after);
      bubble.appendChild(p);
    }
  } else {
    bubble.innerHTML = formatText(rawText);
  }

  content.appendChild(bubble);
  wrap.appendChild(avatar);
  wrap.appendChild(content);
  messagesEl.appendChild(wrap);
  scrollToBottom();
}

// ─── Prompt card ───────────────────────────────────────────────────

function buildPromptCard(promptText) {
  const card = document.createElement('div');
  card.className = 'prompt-card';

  const header = document.createElement('div');
  header.className = 'prompt-card-header';

  const label = document.createElement('div');
  label.className = 'prompt-card-label';
  label.innerHTML = `
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
      <polyline points="16 18 22 12 16 6"/>
      <polyline points="8 6 2 12 8 18"/>
    </svg>
    Claude Code プロンプト
  `;

  const copyBtn = document.createElement('button');
  copyBtn.className = 'prompt-card-copy';
  copyBtn.innerHTML = `
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
    </svg>
    コピー
  `;
  copyBtn.addEventListener('click', () => copyToClipboard(copyBtn, promptText));

  header.appendChild(label);
  header.appendChild(copyBtn);

  const body = document.createElement('div');
  body.className = 'prompt-card-body';
  body.textContent = promptText;

  card.appendChild(header);
  card.appendChild(body);
  return card;
}

// ─── Typing indicator ──────────────────────────────────────────────

function showTyping() {
  const wrap = document.createElement('div');
  wrap.className = 'message bot';
  wrap.innerHTML = `
    <div class="message-avatar bot-avatar">P</div>
    <div class="message-content">
      <div class="typing-indicator">
        <div class="typing-dot"></div>
        <div class="typing-dot"></div>
        <div class="typing-dot"></div>
      </div>
    </div>
  `;
  messagesEl.appendChild(wrap);
  scrollToBottom();
  return wrap;
}

// ─── Helpers ───────────────────────────────────────────────────────

function formatText(text) {
  let html = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  return html
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g,     '<em>$1</em>')
    .replace(/`(.+?)`/g,       '<code>$1</code>')
    .replace(/\n/g,            '<br>');
}

async function copyToClipboard(btn, text) {
  try {
    await navigator.clipboard.writeText(text);
    btn.classList.add('copied');
    btn.innerHTML = `
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
        <polyline points="20 6 9 17 4 12"/>
      </svg>
      コピー済み
    `;
    setTimeout(() => {
      btn.classList.remove('copied');
      btn.innerHTML = `
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
        </svg>
        コピー
      `;
    }, 2200);
  } catch {
    btn.textContent = 'コピー失敗';
  }
}

function relativeDate(isoString) {
  const date    = new Date(isoString);
  const now     = new Date();
  const diffMs  = now - date;
  const diffMin = Math.floor(diffMs / 60000);
  const diffDay = Math.floor(diffMs / 86400000);

  if (diffMin < 1)   return 'たった今';
  if (diffMin < 60)  return `${diffMin}分前`;
  if (diffDay === 0) return '今日';
  if (diffDay === 1) return '昨日';
  if (diffDay < 7)   return `${diffDay}日前`;
  if (diffDay < 30)  return `${Math.floor(diffDay / 7)}週間前`;
  return `${Math.floor(diffDay / 30)}ヶ月前`;
}

function scrollToBottom() {
  chatArea.scrollTop = chatArea.scrollHeight;
}
