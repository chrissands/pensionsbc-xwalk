import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CONFIG_KEYS } from '../../blocks/search/content-ai.js';

const file = JSON.parse(readFileSync(new URL('../../blocks/search/_search.json', import.meta.url), 'utf8'));
const definition = file.definitions[0];
const model = file.models.find((m) => m.id === 'search');

describe('search block model', () => {
  it('declares every config key plus the existing fields', () => {
    const names = model.fields.map((f) => f.name);
    CONFIG_KEYS.concat(['index', 'classes']).forEach((k) => assert.ok(names.includes(k), k));
  });

  it('uses the key-value template', () => {
    assert.equal(definition.plugins.xwalk.page.template['key-value'], true);
  });

  it('defaults the source type to ACQUISITION', () => {
    assert.equal(model.fields.find((f) => f.name === 'content-source-type').value, 'ACQUISITION');
  });
});
