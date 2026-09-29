export function authHeader(env = process.env) {
  return { Authorization: `Bearer ${env.API_TOKEN}` };
}
