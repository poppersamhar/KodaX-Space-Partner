import assert from 'node:assert/strict';
import { test } from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { I18nProvider } from '../../i18n/I18nProvider.js';
import { PartnerBrowserPanel } from './PartnerBrowserPanel.js';

function renderPanel(element: JSX.Element): string {
  return renderToStaticMarkup(<I18nProvider>{element}</I18nProvider>);
}

test('renders a remote page in a constrained iframe with honest controls', () => {
  const html = renderPanel(<PartnerBrowserPanel initialUrl="https://example.com/docs" />);

  assert.match(html, /data-testid="partner-browser-panel"/);
  assert.match(html, /src="https:\/\/example\.com\/docs"/);
  assert.match(html, /name="kodax-partner-browser-[^"]+"/);
  assert.match(html, /sandbox="allow-forms allow-scripts"/);
  assert.doesNotMatch(html, /allow-same-origin/);
  assert.doesNotMatch(html, /allow-top-navigation/);
  assert.match(html, /X-Frame-Options/);
  assert.match(html, /CSP/);
  assert.match(html, /aria-label="Open in system browser"/);
  assert.match(html, /aria-label="Open address"/);
});

test('starts without an iframe or enabled navigation controls when no URL was submitted', () => {
  const html = renderPanel(<PartnerBrowserPanel />);

  assert.doesNotMatch(html, /<iframe/);
  assert.match(html, /aria-label="Back"[^>]*disabled/);
  assert.match(html, /aria-label="Forward"[^>]*disabled/);
  assert.match(html, /aria-label="Refresh"[^>]*disabled/);
});
