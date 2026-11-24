import type { LabMode } from "./types";

export const MODE_STORAGE_KEY = "personality-lab-mode";
let pageMode: LabMode | undefined;

// Pin this document's requests to its displayed mode, even when another tab switches.
export function getLabMode(): LabMode {
  if (typeof window === "undefined") return "normal";
  if (pageMode) return pageMode;
  try {
    pageMode =
      localStorage.getItem(MODE_STORAGE_KEY) === "demo" ? "demo" : "normal";
  } catch {
    pageMode = "normal";
  }
  return pageMode;
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const mode = getLabMode();
  let response: globalThis.Response;
  try {
    response = await fetch(`/api${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...init?.headers,
        "X-Lab-Mode": mode,
      },
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
  if (response.headers.get("X-Lab-Mode") !== mode) {
    throw new Error(
      "モード切替を反映するため、アプリを一度終了して start.cmd で起動し直してください。",
    );
  }
  return response.status === 204 ? (undefined as T) : response.json();
}

export const json = (method: string, data: unknown): RequestInit => ({
  method,
  body: JSON.stringify(data),
});
