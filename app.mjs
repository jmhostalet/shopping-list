import { catalog } from './catalog.mjs';
import { firebaseConfig } from './firebase-config.mjs';
import { invitationUrl, parseInvitation, sharedLists } from './sharing.mjs';

import { changeQuantity, readQuantities } from './quantities.mjs';

const $ = id => document.getElementById(id);
const tabs = [$('list-tab'), $('others-tab')];
const customList = $('custom-products');
const menu = $('account-menu');
const editDialog = $('edit-product');
const templateProducts = new Map();
const quantityUpdates = new Map();
let storageKey;
let state;
let editingId;
let sharing;
let membership;
let membershipReady = false;
let listReady = false;
let sharingBusy = false;
let sharingError = '';
let stopMembership;
let stopList;

function checklist(value) {
  return {
    checked: Array.isArray(value?.checked) ? value.checked.filter(id => typeof id === 'string') : [],
    custom: Array.isArray(value?.custom) ? value.custom.filter(item =>
      typeof item?.id === 'string' && typeof item.name === 'string') : [],
  };
}

function loadChecklist() {
  try {
    return checklist(JSON.parse(localStorage.getItem(storageKey)));
  } catch {
    showStatus('The saved checklist could not be loaded.');
    return { checked: [], custom: [] };
  }
}

function showStatus(message = '') {
  $('app-status').textContent = message;
  $('app-status').hidden = !message;
  if (editDialog.open) $('edit-status').textContent = message;
}

function applyChecklist(next) {
  const customChanged = JSON.stringify(state?.custom) !== JSON.stringify(next.custom);
  state = next;
  if (customChanged) renderCustom();
  else renderQuantities();
}

async function save(transform) {
  if (!storageKey || (membership && !listReady) || sharingBusy) return false;
  try {
    if (membership) {
      await sharing.change(membership.listId, current => transform(checklist(current)));
    } else {
      const next = transform(loadChecklist());
      localStorage.setItem(storageKey, JSON.stringify(next));
      applyChecklist(next);
    }
    showStatus();
    return true;
  } catch {
    showStatus(membership ? 'Could not sync this change. Check your connection and try again.' : 'Could not save changes in this browser.');
    return false;
  }
}

function adjustQuantity(id, delta) {
  const transform = current => {
    if (!templateProducts.has(id) && !current.custom.some(item => item.id === id)) return current;
    return { ...current, checked: changeQuantity(current.checked, id, delta) };
  };
  if (!membership) return save(transform);

  const activeMembership = membership;
  const previous = quantityUpdates.get(id) || Promise.resolve();
  const pending = previous.then(() => {
    if (membership === activeMembership) return save(transform);
  });
  quantityUpdates.set(id, pending);
  return pending.finally(() => {
    if (quantityUpdates.get(id) === pending) quantityUpdates.delete(id);
  });
}

function productRow(id, name) {
  const row = document.createElement('li');
  const product = document.createElement('button');
  const count = document.createElement('span');
  const title = document.createElement('span');
  const decrease = document.createElement('button');
  row.dataset.productId = id;
  product.className = 'product';
  product.type = decrease.type = 'button';
  count.className = 'quantity';
  title.className = 'product-name';
  title.textContent = name;
  decrease.className = 'decrease-button';
  decrease.textContent = '−';
  decrease.setAttribute('aria-label', 'Decrease quantity of ' + name);
  product.append(count, title);
  row.append(product, decrease);

  let start;
  let swiped = false;
  product.addEventListener('pointerdown', event => {
    if (!event.isPrimary || event.button !== 0) return;
    start = { id: event.pointerId, x: event.clientX, y: event.clientY };
    swiped = false;
    product.setPointerCapture(event.pointerId);
  });
  product.addEventListener('pointercancel', () => { start = null; });
  product.addEventListener('pointerup', event => {
    if (event.pointerId !== start?.id) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    start = null;
    swiped = Math.max(Math.abs(dx), Math.abs(dy)) >= 36;
    if (Math.abs(dx) >= 36 && Math.abs(dx) >= Math.abs(dy) * 1.4) {
      void adjustQuantity(id, Math.sign(dx));
    }
  });
  product.addEventListener('click', event => {
    if (swiped && event.detail) return;
    void adjustQuantity(id, 1);
  });
  decrease.addEventListener('click', () => void adjustQuantity(id, -1));
  return row;
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
    const row = productRow(id, name);
    templateProducts.set(id, row);
    list.append(row);
  }
  section.append(heading, list);
  $('list-panel').append(section);
}

function renderQuantities() {
  const quantities = readQuantities(state.checked);
  for (const row of [...templateProducts.values(), ...customList.children]) {
    const quantity = quantities.get(row.dataset.productId) || 0;
    const product = row.querySelector('.product');
    row.classList.toggle('selected', quantity > 0);
    row.querySelector('.quantity').textContent = quantity;
    row.querySelector('.decrease-button').disabled = quantity === 0;
    product.setAttribute('aria-label', row.querySelector('.product-name').textContent + ', quantity ' + quantity + '. Increase quantity');
  }
}

function renderCustom() {
  customList.replaceChildren();
  $('empty-others').hidden = state.custom.length > 0;
  for (const { id, name } of state.custom) {
    const row = productRow(id, name);
    const edit = document.createElement('button');
    edit.type = 'button';
    edit.className = 'edit-button';
    edit.textContent = 'Edit';
    edit.setAttribute('aria-label', 'Edit ' + name);
    edit.addEventListener('click', () => {
      editingId = id;
      $('edit-name').value = name;
      $('edit-name').setCustomValidity('');
      $('edit-status').textContent = '';
      editDialog.showModal();
    });
    row.append(edit);
    customList.append(row);
  }
  renderQuantities();
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

$('add-product').addEventListener('submit', async event => {
  event.preventDefault();
  const input = $('new-product');
  const name = productName(input);
  if (!name) return;
  const button = event.submitter;
  const product = { id: crypto.randomUUID(), name };
  button.disabled = true;
  const saved = await save(current => ({ ...current, custom: [...current.custom, product] }));
  button.disabled = false;
  if (saved && input.value.trim() === name) input.value = '';
  input.focus();
});

$('save-product').addEventListener('submit', async event => {
  event.preventDefault();
  const name = productName($('edit-name'));
  if (!name) return;
  const id = editingId;
  const button = event.submitter;
  button.disabled = $('remove-product').disabled = true;
  const saved = await save(current => ({
    ...current, custom: current.custom.map(item => item.id === id ? { ...item, name } : item),
  }));
  button.disabled = $('remove-product').disabled = false;
  if (saved) editDialog.close();
});

$('remove-product').addEventListener('click', async event => {
  const id = editingId;
  const button = event.currentTarget;
  const saveButton = $('save-product').querySelector('button');
  button.disabled = saveButton.disabled = true;
  const saved = await save(current => ({
    checked: changeQuantity(current.checked, id, -999),
    custom: current.custom.filter(item => item.id !== id),
  }));
  button.disabled = saveButton.disabled = false;
  if (saved) {
    editDialog.close();
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
$('clear-quantities').addEventListener('click', () => {
  showMenu(false);
  void save(current => ({ ...current, checked: [] }));
  $('avatar').focus();
});

function renderSharing(message = sharingError) {
  $('sharing-status').textContent = message;
  $('list-context').hidden = !membership;
  $('personal-sharing').hidden = !!membership;
  $('active-sharing').hidden = !membership;
  $('share-link').value = membership ? invitationUrl(membership, location.href) : '';
  $('create-shared').disabled = !membershipReady || sharingBusy;
  $('leave-shared').disabled = sharingBusy;
  $('join-shared').querySelector('button').disabled = !membershipReady || sharingBusy;
  $('list-panel').inert = $('others-panel').inert = sharingBusy || (!!membership && !listReady);
  $('clear-quantities').disabled = $('list-panel').inert;
}

function watchAccountSharing(sdk, db, uid) {
  sharing = sharedLists(sdk, db, uid);
  const accountSharing = sharing;
  stopMembership = sharing.watchMembership(entry => {
    if (sharing !== accountSharing) return;
    membershipReady = true;
    sharingError = '';
    if (entry?.listId === membership?.listId) {
      if (!entry) showStatus();
      renderSharing();
      return;
    }
    stopList?.();
    membership = entry;
    quantityUpdates.clear();
    listReady = false;
    if (editDialog.open) editDialog.close();
    if (entry) {
      applyChecklist(checklist());
      showStatus('Loading shared checklist…');
      stopList = sharing.watchList(entry.listId, data => {
        if (sharing !== accountSharing || membership !== entry) return;
        if (!data) {
          showStatus('This shared checklist is unavailable.');
          return;
        }
        listReady = true;
        applyChecklist(checklist(data));
        renderSharing();
        showStatus();
      }, () => {
        if (sharing !== accountSharing || membership !== entry) return;
        listReady = false;
        renderSharing();
        showStatus('Could not load the shared checklist.');
      });
    } else {
      applyChecklist(loadChecklist());
      showStatus();
    }
    renderSharing();
  }, () => {
    if (sharing !== accountSharing) return;
    membershipReady = false;
    sharingError = 'Sharing is unavailable. Check your connection or try again later.';
    if (!membership) showStatus();
    renderSharing();
  });
}

function openSharing() {
  showMenu(false);
  const entry = parseInvitation(location.href);
  $('join-link').value = entry ? location.href : '';
  renderSharing(membershipReady ? '' : sharingError || 'Connecting to sharing…');
  $('sharing').showModal();
}

$('share-list').addEventListener('click', openSharing);
window.addEventListener('hashchange', () => {
  if (storageKey && parseInvitation(location.href) && !$('sharing').open) openSharing();
});
$('sharing').addEventListener('close', () => $('avatar').focus());

async function changeMembership(operation, failure) {
  if (!sharing || sharingBusy) return;
  const accountSharing = sharing;
  sharingBusy = true;
  renderSharing('Saving…');
  let message = '';
  try {
    await operation();
    if (sharing === accountSharing && parseInvitation(location.href)) {
      const url = new URL(location.href);
      url.hash = '';
      history.replaceState(null, '', url);
    }
  } catch {
    message = failure;
  } finally {
    if (sharing === accountSharing) {
      sharingBusy = false;
      renderSharing(message);
    }
  }
}

$('create-shared').addEventListener('click', () => {
  void changeMembership(() => sharing.create(state), 'Could not create a shared list. Try again when connected.');
});
$('leave-shared').addEventListener('click', () => {
  void changeMembership(() => sharing.leave(), 'Could not switch to your personal list.');
});
$('join-shared').addEventListener('submit', event => {
  event.preventDefault();
  const entry = parseInvitation($('join-link').value.trim());
  if (!entry) {
    renderSharing('Enter a valid invitation link.');
    return;
  }
  void changeMembership(async () => {
    await sharing.join(entry);
    $('join-link').value = '';
  }, 'Could not join. Check the invitation link and your connection.');
});
$('copy-link').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText($('share-link').value);
    renderSharing('Invitation link copied.');
  } catch {
    $('share-link').select();
    renderSharing('Select and copy the invitation link.');
  }
});

window.addEventListener('storage', event => {
  if (storageKey && !membership && (event.key === storageKey || event.key === null)) {
    applyChecklist(loadChecklist());
  }
});

function showAccount(user, sdk, db) {
  stopMembership?.();
  stopList?.();
  sharing = membership = null;
  quantityUpdates.clear();
  membershipReady = listReady = sharingBusy = false;
  sharingError = db ? '' : 'Sharing is unavailable. Check your connection or try again later.';
  renderSharing();
  if (editDialog.open) editDialog.close();
  if ($('sharing').open) $('sharing').close();
  $('login').hidden = !!user;
  $('app').hidden = !user;
  $('sign-in').disabled = false;
  $('login-status').textContent = '';
  if (!user) {
    storageKey = null;
    state = null;
    customList.replaceChildren();
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
  if (db) watchAccountSharing(sdk, db, user.uid);
  if (parseInvitation(location.href)) openSharing();
}

async function startAuth() {
  const [appSdk, authSdk] = await Promise.all([
    import('https://www.gstatic.com/firebasejs/13.2.0/firebase-app.js'),
    import('https://www.gstatic.com/firebasejs/13.2.0/firebase-auth.js'),
  ]);
  const app = appSdk.initializeApp(firebaseConfig, 'shopping-list');
  const auth = authSdk.initializeAuth(app, {
    persistence: authSdk.browserLocalPersistence,
    popupRedirectResolver: authSdk.browserPopupRedirectResolver,
  });
  const firestore = import('https://www.gstatic.com/firebasejs/13.2.0/firebase-firestore.js')
    .then(sdk => ({ sdk, db: sdk.getFirestore(app) }))
    .catch(() => ({}));
  authSdk.onAuthStateChanged(auth, async user => {
    const { sdk, db } = user ? await firestore : {};
    if (auth.currentUser?.uid === user?.uid) showAccount(user, sdk, db);
  });
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
