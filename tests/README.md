# Visual smoke test

The game remains a standalone `index.html`. There is no production build step or new runtime dependency.

From the repository root, install Playwright and run:

```sh
npm install --no-save playwright
npx playwright install chromium
node tests/visual-smoke.cjs
```

For an existing Chromium installation, set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` to its executable. Set `QA_OUTPUT` to choose the screenshot and results directory (default: `/tmp/price-is-fright-qa`).

The test intercepts the HTML, clears the Firebase URL **only in the browser's test copy**, and uses the game's demo store. It blocks all external network requests, so it cannot create production rooms or change real player data.

Coverage includes:

- Mobile and desktop landing pages, locally embedded fonts, and the host spoiler warning.
- A live host, two players, and regular/reduced-motion shared screens.
- Joining, poll selection, guess submission, editing, synchronized reveals, late arrival, and host skips.
- All ten live rounds, the final podium, poll results, and encore entry.
- Persistent reduced-effects controls and draft preservation.
- Play-anytime entry, reveal, and advancement with reduced motion.
- 320px layout overflow and browser runtime errors.

Screenshots show demo rooms and sample players. This test does not validate the deployed Firebase service, cross-device networking, or audio output.
