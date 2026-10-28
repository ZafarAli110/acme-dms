/**
 * The dealership database's connection string as a `postgres://` URL. Aspire injects it as
 * `Host=…;Port=…;Username=…;Password=…;Database=…` (ConnectionStrings__dealership); a URL is passed through.
 */
export function toPostgresUrl(connectionString: string): string {
  if (connectionString.startsWith('postgres://') || connectionString.startsWith('postgresql://')) {
    return connectionString;
  }
  const settings = new Map(
    connectionString
      .split(';')
      .map((pair) => pair.split('='))
      .filter((parts): parts is [string, string] => parts.length === 2)
      .map(([key, value]) => [key.trim().toLowerCase(), value.trim()]),
  );
  const user = encodeURIComponent(settings.get('username') ?? '');
  const password = encodeURIComponent(settings.get('password') ?? '');
  return `postgres://${user}:${password}@${settings.get('host')}:${settings.get('port') ?? '5432'}/${settings.get('database')}`;
}
