# One finding in findings.json (bug-hunt)

The shape `npm run bug-hunt:score` reads; the same fields the walk with no AI
writes, plus `steps`, `expected` and `actual`, which only you can fill. Every
label must be one `framework/helpers/bugHunt/honesty.json` defines, or the
scorer refuses the file.

```json
{
  "fingerprint": "local|POST /api/bank/settings|emoji-name-500",
  "title": "Saving a display name with an emoji answers 500",
  "kind": "server-error",
  "classification": "bug",
  "confidence": "high",
  "severity": "major",
  "area": "settings",
  "target": "local",
  "page": "/app/settings",
  "action": "save the name 'Ada 🎉'",
  "pages": ["/app/settings"],
  "passes": ["customer, practice on", "customer, practice off"],
  "endpoint": "POST /api/bank/settings",
  "status": 500,
  "requestId": "6f1c2a9e-...",
  "reproduced": true,
  "screenshot": "screenshots/settings-emoji-500.png",
  "steps": [
    "Sign up a fresh customer and open /app/settings.",
    "Type 'Ada 🎉' as the display name and press Save."
  ],
  "expected": "The name is saved, or refused with a 400 that says why.",
  "actual": "POST /api/bank/settings answered 500 and the name did not change."
}
```

(The example is made up, to show the shape.)

## The fields

- **fingerprint:** `local|<page, or METHOD endpoint, ids as :id>|<symptom
slug>`. The same problem on many pages is one finding.
- **kind:** a short name for what went wrong: `server-error`, `wrong-answer`,
  `access`, `stale-state`, `limit`, `leak`, `date-range`...
- **classification, confidence, severity:** from `honesty.json`. `high` only
  with `reproduced: true`.
- **page, pages, action:** where you first saw it, every page that shows it,
  and what you did.
- **passes:** `"customer, practice on"` always for what you found with
  practice mode on; add `"customer, practice off"` when it still happens with
  it off (then it is new). Staff findings: `"admin, looking only"` or
  `"support, looking only"`; signed out: `"signed out"`.
- **endpoint:** the request behind it, as `METHOD /path` with ids as `:id`.
  The score counts a planted fault as found only by endpoint.
- **requestId, status, screenshot:** evidence. No keys, tokens or passwords
  anywhere.
- **steps, expected, actual:** for a person who was not there.
