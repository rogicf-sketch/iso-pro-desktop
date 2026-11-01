import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const updateFeedSrc = fs.readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), '../../electron/main/updateFeed.ts'),
  'utf8',
);

describe('updateFeed (electron source)', () => {
  it('aponta feed de producao e permite override por env', () => {
    expect(updateFeedSrc).toContain('isoprogestaodemateriais.com.br/updates/iso-pro-desktop/');
    expect(updateFeedSrc).not.toMatch(/updates\.example\.com/);
    expect(updateFeedSrc).toContain('ISO_PRO_UPDATE_FEED_URL');
  });
});
