const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api";

export interface ApiErrorBody {
  error: { code: string; message: string; details?: unknown };
  requestId?: string;
}

export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details?: unknown;

  constructor(status: number, body: ApiErrorBody) {
    super(body.error?.message ?? "Request failed");
    this.status = status;
    this.code = body.error?.code ?? "UNKNOWN_ERROR";
    this.details = body.error?.details;
  }
}

interface RequestOptions extends RequestInit {
  accessToken?: string | null;
}

/**
 * Every request goes to the real API with credentials included (the refresh
 * token lives in an httpOnly cookie the browser attaches automatically) —
 * the frontend never reads or stores the refresh token itself, and only
 * ever trusts data the server actually returned (Rule: frontend consumes
 * server-authorized data only).
 */
export async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { accessToken, headers, ...rest } = options;

  const res = await fetch(`${API_URL}${path}`, {
    ...rest,
    credentials: "include",
    headers: {
      ...(rest.body ? { "Content-Type": "application/json" } : {}),
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...headers,
    },
  });

  if (res.status === 204) {
    return undefined as T;
  }

  const body = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new ApiError(res.status, body as ApiErrorBody);
  }

  return body as T;
}
