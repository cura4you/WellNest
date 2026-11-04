import test from 'node:test';
import assert from 'node:assert/strict';
import { createCitationFilter } from '../src/chatCitations.js';
const filter = (count, parts) => { const f = createCitationFilter(count); return parts.map((part) => f.push(part)).join('') + f.finish(); };
test('streamed citation tags retain valid numbers across token boundaries', () => {
  assert.equal(filter(2, ['Value (Do', 'c 2', ').']), 'Value (Doc 2).');
});
test('invented citation numbers are removed with zero or fewer sources', () => {
  assert.equal(filter(0, ['No records (Doc ', '1).']), 'No records .');
  assert.equal(filter(1, ['Value [Doc 2].']), 'Value .');
  assert.equal(filter(1, ['Value (Docs 1, 9).']), 'Value .');
});
test('ordinary parentheses and incomplete regular text survive', () => {
  assert.equal(filter(0, ['A dose (500 ', 'mg) and [a note].']), 'A dose (500 mg) and [a note].');
  assert.equal(filter(0, ['An unfinished (note']), 'An unfinished (note');
  assert.equal(filter(0, ['An invalid (Doc 12']), 'An invalid ');
});
