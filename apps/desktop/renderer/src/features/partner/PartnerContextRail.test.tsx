import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { I18nProvider } from '../../i18n/I18nProvider.js';
import { PartnerContextRail } from './PartnerContextRail.js';

test('renders a 300px compact rail with three accessible detail entries', () => {
  const html = renderToStaticMarkup(
    <I18nProvider>
      <PartnerContextRail onOpenDetail={() => undefined} onAddMaterial={() => undefined} />
    </I18nProvider>,
  );

  assert.match(html, /data-testid="partner-context-rail"/);
  assert.match(html, /(?:class="[^"]*\b|\s)w-\[300px\](?:\s|[^"]*")/);
  assert.match(html, /data-testid="partner-context-sources"/);
  assert.match(html, /data-testid="partner-context-results"/);
  assert.match(html, /data-testid="partner-context-pending-review"/);
  assert.match(html, /data-testid="partner-context-add-material"/);
  assert.doesNotMatch(html, /data-testid="partner-sources-panel"/);
  assert.doesNotMatch(html, /data-testid="partner-artifact-panel"/);
  assert.doesNotMatch(html, /data-testid="partner-file-proposals-panel"/);
});
