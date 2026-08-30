import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { I18nProvider } from '../../i18n/I18nProvider.js';
import { PartnerContextRail } from './PartnerContextRail.js';

test('renders a divider-free 300px rail with three independent context cards', () => {
  const html = renderToStaticMarkup(
    <I18nProvider>
      <PartnerContextRail onOpenDetail={() => undefined} onAddMaterial={() => undefined} />
    </I18nProvider>,
  );

  assert.match(html, /data-testid="partner-context-rail"/);
  assert.match(html, /(?:class="[^"]*\b|\s)w-\[300px\](?:\s|[^"]*")/);
  const railClass = html.match(
    /<aside class="([^"]*)"[^>]*data-testid="partner-context-rail"/,
  )?.[1];
  assert.ok(railClass);
  assert.doesNotMatch(railClass, /(?:^|\s)border-l(?:\s|$)/);
  assert.match(html, /(?:class="[^"]*\b|\s)gap-3(?:\s|[^"]*")/);

  const sourcesCardIndex = html.indexOf('data-testid="partner-context-sources-card"');
  const pendingReviewCardIndex = html.indexOf('data-testid="partner-context-pending-review-card"');
  const resultsCardIndex = html.indexOf('data-testid="partner-context-results-card"');
  assert.ok(sourcesCardIndex >= 0);
  assert.ok(pendingReviewCardIndex > sourcesCardIndex);
  assert.ok(resultsCardIndex > pendingReviewCardIndex);

  assert.doesNotMatch(html, /aria-label="Refresh"/);
  assert.doesNotMatch(html, /doc-workspace · knowledge work/);
  assert.match(html, /data-testid="partner-context-sources"/);
  assert.match(html, /data-testid="partner-context-results"/);
  assert.match(html, /data-testid="partner-context-pending-review"/);
  assert.match(html, /data-testid="partner-context-add-material"/);
  assert.doesNotMatch(html, /data-testid="partner-sources-panel"/);
  assert.doesNotMatch(html, /data-testid="partner-artifact-panel"/);
  assert.doesNotMatch(html, /data-testid="partner-file-proposals-panel"/);
});
