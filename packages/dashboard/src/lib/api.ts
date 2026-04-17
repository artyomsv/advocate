export interface ApiOptions extends RequestInit {
  token?: string | null;
}

const BASE = import.meta.env.VITE_API_BASE_URL;

export async function api<T>(path: string, opts: ApiOptions = {}): Promise<T> {
  const { token, headers, ...rest } = opts;
  const res = await fetch(`${BASE}${path}`, {
    ...rest,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return (await res.json()) as T;
}
