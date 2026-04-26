import { expect, test } from "@playwright/test";
import {
  installSmokeBootstrapHook,
  issueBootstrapToken,
  TERMINAL_ID,
  BOOTSTRAP_TOKEN_STORAGE_KEY,
  buildActivationCode,
  ensureSecondaryTerminal,
  clearPairingSessions,
  bootstrapSession,
  SECONDARY_TERMINAL_ID,
  expectEnvelope,
  bootstrapTokens,
  TERMINAL_ACTIVATION_TEST,
  TERMINAL_ACTIVATION_LINK_TEST,
  TERMINAL_ACTIVATION_CODE_TEST,
  TERMINAL_PAIRING_TEST,
  TERMINAL_ACTIVATION_ENTRY_TEST,
  TERMINAL_ACTIVATION_LANDING_TEST,
} from "./support/smokeHelpers";

installSmokeBootstrapHook();

test(TERMINAL_ACTIVATION_TEST, async ({ page }) => {
  const token = issueBootstrapToken(TERMINAL_ID);

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "激活这台中控" })).toBeVisible();
  await expect(page.getByText("Activate this terminal with a pairing code")).toBeVisible();
  await expect(page.getByText("Verify management PIN.")).toBeVisible();
  await expect(page.locator(".control-shell")).toHaveCount(0);

  await page.getByLabel("Bootstrap token").fill(token);
  await page.getByRole("button", { name: "激活终端" }).click();

  await expect(page.locator(".control-shell")).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate((key) => window.localStorage.getItem(key), BOOTSTRAP_TOKEN_STORAGE_KEY),
    )
    .toBe(token);
});

test(TERMINAL_ACTIVATION_LINK_TEST, async ({ page }) => {
  const token = issueBootstrapToken(TERMINAL_ID);

  await page.goto(`/?bootstrap_token=${encodeURIComponent(token)}`);

  await expect(page.locator(".control-shell")).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate((key) => window.localStorage.getItem(key), BOOTSTRAP_TOKEN_STORAGE_KEY),
    )
    .toBe(token);
  await expect.poll(() => page.evaluate(() => window.location.search)).toBe("");
});

test(TERMINAL_ACTIVATION_CODE_TEST, async ({ page }) => {
  const token = issueBootstrapToken(TERMINAL_ID);
  const activationCode = buildActivationCode(token);

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "激活这台中控" })).toBeVisible();
  await expect(page.getByText("Manual recovery")).toBeVisible();

  await page.locator("#bootstrap-token").fill(activationCode);
  await page.getByRole("button", { name: "激活终端" }).click();

  await expect(page.locator(".control-shell")).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate((key) => window.localStorage.getItem(key), BOOTSTRAP_TOKEN_STORAGE_KEY),
    )
    .toBe(token);
});

test(TERMINAL_PAIRING_TEST, async ({ page, request }) => {
  ensureSecondaryTerminal();
  clearPairingSessions(TERMINAL_ID);

  await page.goto("/");
  await expect(page.getByText("Claim this code from Pairing claim.")).toBeVisible();
  await expect
    .poll(
      async () => (await page.getByTestId("pairing-code-value").textContent())?.trim() ?? "",
    )
    .not.toBe("Loading...");
  const pairingCode = (
    (await page.getByTestId("pairing-code-value").textContent()) ?? ""
  ).trim();
  expect(pairingCode).toBeTruthy();
  expect(pairingCode).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/);

  const secondarySession = await bootstrapSession(request, SECONDARY_TERMINAL_ID);
  await expectEnvelope(
    await request.post("/api/v1/terminals/pairing-code-claims", {
      headers: { authorization: `Bearer ${secondarySession.access_token}` },
      data: {
        pairing_code: pairingCode,
      },
    }),
  );

  await expect(page.locator(".control-shell")).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate((key) => window.localStorage.getItem(key), BOOTSTRAP_TOKEN_STORAGE_KEY),
    )
    .not.toBeNull();
  const activatedToken = await page.evaluate(
    (key) => window.localStorage.getItem(key),
    BOOTSTRAP_TOKEN_STORAGE_KEY,
  );
  expect(activatedToken).toBeTruthy();
  bootstrapTokens.set(TERMINAL_ID, activatedToken as string);
});

test(TERMINAL_ACTIVATION_ENTRY_TEST, async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "扫码激活" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "输入激活码" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "等待绑定码认领" })).toBeVisible();
  await expect(page.getByText("新装终端优先用扫码或绑定码认领")).toBeVisible();
});

test(TERMINAL_ACTIVATION_LANDING_TEST, async ({ page }) => {
  const token = issueBootstrapToken(TERMINAL_ID);

  await page.goto("/");
  await page.locator("#bootstrap-token").fill(token);
  await page.getByRole("button", { name: "激活终端" }).click();

  await expect(page.getByRole("heading", { name: "恢复激活完成" })).toBeVisible();
  await expect(page.getByText("即将进入")).toBeVisible();
  await expect(page.getByText("首页", { exact: true }).nth(1)).toBeVisible();

  await page.getByRole("button", { name: "进入首页" }).click();
  await expect(page.locator(".control-shell")).toBeVisible();
});
