const $ = (id) => document.getElementById(id);
const token = document.querySelector('meta[name="app-token"]').content;
let busy = false;
async function api(path, options = {}) {
  const response = await fetch(path, {...options, headers: {...options.headers, 'X-App-Token': token}});
  const data = await response.json().catch(() => ({error: 'Unexpected server response. Refresh the page.'}));
  if (!response.ok) throw new Error(data.error || 'Request failed.');
  return data;
}
function notice(text, error = false) { $('notice').textContent = text; $('notice').classList.toggle('error', error); }
function jsonPost(path, body) { return api(path, {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body)}); }
async function refreshDocs() {
  const data = await api('/api/documents');
  $('doc-count').textContent = data.documents.length;
  $('api-status').textContent = data.configured ? '● API key configured' : '○ Add API key in .env';
  $('documents').replaceChildren();
  if (!data.documents.length) {
    const empty = document.createElement('p'); empty.className = 'empty'; empty.textContent = 'Your documents will appear here.'; $('documents').append(empty);
  }
  for (const doc of data.documents) {
    const row = document.createElement('div'); row.className = 'doc';
    const icon = document.createElement('span'); icon.className = 'doc-icon'; icon.textContent = '▤';
    const info = document.createElement('div'); info.className = 'doc-info'; info.textContent = doc.name;
    const sub = document.createElement('small'); sub.textContent = `${doc.chunks} searchable passages`; info.append(sub);
    const remove = document.createElement('button'); remove.textContent = '×'; remove.title = 'Remove document'; remove.setAttribute('aria-label', `Remove ${doc.name}`);
    remove.onclick = async () => {
      if (!confirm(`Remove ${doc.name} from the knowledge base?`)) return;
      remove.disabled = true;
      try { await api(`/api/documents/${doc.id}`, {method:'DELETE'}); await refreshDocs(); notice('Document removed. Old chat answers remain until you start a new conversation.'); }
      catch(e) { notice(e.message, true); remove.disabled = false; }
    };
    row.append(icon, info, remove); $('documents').append(row);
  }
}
$('open-paste').onclick = () => $('paste-dialog').showModal();
$('close-paste').onclick = () => $('paste-dialog').close();
$('paste-form').onsubmit = async (event) => {
  event.preventDefault(); $('save-paste').disabled = true; $('save-paste').textContent = 'Adding document…';
  try {
    const data = await jsonPost('/api/paste', {name:$('doc-name').value, text:$('doc-text').value});
    $('paste-dialog').close(); $('paste-form').reset(); await refreshDocs(); notice(data.message);
  } catch(e) { alert(e.message); }
  finally { $('save-paste').disabled = false; $('save-paste').textContent = 'Add to knowledge base →'; }
};
$('file').onchange = async () => {
  const file = $('file').files[0]; if (!file) return;
  if (file.size > 12 * 1024 * 1024 - 10000) { notice('Choose a file smaller than 12 MB.', true); $('file').value = ''; return; }
  $('file').disabled = true; notice('Reading and adding your document…');
  const form = new FormData(); form.append('file', file);
  try { const data = await api('/api/upload', {method:'POST', body:form}); await refreshDocs(); notice(data.message); }
  catch(e) { notice(e.message, true); }
  finally { $('file').disabled = false; $('file').value = ''; }
};
document.querySelector('.upload').onkeydown = event => { if (event.key === 'Enter' || event.key === ' ') {event.preventDefault(); $('file').click();} };
function message(role, text, sources = []) {
  $('welcome').hidden = true;
  const row = document.createElement('article'); row.className = `message ${role}`;
  const label = document.createElement('div'); label.className = 'message-label';
  const badge = document.createElement('span'); badge.className = 'badge'; badge.textContent = role === 'user' ? 'YOU' : '✧';
  label.append(badge, document.createTextNode(role === 'user' ? 'You' : 'Deskwise'));
  const bubble = document.createElement('div'); bubble.className = 'bubble'; bubble.textContent = text;
  row.append(label, bubble);
  if (role === 'assistant') {
    const copy = document.createElement('button'); copy.className = 'copy'; copy.textContent = 'Copy answer';
    copy.onclick = async () => { try { await navigator.clipboard.writeText(text); copy.textContent = 'Copied ✓'; } catch {notice('Select the answer text and press Ctrl+C.', true);} };
    row.append(copy);
  }
  if (sources.length) {
    const heading = document.createElement('div'); heading.className = 'source-heading'; heading.textContent = 'RETRIEVED PASSAGES · EXPAND TO VERIFY'; row.append(heading);
    for (const source of sources) {
      const details = document.createElement('details'); details.className = 'source';
      const summary = document.createElement('summary'); summary.textContent = `[${source.id}] ${source.name} · ${source.location}`;
      const excerpt = document.createElement('pre'); excerpt.textContent = source.text; details.append(summary, excerpt); row.append(details);
    }
  }
  $('chat').append(row); $('chat').scrollTop = $('chat').scrollHeight;
  return row;
}
$('chat-form').onsubmit = async (event) => {
  event.preventDefault(); const question = $('question').value.trim(); if (busy || !question) return;
  busy = true; $('send').disabled = true; notice(''); message('user', question); $('question').value = ''; $('question').style.height = '27px';
  const loading = message('assistant', 'Finding passages and preparing your answer…'); loading.querySelector('.bubble').classList.add('typing');
  try { const data = await jsonPost('/api/chat', {question}); loading.remove(); message('assistant', data.answer, data.sources); }
  catch(e) { loading.remove(); message('error', e.message); }
  finally { busy = false; $('send').disabled = false; $('question').focus(); }
};
$('question').onkeydown = (event) => { if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {event.preventDefault(); $('chat-form').requestSubmit();} };
$('question').oninput = () => { $('question').style.height = '27px'; $('question').style.height = Math.min($('question').scrollHeight,130)+'px'; };
document.querySelectorAll('[data-question]').forEach(button => button.onclick = () => { $('question').value = button.dataset.question; $('question').focus(); });
$('new-chat').onclick = () => { if (busy) {notice('Wait for the current answer to finish.'); return;} document.querySelectorAll('.message').forEach(row => row.remove()); $('welcome').hidden = false; notice(''); $('question').value = ''; };
refreshDocs().catch(e => notice(e.message, true));
