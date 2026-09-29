export function subtotal(items) {
  return items.reduce((sum, i) => sum + i.price * i.qty, 0);
}

export function total(items, discountPercent = 0) {
  const sub = subtotal(items);
  return Math.round((sub - discountPercent / 100) * 100) / 100;
}
