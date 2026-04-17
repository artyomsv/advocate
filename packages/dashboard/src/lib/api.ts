export interface ApiOptions extends RequestInit {
  token?: string | null;
  /** Set false for 204-style endpoints that return no body. */
  parseJson?: boolean;
}

const BASE = import.meta.env.VITE_API_BASE_URL;

export async function api<T>(path: string, opts: ApiOptions = {}): Promise<T> {
  const { token, headers, parseJson = true, ...rest } = opts;
  const res = await fetch(`${BASE}${path}`, {
    ...rest,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  if (!parseJson || res.status === 204) return undefined as T;
  return (await res.json()) as T;
}
