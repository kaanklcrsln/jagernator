export function isValidEmail(email) {
  return typeof email === 'string' && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email);
}

export function createUser(name, email) {
  if (!isValidEmail(email)) throw new Error('invalid email');
  return { name, email };
}

export function updateEmail(user, email) {
  if (!isValidEmail(email)) throw new Error('invalid email');
  return { ...user, email };
}
