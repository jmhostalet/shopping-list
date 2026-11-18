// Keep one string per selected item so older checkmarks and existing Firestore rules still work.
const limit = 999;

export function readQuantities(checked) {
  const quantities = new Map();
  for (const entry of checked) {
    const encoded = /^~([0-9]{1,3}):(.+)$/s.exec(entry);
    const id = encoded ? encoded[2] : entry;
    const quantity = encoded ? Number(encoded[1]) : 1;
    if (quantity > 0) quantities.set(id, Math.max(quantity, quantities.get(id) || 0));
  }
  return quantities;
}

export function changeQuantity(checked, id, delta) {
  const quantities = readQuantities(checked);
  const quantity = Math.max(0, Math.min(limit, (quantities.get(id) || 0) + delta));
  if (quantity) quantities.set(id, quantity);
  else quantities.delete(id);
  return Array.from(quantities, ([item, count]) => count === 1 ? item : `~${count}:${item}`);
}
