const tokenPattern = /^[a-f0-9]{32}$/;

export function parseInvitation(value) {
  try {
    const url = new URL(value);
    const match = /^#join=([a-f0-9]{32})\.([a-f0-9]{32})$/.exec(url.hash);
    if (match) return { listId: match[1], invite: match[2] };
  } catch {
    // The join form accepts an invitation URL.
  }
  return null;
}

export function invitationUrl({ listId, invite }, location) {
  const url = new URL(location);
  url.search = '';
  url.hash = 'join=' + listId + '.' + invite;
  return url.href;
}

export function sharedLists(sdk, db, uid) {
  const membership = sdk.doc(db, 'shoppingMemberships', uid);
  const list = id => sdk.doc(db, 'shoppingLists', id);

  return {
    watchMembership(next, error) {
      return sdk.onSnapshot(membership, { includeMetadataChanges: true }, snapshot => {
        if (!snapshot.metadata.fromCache && !snapshot.metadata.hasPendingWrites) next(snapshot.data());
      }, error);
    },
    watchList(id, next, error) {
      return sdk.onSnapshot(list(id), { includeMetadataChanges: true }, snapshot => {
        if (!snapshot.metadata.fromCache && !snapshot.metadata.hasPendingWrites) next(snapshot.data());
      }, error);
    },
    async create(checklist) {
      const token = () => crypto.randomUUID().replaceAll('-', '');
      const entry = { listId: token(), invite: token() };
      await sdk.runTransaction(db, async transaction => {
        if ((await transaction.get(membership)).exists()) throw new Error('Already sharing');
        transaction.set(list(entry.listId), { ...checklist, owner: uid, invite: entry.invite });
        transaction.set(membership, entry);
      });
    },
    join(entry) {
      if (!tokenPattern.test(entry.listId) || !tokenPattern.test(entry.invite)) throw new Error('Invalid invitation');
      return sdk.runTransaction(db, async transaction => {
        await transaction.get(membership);
        transaction.set(membership, entry);
      });
    },
    leave() {
      return sdk.runTransaction(db, async transaction => {
        await transaction.get(membership);
        transaction.delete(membership);
      });
    },
    change(id, transform) {
      return sdk.runTransaction(db, async transaction => {
        const ref = list(id);
        const snapshot = await transaction.get(ref);
        const { checked, custom } = snapshot.data();
        const next = transform({ checked, custom });
        transaction.update(ref, { checked: next.checked, custom: next.custom });
      });
    },
  };
}
