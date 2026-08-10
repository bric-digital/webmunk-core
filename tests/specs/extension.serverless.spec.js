import { test, expect } from './fixtures.js';

/**
 * Serverless configuration, extension context.
 *
 * A rex-config:// configuration_url points at a file bundled in the extension.
 * The service worker already resolves it; identifier validation runs in the
 * extension context and must resolve it the same way instead of handing the
 * raw scheme to fetch() (TypeError: Failed to fetch).
 *
 * Like extension.scope.spec.js, this runs in the shared extension-context
 * profile: validateIdentifier stores the fetched configuration, so snapshot
 * and restore REXConfiguration or later specs inherit a clobbered config.
 */
test.describe('REX Core: Serverless Configuration', () => {
  test.setTimeout(60_000)

  test('Validate identifier verification resolves a rex-config:// configuration_url.', async ({ page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/index.html`);

    await expect(page).toHaveTitle(/REX Core Module Loading Test/);

    const result = await page.evaluate(async () => {
      const before = await chrome.storage.local.get(['REXConfiguration'])

      const restore = () => {
        return chrome.storage.local.set({ REXConfiguration: before.REXConfiguration })
      }

      const identifierModule = self.rexCorePlugin.fetchREXModule('REXCoreIdentifierExtensionModule')

      return identifierModule.validateIdentifier('serverless-user', 'rex-config://config.json')
        .then((identifier) => restore().then(() => identifier))
        .catch((error) => restore().then(() => `error: ${error}`))
    })

    expect(result).toBe('serverless-user')
  });
});
