import assert from 'node:assert/strict';
import test from 'node:test';
import { register } from 'node:module';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

test('Partner composer omits preset shortcuts while keeping delivery format and the existing Skill entry', async () => {
  // Node has no Vite asset loader; image imports keep their public URL in this render test.
  register(
    `data:text/javascript,${encodeURIComponent(`
    export async function load(url, context, nextLoad) {
      if (/\\.(png|svg|webp)$/.test(new URL(url).pathname)) return {
        format: 'module', shortCircuit: true, source: 'export default ' + JSON.stringify(url)
      };
      const result = await nextLoad(url, context);
      if (result.format === 'module' && result.source && url.includes('/renderer/')) return {
        ...result,
        source: 'import.meta.glob ??= () => ({}); import.meta.env ??= {};\\n' + result.source.toString()
      };
      return result;
    }
  `)}`,
    import.meta.url,
  );
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const previousStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const storage = new Map([['kodax-space.currentSurface', 'partner']]);
  const localStorage = {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
  };
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: localStorage });
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      localStorage,
    },
  });
  try {
    const { BottomBar } = await import('./BottomBar.js');
    const { I18nProvider } = await import('../i18n/I18nProvider.js');
    const html = renderToStaticMarkup(createElement(I18nProvider, null, createElement(BottomBar)));
    assert.doesNotMatch(html, /data-testid="partner-scene-shortcuts"/);
    assert.match(html, /data-testid="partner-skill-picker"/);
    assert.match(html, /value="docx"/);
    assert.match(html, /value="pdf"/);
    assert.match(html, /value="pptx"/);
  } finally {
    if (previousWindow) Object.defineProperty(globalThis, 'window', previousWindow);
    else Reflect.deleteProperty(globalThis, 'window');
    if (previousStorage) Object.defineProperty(globalThis, 'localStorage', previousStorage);
    else Reflect.deleteProperty(globalThis, 'localStorage');
  }
});
