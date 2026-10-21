const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
const start = html.indexOf("    const CLOCK_SPEAK_TIMES =");
const end = html.indexOf("    console.log('[BOOT] start clock loop'", start);
assert(start >= 0 && end > start);
const clockSource = html.slice(start, end);

function makeClock(responses) {
  let time = Date.parse('2026-10-22T07:20:00+09:00');
  const values = new Map();
  const calls = [];
  class ClockDate extends Date {
    constructor(...args) { super(...(args.length ? args : [time])); }
    static now() { return time; }
  }
  const context = vm.createContext({
    Date: ClockDate,
    document: {getElementById: () => null},
    localStorage: {
      getItem: key => values.get(key) || null,
      setItem: (key, value) => values.set(key, String(value))
    },
    requestRadioItems: async reason => {
      calls.push(reason);
      const result = responses.shift();
      if (result instanceof Error) throw result;
      return result;
    },
    requestCastIfNeeded_: () => {},
    console: {log() {}, warn() {}}
  });
  vm.runInContext(clockSource, context);
  return {tick: () => context.tickClockVoice(), advance: ms => { time += ms; }, values, calls};
}

test('silent automatic failure retries without a premature played marker', async () => {
  const clock = makeClock([
    {requestOutcome: 'transport_failure', source: 'fixed fallback', startedItemCount: 0},
    {requestOutcome: 'private_success', source: 'private', startedItemCount: 7}
  ]);
  await clock.tick();
  assert.equal(clock.values.has('clockSpoke_2026-10-22_07:20'), false);
  await clock.tick();
  assert.equal(clock.calls.length, 1);
  clock.advance(16000);
  await clock.tick();
  assert.equal(clock.calls.length, 2);
  assert.equal(clock.values.get('clockSpoke_2026-10-22_07:20'), '1');
  clock.advance(16000);
  await clock.tick();
  assert.equal(clock.calls.length, 2);
});

test('any started audio prevents duplicate automatic playback', async () => {
  const clock = makeClock([{requestOutcome: 'transport_failure', source: 'fixed fallback', startedItemCount: 1}]);
  await clock.tick();
  clock.advance(16000);
  await clock.tick();
  assert.equal(clock.calls.length, 1);
  assert.equal(clock.values.get('clockSpoke_2026-10-22_07:20'), '1');
});

test('an exception before playback leaves the slot retryable', async () => {
  const clock = makeClock([new Error('network'), {requestOutcome: 'private_success', source: 'private', startedItemCount: 7}]);
  await clock.tick();
  assert.equal(clock.values.has('clockSpoke_2026-10-22_07:20'), false);
  clock.advance(16000);
  await clock.tick();
  assert.equal(clock.calls.length, 2);
  assert.equal(clock.values.get('clockSpoke_2026-10-22_07:20'), '1');
});
