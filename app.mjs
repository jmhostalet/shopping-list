import { catalog } from './catalog.mjs';
import { firebaseConfig } from './firebase-config.mjs';

const $ = id => document.getElementById(id);
const tabs = [$('list-tab'), $('others-tab')];
const customList = $('custom-products');
const menu = $('account-menu');
const editDialog = $('edit-product');
const templateChecks = new Map();
let storageKey;
let state;
let editingId;

function loadChecklist() {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey));
    return {
      checked: Array.isArray(saved?.checked) ? saved.checked : [],
      custom: Array.isArray(saved?.custom) ? saved.custom : [],
    };
  } catch {
    showStatus('The saved checklist could not be loaded.');
    return { checked: [], custom: [] };
  }
}

function showStatus(message = '') {
  $('app-status').textContent = message;
  $('app-status').hidden = !message;
}

function save(next) {
  try {
    localStorage.setItem(storageKey, JSON.stringify(next));
  } catch {
    showStatus('Could not save changes in this browser.');
    return false;
  }
  state = next;
  showStatus();
  return true;
}

function productRow(id, name) {
  const row = document.createElement('li');
  const label = document.createElement('label');
  const check = document.createElement('input');
  const title = document.createElement('span');
  label.className = 'product';
  check.type = 'checkbox';
  title.textContent = name;
  label.append(check, title);
  row.append(label);
  check.addEventListener('change', () => {
    const checked = new Set(state.checked);
    if (check.checked) checked.add(id);
    else checked.delete(id);
    if (!save({ ...state, checked: [...checked] })) check.checked = !check.checked;
  });
  return { row, check };
}

for (const [category, products] of catalog) {
  const section = document.createElement('section');
  const heading = document.createElement('h2');
  const list = document.createElement('ul');
  section.className = 'category';
  heading.textContent = category;
  list.className = 'products';
  for (const name of products) {
    const id = category + ':' + name;
    const { row, check } = productRow(id, name);
    templateChecks.set(id, check);
    list.append(row);
  }
  section.append(heading, list);
  $('list-panel').append(section);
}

function renderChecks() {
  const checked = new Set(state.checked);
  for (const [id, check] of templateChecks) check.checked = checked.has(id);
  for (const check of customList.querySelectorAll('input')) check.checked = checked.has(check.value);
}

function renderCustom() {
  customList.replaceChildren();
  $('empty-others').hidden = state.custom.length > 0;
  for (const { id, name } of state.custom) {
    const { row, check } = productRow(id, name);
    check.value = id;
    const edit = document.createElement('button');
    edit.type = 'button';
    edit.className = 'edit-button';
    edit.textContent = 'Edit';
    edit.setAttribute('aria-label', 'Edit ' + name);
    edit.addEventListener('click', () => {
      editingId = id;
      $('edit-name').value = name;
      editDialog.showModal();
    });
    row.append(edit);
    customList.append(row);
  }
  renderChecks();
}

function selectTab(tab) {
  for (const button of tabs) {
    const active = button === tab;
    button.setAttribute('aria-selected', active);
    button.tabIndex = active ? 0 : -1;
    $(button.getAttribute('aria-controls')).hidden = !active;
  }
}

for (const [index, tab] of tabs.entries()) {
  tab.addEventListener('click', () => selectTab(tab));
  tab.addEventListener('keydown', event => {
    const next = { ArrowLeft: tabs[1 - index], ArrowRight: tabs[1 - index], Home: tabs[0], End: tabs[1] }[event.key];
    if (!next) return;
    event.preventDefault();
    selectTab(next);
    next.focus();
  });
}

for (const id of ['new-product', 'edit-name']) {
  $(id).addEventListener('input', () => $(id).setCustomValidity(''));
}

function productName(input) {
  const name = input.value.trim();
  if (!name) {
    input.setCustomValidity('Enter a product name.');
    input.reportValidity();
  }
  return name;
}

$('add-product').addEventListener('submit', event => {
  event.preventDefault();
  const input = $('new-product');
  const name = productName(input);
  if (name && save({ ...state, custom: [...state.custom, { id: crypto.randomUUID(), name }] })) {
    input.value = '';
    renderCustom();
    input.focus();
  }
});

$('save-product').addEventListener('submit', event => {
  event.preventDefault();
  const name = productName($('edit-name'));
  if (name && save({ ...state, custom: state.custom.map(item => item.id === editingId ? { ...item, name } : item) })) {
    editDialog.close();
    const index = state.custom.findIndex(item => item.id === editingId);
    renderCustom();
    customList.children[index]?.querySelector('button').focus();
  }
});

$('remove-product').addEventListener('click', () => {
  if (save({
    checked: state.checked.filter(id => id !== editingId),
    custom: state.custom.filter(item => item.id !== editingId),
  })) {
    editDialog.close();
    renderCustom();
    $('new-product').focus();
  }
});

function showMenu(open) {
  menu.hidden = !open;
  $('avatar').setAttribute('aria-expanded', open);
}

$('avatar').addEventListener('click', () => showMenu(menu.hidden));
document.addEventListener('click', event => {
  if (!$('account').contains(event.target)) showMenu(false);
});
document.addEventListener('focusin', event => {
  if (!$('account').contains(event.target)) showMenu(false);
});
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && !menu.hidden) {
    showMenu(false);
    $('avatar').focus();
  }
});
$('account-settings').addEventListener('click', () => {
  showMenu(false);
  $('settings').showModal();
});
$('settings').addEventListener('close', () => $('avatar').focus());
$('clear-checks').addEventListener('click', () => {
  showMenu(false);
  if (save({ ...state, checked: [] })) renderChecks();
  $('avatar').focus();
});

window.addEventListener('storage', event => {
  if (storageKey && (event.key === storageKey || event.key === null)) {
    state = loadChecklist();
    renderCustom();
  }
});

function showAccount(user) {
  $('login').hidden = !!user;
  $('app').hidden = !user;
  $('sign-in').disabled = false;
  $('login-status').textContent = '';
  if (!user) {
    storageKey = null;
    state = null;
    customList.replaceChildren();
    if (editDialog.open) editDialog.close();
    if ($('settings').open) $('settings').close();
    return;
  }
  showStatus();
  storageKey = 'shopping-list:v1:' + user.uid;
  state = loadChecklist();
  const name = user.displayName || user.email || 'Account';
  const initials = name.split(/[\s@._-]+/).filter(Boolean).slice(0, 2).map(word => Array.from(word)[0]).join('').toUpperCase();
  const fallback = document.createElement('span');
  fallback.textContent = initials;
  $('avatar').replaceChildren(fallback);
  if (user.photoURL?.startsWith('https://')) {
    const picture = document.createElement('img');
    picture.src = user.photoURL;
    picture.alt = '';
    picture.referrerPolicy = 'no-referrer';
    picture.addEventListener('error', () => picture.remove());
    $('avatar').append(picture);
  }
  $('account-name').textContent = name;
  $('account-email').textContent = $('settings-email').textContent = user.email || '';
  $('new-product').value = '';
  $('edit-name').value = '';
  $('new-product').setCustomValidity('');
  $('edit-name').setCustomValidity('');
  selectTab(tabs[0]);
  renderCustom();
}

async function startAuth() {
  const [appSdk, authSdk] = await Promise.all([
    import('https://www.gstatic.com/firebasejs/13.2.0/firebase-app.js'),
    import('https://www.gstatic.com/firebasejs/13.2.0/firebase-auth.js'),
  ]);
  const auth = authSdk.initializeAuth(appSdk.initializeApp(firebaseConfig, 'shopping-list'), {
    persistence: authSdk.browserLocalPersistence,
    popupRedirectResolver: authSdk.browserPopupRedirectResolver,
  });
  authSdk.onAuthStateChanged(auth, showAccount);
  $('sign-in').addEventListener('click', async () => {
    $('sign-in').disabled = true;
    $('login-status').textContent = 'Opening Google sign-in…';
    try {
      await authSdk.signInWithPopup(auth, new authSdk.GoogleAuthProvider());
    } catch (error) {
      $('login-status').textContent = error.code === 'auth/unauthorized-domain'
        ? 'Google sign-in is unavailable on this domain.'
        : 'Google sign-in did not complete. Try again.';
    } finally {
      $('sign-in').disabled = false;
    }
  });
  $('sign-out').addEventListener('click', async () => {
    showMenu(false);
    try {
      await authSdk.signOut(auth);
      $('sign-in').focus();
    } catch {
      showStatus('Could not log out. Try again.');
    }
  });
}

startAuth().catch(() => {
  $('login-status').textContent = 'Could not load Google sign-in. Check your connection and reload.';
});
