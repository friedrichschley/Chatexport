'use strict';

const state = {
  chats: [],
  selectedProject: null,
  activeChat: null,
  favorites: new Set(JSON.parse(localStorage.getItem('chatvault-favorites') || '[]')),
  theme: localStorage.getItem('chatvault-theme') || 'light'
};

const $ = (id) => document.getElementById(id);
const els = {
  importButton: $('importButton'),
  emptyImportButton: $('emptyImportButton'),
  fileInput: $('fileInput'),
  clearButton: $('clearButton'),
  themeButton: $('themeButton'),
  emptyState: $('emptyState'),
  appView: $('appView'),
  projectList: $('projectList'),
  allProjectsButton: $('allProjectsButton'),
  searchInput: $('searchInput'),
  sortSelect: $('sortSelect'),
  favoritesOnly: $('favoritesOnly'),
  chatList: $('chatList'),
  viewTitle: $('viewTitle'),
  resultCount: $('resultCount'),
  statProjects: $('statProjects'),
  statChats: $('statChats'),
  statMessages: $('statMessages'),
  statFavorites: $('statFavorites'),
  chatDialog: $('chatDialog'),
  dialogClose: $('dialogClose'),
  dialogProject: $('dialogProject'),
  dialogTitle: $('dialogTitle'),
  dialogMeta: $('dialogMeta'),
  dialogMessages: $('dialogMessages'),
  exportChatButton: $('exportChatButton'),
  toast: $('toast')
};

applyTheme();

els.importButton.addEventListener('click', () => els.fileInput.click());
els.emptyImportButton.addEventListener('click', () => els.fileInput.click());
els.fileInput.addEventListener('change', handleFile);
els.themeButton.addEventListener('click', toggleTheme);
els.clearButton.addEventListener('click', clearArchive);
els.searchInput.addEventListener('input', renderChats);
els.sortSelect.addEventListener('change', renderChats);
els.favoritesOnly.addEventListener('change', renderChats);
els.allProjectsButton.addEventListener('click', () => selectProject(null));
els.dialogClose.addEventListener('click', () => els.chatDialog.close());
els.exportChatButton.addEventListener('click', exportActiveChat);
els.chatDialog.addEventListener('click', (event) => {
  if (event.target === els.chatDialog) els.chatDialog.close();
});

restoreSession();

async function handleFile(event) {
  const file = event.target.files?.[0];
  event.target.value = '';
  if (!file) return;

  try {
    showToast('Datei wird gelesen …');
    let raw;

    if (file.name.toLowerCase().endsWith('.zip')) {
      if (!window.JSZip) throw new Error('ZIP-Unterstützung konnte nicht geladen werden.');
      const zip = await JSZip.loadAsync(file);
      const candidate = Object.values(zip.files).find(entry =>
        !entry.dir && /(^|\/)conversations\.json$/i.test(entry.name)
      );
      if (!candidate) throw new Error('In der ZIP-Datei wurde keine conversations.json gefunden.');
      raw = await candidate.async('string');
    } else {
      raw = await file.text();
    }

    const parsed = JSON.parse(raw);
    const conversations = Array.isArray(parsed) ? parsed : parsed.conversations;
    if (!Array.isArray(conversations)) throw new Error('Das Dateiformat wird nicht erkannt.');

    state.chats = conversations.map(normalizeConversation).filter(chat => chat.messages.length > 0);
    if (!state.chats.length) throw new Error('Es wurden keine lesbaren Unterhaltungen gefunden.');

    state.selectedProject = null;
    persistSession();
    renderAll();
    showToast(`${state.chats.length.toLocaleString('de-DE')} Chats importiert`);
  } catch (error) {
    console.error(error);
    alert(`Import fehlgeschlagen:\n${error.message}`);
  }
}

function normalizeConversation(conv, index) {
  const mapping = conv.mapping || {};
  const nodes = Object.values(mapping);
  let messages = nodes
    .map(node => normalizeMessage(node?.message))
    .filter(Boolean)
    .sort((a, b) => (a.time || 0) - (b.time || 0));

  if (!messages.length && Array.isArray(conv.messages)) {
    messages = conv.messages.map(normalizeMessage).filter(Boolean);
  }

  const project =
    conv.project?.title ||
    conv.project_name ||
    conv.gizmo_id ||
    conv.workspace_name ||
    inferProject(conv.title) ||
    'Ohne Projekt';

  const created = conv.create_time || messages[0]?.time || 0;
  const updated = conv.update_time || messages[messages.length - 1]?.time || created;
  const title = String(conv.title || `Chat ${index + 1}`).trim();

  return {
    id: String(conv.id || conv.conversation_id || `chat-${index}`),
    title,
    project,
    created,
    updated,
    messages,
    preview: createPreview(messages),
    searchable: normalizeSearch([title, project, ...messages.map(m => m.text)].join(' ')),
    size: messages.reduce((sum, m) => sum + m.text.length, 0)
  };
}

function normalizeMessage(message) {
  if (!message || !message.content) return null;
  const role = message.author?.role || message.role || 'unknown';
  const parts = message.content.parts || message.content.text || message.parts || [];
  const text = extractText(parts).trim();
  if (!text) return null;

  return {
    role,
    name: message.author?.name || role,
    time: message.create_time || message.timestamp || 0,
    text
  };
}

function extractText(value) {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map(extractText).filter(Boolean).join('\n\n');
  if (!value || typeof value !== 'object') return '';

  if (typeof value.text === 'string') return value.text;
  if (typeof value.result === 'string') return value.result;
  if (typeof value.content === 'string') return value.content;

  const collected = [];
  for (const [key, child] of Object.entries(value)) {
    if (['asset_pointer', 'metadata', 'image_url', 'audio_asset_pointer'].includes(key)) continue;
    const text = extractText(child);
    if (text) collected.push(text);
  }
  return collected.join('\n');
}

function inferProject(title) {
  if (!title) return null;
  const match = String(title).match(/(?:Projekt|Project)\s*[„"']?([^„“"']{3,80})/i);
  return match?.[1]?.trim() || null;
}

function createPreview(messages) {
  const relevant = messages.find(m => m.role === 'user') || messages[0];
  return relevant?.text.replace(/\s+/g, ' ').slice(0, 260) || '';
}

function normalizeSearch(text) {
  return String(text)
    .toLocaleLowerCase('de-DE')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '');
}

function renderAll() {
  const hasData = state.chats.length > 0;
  els.emptyState.hidden = hasData;
  els.appView.hidden = !hasData;
  els.clearButton.hidden = !hasData;
  if (!hasData) return;

  renderStats();
  renderProjects();
  renderChats();
}

function renderStats() {
  const projects = new Set(state.chats.map(chat => chat.project));
  const messages = state.chats.reduce((sum, chat) => sum + chat.messages.length, 0);
  const favorites = state.chats.filter(chat => state.favorites.has(chat.id)).length;

  els.statProjects.textContent = projects.size.toLocaleString('de-DE');
  els.statChats.textContent = state.chats.length.toLocaleString('de-DE');
  els.statMessages.textContent = messages.toLocaleString('de-DE');
  els.statFavorites.textContent = favorites.toLocaleString('de-DE');
}

function renderProjects() {
  const counts = new Map();
  for (const chat of state.chats) {
    counts.set(chat.project, (counts.get(chat.project) || 0) + 1);
  }

  const projects = [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0], 'de'));
  els.projectList.innerHTML = '';
  els.allProjectsButton.classList.toggle('active', state.selectedProject === null);

  for (const [project, count] of projects) {
    const button = document.createElement('button');
    button.className = 'project-button';
    if (project === state.selectedProject) button.classList.add('active');
    button.innerHTML = `<span>${escapeHtml(project)}</span><span>${count}</span>`;
    button.addEventListener('click', () => selectProject(project));
    els.projectList.appendChild(button);
  }
}

function selectProject(project) {
  state.selectedProject = project;
  renderProjects();
  renderChats();
}

function getFilteredChats() {
  const query = normalizeSearch(els.searchInput.value.trim());
  let result = state.chats.filter(chat => {
    if (state.selectedProject && chat.project !== state.selectedProject) return false;
    if (els.favoritesOnly.checked && !state.favorites.has(chat.id)) return false;
    if (query && !chat.searchable.includes(query)) return false;
    return true;
  });

  const mode = els.sortSelect.value;
  result.sort((a, b) => {
    if (mode === 'oldest') return a.updated - b.updated;
    if (mode === 'title') return a.title.localeCompare(b.title, 'de');
    if (mode === 'size') return b.size - a.size;
    return b.updated - a.updated;
  });

  return result;
}

function renderChats() {
  const chats = getFilteredChats();
  els.chatList.innerHTML = '';
  els.viewTitle.textContent = state.selectedProject || 'Alle Chats';
  els.resultCount.textContent = `${chats.length.toLocaleString('de-DE')} Treffer`;

  if (!chats.length) {
    els.chatList.innerHTML = '<div class="no-results">Keine passenden Chats gefunden.</div>';
    return;
  }

  const fragment = document.createDocumentFragment();
  for (const chat of chats) fragment.appendChild(createChatCard(chat));
  els.chatList.appendChild(fragment);
}

function createChatCard(chat) {
  const card = document.createElement('article');
  card.className = 'chat-card';

  const main = document.createElement('div');
  main.className = 'chat-main';
  main.innerHTML = `
    <h3 class="chat-title">${escapeHtml(chat.title)}</h3>
    <p class="chat-preview">${escapeHtml(chat.preview)}</p>
    <div class="chat-meta">
      <span class="badge">${escapeHtml(chat.project)}</span>
      <span>${formatDate(chat.updated)}</span>
      <span>${chat.messages.length.toLocaleString('de-DE')} Nachrichten</span>
    </div>
  `;
  main.addEventListener('click', () => openChat(chat));

  const favorite = document.createElement('button');
  favorite.className = 'favorite';
  favorite.title = 'Favorit';
  favorite.setAttribute('aria-label', 'Favorit umschalten');
  favorite.textContent = state.favorites.has(chat.id) ? '★' : '☆';
  favorite.classList.toggle('active', state.favorites.has(chat.id));
  favorite.addEventListener('click', () => toggleFavorite(chat.id));

  card.append(main, favorite);
  return card;
}

function toggleFavorite(id) {
  if (state.favorites.has(id)) state.favorites.delete(id);
  else state.favorites.add(id);
  localStorage.setItem('chatvault-favorites', JSON.stringify([...state.favorites]));
  renderStats();
  renderChats();
}

function openChat(chat) {
  state.activeChat = chat;
  els.dialogProject.textContent = chat.project;
  els.dialogTitle.textContent = chat.title;
  els.dialogMeta.textContent =
    `${formatDate(chat.created)} · ${chat.messages.length.toLocaleString('de-DE')} Nachrichten`;
  els.dialogMessages.innerHTML = '';

  const fragment = document.createDocumentFragment();
  for (const message of chat.messages) {
    const box = document.createElement('article');
    box.className = `message ${message.role}`;
    box.innerHTML = `
      <div class="message-head">
        <strong>${escapeHtml(roleLabel(message.role))}</strong>
        <span>${message.time ? formatDate(message.time) : ''}</span>
      </div>
      <div class="message-body">${escapeHtml(message.text)}</div>
    `;
    fragment.appendChild(box);
  }

  els.dialogMessages.appendChild(fragment);
  els.chatDialog.showModal();
}

function exportActiveChat() {
  const chat = state.activeChat;
  if (!chat) return;

  const content = [
    chat.title,
    `Projekt: ${chat.project}`,
    `Datum: ${formatDate(chat.created)}`,
    '',
    ...chat.messages.flatMap(message => [
      `[${roleLabel(message.role)}${message.time ? ` · ${formatDate(message.time)}` : ''}]`,
      message.text,
      ''
    ])
  ].join('\n');

  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `${safeFilename(chat.title)}.txt`;
  link.click();
  URL.revokeObjectURL(link.href);
}

function clearArchive() {
  if (!confirm('Das aktuell importierte Archiv aus dem Browser entfernen?')) return;
  state.chats = [];
  state.selectedProject = null;
  state.activeChat = null;
  sessionStorage.removeItem('chatvault-session');
  renderAll();
  showToast('Archiv entfernt');
}

function persistSession() {
  try {
    const compact = state.chats.map(chat => chat);
    sessionStorage.setItem('chatvault-session', JSON.stringify(compact));
  } catch {
    showToast('Archiv ist zu groß für die Sitzungsspeicherung');
  }
}

function restoreSession() {
  try {
    const saved = sessionStorage.getItem('chatvault-session');
    if (saved) state.chats = JSON.parse(saved);
  } catch {
    sessionStorage.removeItem('chatvault-session');
  }
  renderAll();
}

function toggleTheme() {
  state.theme = state.theme === 'dark' ? 'light' : 'dark';
  localStorage.setItem('chatvault-theme', state.theme);
  applyTheme();
}

function applyTheme() {
  document.documentElement.dataset.theme = state.theme;
  els?.themeButton && (els.themeButton.textContent = state.theme === 'dark' ? '☀' : '◐');
}

function roleLabel(role) {
  return {
    user: 'Du',
    assistant: 'ChatGPT',
    system: 'System',
    tool: 'Werkzeug'
  }[role] || role;
}

function formatDate(timestamp) {
  if (!timestamp) return 'Datum unbekannt';
  const value = timestamp < 1e12 ? timestamp * 1000 : timestamp;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Datum unbekannt';
  return new Intl.DateTimeFormat('de-DE', {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(date);
}

function safeFilename(name) {
  return String(name || 'chat')
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120) || 'chat';
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

let toastTimer;
function showToast(message) {
  els.toast.textContent = message;
  els.toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => els.toast.classList.remove('show'), 2200);
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./service-worker.js').catch(() => {});
  });
}
