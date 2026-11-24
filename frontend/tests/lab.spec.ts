import { test, expect } from "@playwright/test";

test.beforeEach(async ({ request }) => {
  // The config always launches a fresh test-only database and rejects existing servers.
  const first = (await (await request.get("/api/personalities")).json())[0];
  for (const memory of first.memories)
    await request.delete(`/api/memories/${memory.memory_id}`);
  await request.put(`/api/personalities/${first.personality_id}`, {
    data: {
      personality_name: "ハル",
      personality1: "明るい",
      personality2: "好奇心旺盛",
    },
  });
});

test("人格・記憶・価値観の編集と再読み込み、削除確認", async ({
  page,
  request,
}, testInfo) => {
  const initial = (await (await request.get("/api/personalities")).json())[0];
  const external: string[] = [];
  page.on("request", (req) => {
    if (!new URL(req.url()).hostname.match(/^(127\.0\.0\.1|localhost)$/))
      external.push(req.url());
  });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "ハルの基本設定" }),
  ).toBeVisible();
  await page.screenshot({
    path: `test-results/settings-${testInfo.project.name}.png`,
    fullPage: true,
  });
  await page.getByLabel(/^名前/).fill("テストのハル");
  await page.getByLabel(/^基本性格 1/).fill("前向きで穏やか");
  await page.getByRole("button", { name: "基本設定を保存" }).click();
  await expect(
    page.getByRole("heading", { name: "テストのハルの基本設定" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "最初の記憶を追加" }).click();
  await page
    .getByRole("textbox", { name: "過去の出来事", exact: true })
    .fill("友人と登山をして頂上に到達した。");
  await page
    .getByRole("textbox", { name: "そのときに考えたこと", exact: true })
    .fill("一歩ずつ進めば、目標に近づける。");
  await page.getByRole("button", { name: "記憶を保存", exact: true }).click();
  await page
    .getByLabel("新しい価値観", { exact: true })
    .fill("小さな積み重ねを大切にする。");
  await page.getByRole("button", { name: "価値観を追加", exact: true }).click();
  await expect(page.getByLabel("価値観を編集", { exact: true })).toHaveValue(
    "小さな積み重ねを大切にする。",
  );
  await page.reload();
  await expect(page.getByLabel(/^名前/)).toHaveValue("テストのハル");
  await expect(
    page.getByRole("textbox", { name: "過去の出来事", exact: true }),
  ).toHaveValue("友人と登山をして頂上に到達した。");
  await expect(page.getByLabel("価値観を編集", { exact: true })).toHaveValue(
    "小さな積み重ねを大切にする。",
  );
  await page
    .getByLabel("価値観を編集", { exact: true })
    .fill("協力と積み重ねを大切にする。");
  await page.getByRole("button", { name: "価値観を保存", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("価値観を保存しました");
  await page.getByRole("button", { name: /ナツ.*負けず嫌い/ }).click();
  await expect(
    page.getByRole("heading", { name: "ナツの基本設定" }),
  ).toBeVisible();
  await expect(page.getByText("まだ、記憶はありません")).toBeVisible();
  await page
    .getByRole("button", { name: /テストのハル.*前向きで穏やか/ })
    .click();
  await page.getByLabel(/^名前/).fill("未保存の名前");
  page.once("dialog", (dialog) => dialog.dismiss());
  await page.getByRole("button", { name: "反応比較", exact: true }).click();
  await expect(page.getByLabel(/^名前/)).toHaveValue("未保存の名前");
  await page.getByLabel(/^名前/).fill("テストのハル");
  page.once("dialog", (dialog) => dialog.dismiss());
  await page
    .getByRole("button", { name: "この記憶を削除", exact: true })
    .click();
  await expect(
    page.getByRole("textbox", { name: "過去の出来事", exact: true }),
  ).toBeVisible();
  page.once("dialog", (dialog) => dialog.accept());
  await page
    .getByRole("button", { name: "この記憶を削除", exact: true })
    .click();
  await expect(page.getByText("まだ、記憶はありません")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  expect(external).toEqual([]);
  expect(errors).toEqual([]);
  await request.put(`/api/personalities/${initial.personality_id}`, {
    data: {
      personality_name: initial.personality_name,
      personality1: initial.personality1,
      personality2: initial.personality2,
    },
  });
});

test("比較条件と空の回答、履歴ダイアログ", async ({ page }, testInfo) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "ハルの基本設定" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "反応比較", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "同じ問いに、4つの視点。" }),
  ).toBeVisible();
  await expect(page.locator(".response-card")).toHaveCount(4);
  await page.getByRole("button", { name: "例文を使う" }).click();
  await expect(page.getByLabel("4人への問いかけ")).toHaveValue(
    "新しいことに挑戦したいけれど、失敗が怖い。どう思う？",
  );
  for (const checkbox of await page.getByRole("checkbox").all())
    await checkbox.uncheck();
  await expect(
    page.getByText("基準回答：名前を含むすべての人格情報を送信しません。"),
  ).toBeVisible();
  await page.screenshot({
    path: `test-results/comparison-${testInfo.project.name}.png`,
    fullPage: true,
  });
  await page.getByRole("button", { name: "実験の履歴" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "閉じる", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test("実際のローカルモデルによる4人の回答と履歴・プロンプト確認", async ({
  page,
}, testInfo) => {
  test.skip(
    !process.env.E2E_LIVE || testInfo.project.name !== "desktop",
    "E2E_LIVE=1 で実モデル検証を有効にします。",
  );
  test.setTimeout(360000);
  await page.goto("/");
  await expect(page.getByText("Ollama 接続済み")).toBeVisible();
  await page.getByRole("button", { name: "反応比較", exact: true }).click();
  await page
    .getByLabel("4人への問いかけ")
    .fill("新しい趣味を始めたい。どう思う？");
  await page.getByRole("button", { name: "4人の反応を比較する" }).click();
  await expect(page.locator(".response-state.complete")).toHaveCount(4, {
    timeout: 300000,
  });
  await expect(page.locator(".answer-text")).toHaveCount(4);
  await page.screenshot({
    path: "test-results/live-responses.png",
    fullPage: true,
  });
  const answer = await page.locator(".answer-text").first().innerText();
  await page
    .getByRole("button", { name: "使用した情報を見る" })
    .first()
    .click();
  await expect(page.getByRole("dialog")).toContainText("システムプロンプト");
  await expect(page.locator(".prompt-section").first()).toContainText("ハル");
  await expect(page.locator(".prompt-section").first()).not.toContainText(
    "ナツ",
  );
  await expect(page.locator(".prompt-section").last()).toContainText(
    "新しい趣味を始めたい。どう思う？",
  );
  await page.keyboard.press("Escape");
  await page.reload();
  await page.getByRole("button", { name: "反応比較", exact: true }).click();
  await page.getByRole("button", { name: "実験の履歴" }).click();
  await page.locator(".history-list > button").first().click();
  await expect(page.locator(".answer-text").first()).toHaveText(answer);
});
