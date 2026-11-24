export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  let response: globalThis.Response;
  try {
    response = await fetch(`/api${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", ...init?.headers },
      cache: "no-store",
    });
  } catch {
    throw new Error(
      "サーバーに接続できません。アプリの起動状態を確認してください。",
    );
  }
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(
      typeof data.detail === "string"
        ? data.detail
        : "処理に失敗しました。バックエンドの起動状態を確認してください。",
    );
  }
  return response.status === 204 ? (undefined as T) : response.json();
}

export const json = (method: string, data: unknown): RequestInit => ({
  method,
  body: JSON.stringify(data),
});
