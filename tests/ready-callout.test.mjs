import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { test } from 'node:test';

const player = fs.readFileSync('releases/v1.3.13/renderer.mjs', 'utf8');
const start = player.indexOf('function selectReadyNotifications(');
const end = player.indexOf('async function pollReadyOrders(){', start);
assert.ok(start >= 0 && end > start, 'READY notification functions must exist in the player');
const readyFunctions = player.slice(start, end);
const program = `
(() => {
  let readyActiveIds = [];
  let readyCalloutTimer = null;
  const readyHeading = { textContent: '' };
  const readyOrderNumbers = { textContent: '' };
  const readyCallout = { classList: { add() {}, remove() {} } };
  function requestAnimationFrame(callback) { callback(); }
  function clearTimeout() {}
  let lastTimeoutMs = 0;
  function setTimeout(_callback, ms) { lastTimeoutMs = ms; return 1; }
${readyFunctions}
  return { selectReadyNotifications, showReadyCallout, readyHeading, readyOrderNumbers, getLastTimeoutMs: () => lastTimeoutMs };
})()
`;
const ready = vm.runInNewContext(program, { Set, Number, String });

test('first poll establishes a baseline without replaying historical orders', () => {
  const records = [{ id: 262, number: 96, prepared_at: 'older than a minute' }];
  assert.equal(ready.selectReadyNotifications(records, new Set(), false).length, 0);
});

test('new paid READY orders are announced even when delivery was delayed', () => {
  const records = [{ id: 262, number: 96, prepared_at: 'no clock dependency' }];
  const fresh = ready.selectReadyNotifications(records, new Set(['261']), true);
  assert.equal(fresh.length, 1);
  assert.equal(fresh[0].id, 262);
  assert.equal(ready.selectReadyNotifications(records, new Set(['262']), true).length, 0);
});

test('callout uses customer receipt number, not internal order database id', () => {
  ready.showReadyCallout([{ id: 262, number: 96 }]);
  assert.equal(ready.readyOrderNumbers.textContent, '#096');
  assert.equal(ready.readyHeading.textContent, 'YOUR ORDER IS READY!');
  assert.equal(ready.getLastTimeoutMs(), 60000);
});

test('multiple READY orders show their daily numbers without repeats', () => {
  ready.showReadyCallout([{ id: 263, number: 97 }, { id: 264, number: 98 }]);
  assert.equal(ready.readyOrderNumbers.textContent, '#096  ·  #097  ·  #098');
  assert.equal(ready.readyHeading.textContent, 'YOUR ORDERS ARE READY!');
});


test('Owner diagnostic READY event is visibly labeled TEST for 60 seconds', () => {
  ready.showReadyCallout([{ id: 2 ** 51 + 123, number: 999, test: true }]);
  assert.equal(ready.readyHeading.textContent, 'TEST · ORDER READY');
  assert.match(ready.readyOrderNumbers.textContent, /#999/);
  assert.equal(ready.getLastTimeoutMs(), 60000);
});
