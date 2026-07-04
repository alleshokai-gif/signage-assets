# 07:40 Weekstart Alert Investigation

## Summary

The 07:40 weekstart alert path exists on both sides:

- Frontend: `07:40` is included in `CLOCK_SPEAK_TIMES`.
- Frontend: `07:40` maps to `clock_0740`.
- Frontend: `clock_0740` is passed to `requestRadioItems(reason)`.
- GAS: `clock_0740` maps to the `weekstart` slot.
- GAS: `weekstart` can return `{ type:'wav', key:'SCHOOL_GEAR_WEEKSTART' }`.
- Audio asset: `assets/voice/SCHOOL_GEAR_WEEKSTART.wav` exists.

The most likely root cause is not a missing frontend timer or missing WAV file. The likely failure point is the GAS-side `isWeekFirstNormalSchoolDay_(now)` condition returning `false`, causing the API to return `ok:true` with `items: []`. A secondary issue is that the frontend marks the 07:40 slot as fired in `localStorage` before confirming that the API returned playable items, so an empty or failed 07:40 response is not retried that day.

## Frontend Findings

Relevant file:

```text
C:\Users\alles\signage-assets\index.html
```

Findings:

- `CLOCK_SPEAK_TIMES` includes `07:40`.
- `reasonByHm_('07:40')` returns `clock_0740`.
- `tickClockVoice()` runs every 5 seconds via `setInterval(tickClockVoice, 5 * 1000)`.
- `tickClockVoice()` compares the current local `HH:MM` string against `CLOCK_SPEAK_TIMES`.
- If the current minute is `07:40`, the frontend calls `requestRadioItems('clock_0740')`.
- There is no frontend-side weekend, holiday, or school-day skip condition for `07:40`.
- The trigger only runs while the signage page is open and JavaScript is active in the browser.
- The per-minute guard `__lastHM` prevents repeated checks within the same minute.
- The daily guard `localStorage` key `clockSpoke_YYYY-MM-DD_07:40` prevents another 07:40 attempt on the same day.
- `CLOCK_LAST_FIRE_MS` applies a 45 second cooldown across all clock triggers.

Important behavior:

```text
localStorage is written before requestRadioItems(reason) is called.
```

That means an unauthorized response, network failure, empty `items[]`, or GAS condition miss still consumes the one daily 07:40 attempt.

## GAS Findings

Relevant files:

```text
C:\Users\alles\gas-projects\signage-main-api\Code.js
C:\Users\alles\gas-projects\signage-main-api\TTS.js
C:\Users\alles\gas-projects\signage-main-api\README.md
```

Findings:

- `doGet(e)` reads `reason`, `text`, `speaker`, and `token`.
- The API rejects requests unless `token` matches script property `SIGNAGE_API_TOKEN`.
- For Radio Items, `doGet()` calls `getRadioItemsForNow(reason)`.
- `slotFromReason_()` maps `clock_0740` to `weekstart`.
- `getRadioItemsForNow()` has a `slot === 'weekstart'` branch.
- The `weekstart` branch creates an empty `items` array.
- It only pushes `SCHOOL_GEAR_WEEKSTART` when `isWeekFirstNormalSchoolDay_(now)` returns true.
- The `weekstart` branch returns directly and does not use `pack_()`.
- If the condition is false, the response is still `ok:true`, but `items` is empty.

The expected success response shape is:

```json
{
  "ok": true,
  "type": "radio",
  "reason": "clock_0740",
  "slot": "weekstart",
  "items": [
    { "type": "wav", "key": "SCHOOL_GEAR_WEEKSTART" }
  ]
}
```

The likely current miss response is:

```json
{
  "ok": true,
  "type": "radio",
  "reason": "clock_0740",
  "slot": "weekstart",
  "items": []
}
```

## Reason Mapping

The frontend and GAS reason names are aligned.

```text
frontend 07:40
  -> reasonByHm_()
  -> clock_0740
  -> requestRadioItems('clock_0740')

GAS clock_0740
  -> slotFromReason_()
  -> weekstart
  -> getRadioItemsForNow()
  -> SCHOOL_GEAR_WEEKSTART when condition passes
```

No direct reason-name mismatch was found.

Potential operational issue:

- `signage-assets/index.html` currently has `SIGNAGE_API_TOKEN_PLACEHOLDER` as the frontend token value.
- `signage-main-api` requires the request token to exactly match script property `SIGNAGE_API_TOKEN`.
- If production is really serving the placeholder token and the GAS script property is not also that same placeholder, every Radio Items request returns `unauthorized`.
- If other Radio slots are working in production, token mismatch is not the specific cause of the 07:40-only issue.

## Weekstart Condition Findings

The weekstart condition is implemented as:

```text
today row exists and today is_school_day == '1'
AND
yesterday row is missing or yesterday is_school_day != '1'
```

This means:

- It checks "today", not "tomorrow".
- It is not Monday-fixed.
- It can support Tuesday-start weeks if Monday is not a school day and Tuesday is a school day.
- It depends entirely on `Signage_HUB.is_school_day`.
- It does not inspect `Calendar_Dim` directly.
- It does not distinguish "normal school day" beyond `is_school_day === '1'`.
- It does not use the existing `getPrevSchoolDateByHub_(d)` helper.

Important edge cases:

- If `is_school_day` is boolean `TRUE`, string `"TRUE"`, Japanese text, blank, or any value other than exactly `1` after `String(value)`, the day is treated as not a school day.
- If the `Signage_HUB` row for today has not been generated by 07:40, the condition returns false.
- If the previous calendar day's row is incorrectly marked as `1`, the condition returns false.
- If the date cell cannot normalize to local `YYYY-MM-DD`, the row is treated as missing.
- Because the Apps Script timezone is `Etc/GMT-9`, it is aligned with Japan Standard Time, so timezone is not the primary suspected issue.

## Audio Asset Findings

Expected GAS key:

```text
SCHOOL_GEAR_WEEKSTART
```

Expected frontend URL:

```text
https://alleshokai-gif.github.io/signage-assets/assets/voice/SCHOOL_GEAR_WEEKSTART.wav
```

Local asset exists:

```text
C:\Users\alles\signage-assets\assets\voice\SCHOOL_GEAR_WEEKSTART.wav
```

Findings:

- Key name and file stem match.
- Extension is `.wav`.
- Case matches the GAS key.
- The path is under GitHub Pages public assets.

Audio asset mismatch is unlikely to be the root cause.

## Likely Root Cause

Primary likely cause:

```text
isWeekFirstNormalSchoolDay_(now) is returning false at 07:40, so GAS returns an empty items[] for weekstart.
```

Most likely reasons for that false result:

- `Signage_HUB.is_school_day` is not exactly `1` for the target day.
- The today's `Signage_HUB` row is not present yet at 07:40.
- The date normalization does not match the target local date.
- The previous day row is incorrectly marked as a school day.
- The intended source of truth is `Calendar_Dim`, but the code only checks `Signage_HUB`.

Secondary contributing cause:

```text
The frontend records 07:40 as fired before it knows whether the API returned any playable items.
```

So one empty `items[]` response suppresses any same-day retry.

## Recommended Fix

No implementation was made in this investigation. Recommended changes:

- Add debug fields to the `weekstart` response, matching the information normally provided by `pack_()`.
- Log `reason`, `slot`, today key, today `is_school_day`, yesterday key, yesterday `is_school_day`, and final decision.
- Consider returning a non-empty diagnostic response or explicit `skipReason` when `weekstart` conditions fail.
- Normalize school-day truth values in one helper, for example accepting `1`, numeric `1`, `true`, and `"TRUE"` if those are valid in the sheet.
- Confirm whether `Signage_HUB` or `Calendar_Dim` is the intended source of truth for weekstart.
- If `Calendar_Dim` is authoritative, update the weekstart condition to use that data or ensure Hub is generated before 07:40.
- Move the frontend daily-fired `localStorage` write until after successful playable `items[]` are returned, or keep a separate "attempted" and "played" state.
- Add a manual debug route such as `reason=clock_0740&debugDate=YYYY-MM-DD` for deterministic verification.

Suggested log fields:

```js
console.log('[weekstart]', {
  reason,
  slot,
  today: toYmd_(today),
  today_is_school_day: todayRow && todayRow.is_school_day,
  yesterday: toYmd_(y),
  yesterday_is_school_day: yRow && yRow.is_school_day,
  result: isWeekFirstNormalSchoolDay_(now),
  items
});
```

## Verification Plan

1. Check production `Signage_HUB` rows for a known weekstart date.
2. Confirm the `date` value normalizes to `YYYY-MM-DD`.
3. Confirm today's `is_school_day` value is exactly `1` or update normalization.
4. Confirm yesterday's `is_school_day` is not `1`.
5. Call the GAS endpoint manually with `reason=clock_0740` and the production token.
6. Confirm the response contains `slot: "weekstart"` and `SCHOOL_GEAR_WEEKSTART`.
7. In the browser console, verify `requestRadioItems('clock_0740')` logs non-empty `RADIO ITEMS`.
8. Clear the `clockSpoke_YYYY-MM-DD_07:40` localStorage key before re-testing the same day.
9. Verify GitHub Pages can serve `assets/voice/SCHOOL_GEAR_WEEKSTART.wav`.

