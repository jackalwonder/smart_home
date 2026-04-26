import { expect, type APIRequestContext, type Page } from "@playwright/test";

export const DEFAULT_SMOKE_BASE_URL = "http://127.0.0.1:25173";
export const SMOKE_BOOTSTRAP_TOKEN_STORAGE_KEY = "smart_home.bootstrap_token";

export function formatSettingsVersion(value: string | null) {
  const match = value?.match(/(\d{8})(\d{6})/);
  if (!match) {
    return value || "-";
  }
  const [, date, time] = match;
  return `${Number(date.slice(4, 6))}月${Number(date.slice(6, 8))}日 ${time.slice(0, 2)}:${time.slice(2, 4)}`;
}

export async function waitForSmokeAppReady(request: APIRequestContext, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  let lastStatus = "not requested";

  while (Date.now() < deadline) {
    try {
      const response = await request.get("/");
      lastStatus = String(response.status());
      if (response.ok()) {
        return;
      }
    } catch (error) {
      lastStatus = error instanceof Error ? error.message : "request failed";
    }
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }

  throw new Error(`Smoke app did not become ready within ${timeoutMs}ms: ${lastStatus}`);
}

export async function installBootstrapToken(page: Page, token: string) {
  await page.addInitScript(
    ({ key, value }) => {
      window.localStorage.setItem(key, value);
    },
    { key: SMOKE_BOOTSTRAP_TOKEN_STORAGE_KEY, value: token },
  );
}

export async function openSettingsModuleDetails(page: Page, heading: string) {
  const module = page.locator("section.settings-task-module").filter({
    has: page.getByRole("heading", { name: heading }),
  });
  await expect(module).toBeVisible();
  const details = module.locator("details").first();
  if (!(await details.evaluate((element) => element.open))) {
    await details.locator("summary").click();
  }
}
