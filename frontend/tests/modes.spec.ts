import { test, expect } from "@playwright/test";

test.beforeEach(async ({ request }) => {
  const normal = (await (await request.get("/api/personalities")).json())[0];
  for (const memory of normal.memories)
    await request.delete(`/api/memories/${memory.memory_id}`);
  for (const mode of ["normal", "demo"]) {
    await request.put("/api/personalities/1", {
      headers: { "X-Lab-Mode": mode },
      data: {
        personality_name: "ハル",
        personality1: "明るい",
        personality2: "好奇心旺盛",
      },
    });
  }
});

test("デモと通常のDBを切り替え、編集内容と選択モードを保持する", async ({
  page,
}, testInfo) => {
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "通常モード", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText("まだ、記憶はありません")).toBeVisible();
  await page.getByRole("button", { name: "最初の記憶を追加" }).click();
  await page
    .getByRole("textbox", { name: "過去の出来事", exact: true })
    .fill("通常モードで自分が入力した経験");
  await page
    .getByRole("textbox", { name: "そのときに考えたこと", exact: true })
    .fill("この入力は通常モードに残しておく");
  await page.getByRole("button", { name: "記憶を保存", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("記憶を保存しました");

  await page.getByRole("button", { name: "デモモード", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "デモモード：ダミーデータで試す" }),
  ).toBeVisible();
  await expect(page.locator(".memory-card")).toHaveCount(2);
  await expect(
    page.getByRole("textbox", { name: "過去の出来事", exact: true }).first(),
  ).not.toHaveValue("通常モードで自分が入力した経験");
  await page.getByLabel(/^名前/).fill("デモ専用のハル");
  await page.getByRole("button", { name: "基本設定を保存" }).click();
  await expect(
    page.getByRole("heading", {
      name: "デモ専用のハルの基本設定",
      exact: true,
    }),
  ).toBeVisible();
  await page.screenshot({
    path: `test-results/demo-mode-${testInfo.project.name}.png`,
    fullPage: true,
  });

  await page.getByRole("button", { name: "通常モード", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "通常モード：自分のデータを入力" }),
  ).toBeVisible();
  await expect(page.getByLabel(/^名前/)).toHaveValue("ハル");
  await expect(page.locator(".memory-card")).toHaveCount(1);
  await expect(
    page.getByRole("textbox", { name: "過去の出来事", exact: true }),
  ).toHaveValue("通常モードで自分が入力した経験");
  await page.screenshot({
    path: `test-results/normal-mode-${testInfo.project.name}.png`,
    fullPage: true,
  });

  await page.getByRole("button", { name: "デモモード", exact: true }).click();
  await expect(page.getByLabel(/^名前/)).toHaveValue("デモ専用のハル");
  await page.reload();
  await expect(
    page.getByRole("button", { name: "デモモード", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByLabel(/^名前/)).toHaveValue("デモ専用のハル");
  await page.getByLabel(/^名前/).fill("未保存のデモ名");
  page.once("dialog", (dialog) => dialog.dismiss());
  await page.getByRole("button", { name: "通常モード", exact: true }).click();
  await expect(page.getByLabel(/^名前/)).toHaveValue("未保存のデモ名");
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "通常モード", exact: true }).click();
  await expect(page.getByLabel(/^名前/)).toHaveValue("ハル");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
