import assert from 'node:assert/strict';
import { register } from 'node:module';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { I18nProvider } from '../../i18n/I18nProvider.js';

register(new URL('./PartnerComponentTestLoader.mjs', import.meta.url));
const { PartnerWorkspace } = await import('./PartnerWorkspace.js');

test('compact Partner keeps context and detail entries reachable', () => {
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      localStorage: {
        getItem: () => null,
        setItem: () => undefined,
      },
      matchMedia: (query: string) => ({
        matches: true,
        media: query,
        onchange: null,
        addListener: () => undefined,
        removeListener: () => undefined,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
        dispatchEvent: () => true,
      }),
    },
  });

  try {
    const html = renderToStaticMarkup(
      <I18nProvider>
        <PartnerWorkspace
          leftSidebarOpen
          rightSidebarOpen={false}
          onToggleLeftSidebar={() => undefined}
          onToggleRightSidebar={() => undefined}
          onOpenDetail={() => undefined}
        />
      </I18nProvider>,
    );

    assert.match(html, /data-testid="partner-context-toggle"/);
    assert.match(html, /lucide-ellipsis-vertical/);
    assert.match(html, /data-testid="partner-detail-toggle"/);
  } finally {
    if (previousWindow) Object.defineProperty(globalThis, 'window', previousWindow);
    else Reflect.deleteProperty(globalThis, 'window');
  }
});
