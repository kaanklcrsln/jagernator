export function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function slugify(text) {
  return text.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}
