// Network policy: deny-by-default (or ask) with an explicit destination allowlist.
// Destinations come from config.security.allowed_destinations plus, for enabled
// plugins, the intersection of what the plugin declares and what the user approved.

export function hostMatches(host, pattern) {
  if (!host) return false;
  host = host.toLowerCase().replace(/\.$/, '');
  if (pattern.startsWith('*.')) return host.endsWith(pattern.slice(1));
  return host === pattern;
}

export function createNetworkPolicy(config, plugins = []) {
  const destinations = new Set(config.security.allowed_destinations);
  for (const p of plugins) {
    const approved = config.plugins[p.name];
    if (!p.valid || !approved?.enabled) continue;
    for (const d of p.manifest.permissions.network.destinations) {
      if (approved.approved_destinations.includes(d)) destinations.add(d);
    }
  }
  const list = [...destinations];
  return {
    mode: config.security.network,
    destinations: list,
    mcpServers: config.security.allowed_mcp_servers,
    allows: (host) => list.some((d) => hostMatches(host, d)),
    /** Decision for contacting `host` (null = unknown destination). */
    decide(host, what) {
      if (host && this.allows(host)) return null;
      const target = host ? `"${host}"` : 'an unknown destination';
      const reason = `${what} contacts ${target}, which is not in security.allowed_destinations.`;
      return this.mode === 'ask'
        ? { decision: 'ask', rule: 'network', reason }
        : { decision: 'deny', rule: 'network', reason: `${reason} Network is deny-by-default; ask the user to allow this destination in .jagernator/config.yaml.` };
    },
  };
}
