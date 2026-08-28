import assert from 'node:assert/strict';
import { register } from 'node:module';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { I18nProvider } from '../../i18n/I18nProvider.js';

register(new URL('./PartnerComponentTestLoader.mjs', import.meta.url));
const { PartnerRightSidebar, handlePartnerDetailTabKeyDown } =
  await import('./PartnerRightSidebar.js');

test('Partner detail tabs own uniquely labelled tab panels', () => {
  const html = renderToStaticMarkup(
    <I18nProvider>
      <PartnerRightSidebar open openRequest={{ revision: 7, target: { kind: 'sources' } }} />
    </I18nProvider>,
  );
  const tabMarkup = html.match(/<button[^>]*role="tab"[^>]*>/)?.[0];

  assert.ok(tabMarkup);
  const tabId = tabMarkup.match(/\sid="([^"]+)"/)?.[1];
  const panelId = tabMarkup.match(/\saria-controls="([^"]+)"/)?.[1];
  assert.ok(tabId);
  assert.ok(panelId);
  assert.notEqual(tabId, panelId);
  assert.match(
    html,
    new RegExp(`<div[^>]*id="${panelId}"[^>]*role="tabpanel"[^>]*aria-labelledby="${tabId}"`),
  );
});

test('Partner detail tabs keep close controls out of the tab order and support Delete', () => {
  const html = renderToStaticMarkup(
    <I18nProvider>
      <PartnerRightSidebar open openRequest={{ revision: 7, target: { kind: 'sources' } }} />
    </I18nProvider>,
  );
  const closeButtonMarkup = html.match(/<button[^>]*aria-label="Close [^"]+"[^>]*>/)?.[0];

  assert.ok(closeButtonMarkup);
  assert.match(closeButtonMarkup, /tabindex="-1"/);

  let prevented = false;
  let propagationStopped = false;
  let closeCount = 0;
  const handled = handlePartnerDetailTabKeyDown(
    {
      key: 'Delete',
      preventDefault: () => {
        prevented = true;
      },
      stopPropagation: () => {
        propagationStopped = true;
      },
    },
    () => {
      closeCount += 1;
    },
  );

  assert.equal(handled, true);
  assert.equal(prevented, true);
  assert.equal(propagationStopped, true);
  assert.equal(closeCount, 1);
});
