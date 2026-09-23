# Release guide

This document is intentionally kept general for public repositories. It covers the release checks and review steps without exposing internal identifiers, account details, or distribution workflows.

## Prepare and test

1. Use a supported Node.js version and run `npm ci` from the repository root.
2. Update the extension version in the root `manifest.json` before preparing the release build.
3. Run `npm run package` to run the regression checks and generate both ZIPs directly in `artifacts/`. Names use `chrome--` and `firefox--` prefixes so both can be attached to the same GitHub release.
4. Test the generated extension builds in a browser before publishing or sharing them.
5. Record the release version, tested browser versions, and any notable validation results in your release notes.

## Local installation

- Chrome and Chromium-based browsers: enable Developer mode in the extension manager, then load the unpacked build from the generated output directory.
- Firefox: load the generated extension from the Firefox debugging flow, then reload it after each rebuild.

This is only for validation; the final distribution should use the platform's normal publishing flow.

## Browser acceptance checks

Test the main Komoot routes and editing flows in both browsers with a logged-in session:

- Route planning pages and coordinate-based planning URLs.
- Tour pages and editing views.
- Extension settings access from the toolbar and page UI.
- Colour and map styling controls, including preview and reset behaviour.
- Sidebar or panel state changes, including reload persistence.
- Layer or map-style settings that should persist between refreshes.
- A quick check that unrelated Komoot pages remain unaffected and no route is modified unexpectedly.

## Privacy and permissions review

Before publication, confirm that the extension still matches its documented scope and permissions.

- No analytics or third-party data collection should be added without review.
- No user route or personal activity data should be uploaded outside the browser session.
- Preferences should be stored only as needed for extension behaviour.
- If the extension reads page or UI state to apply map styling, document that clearly in store listings and privacy disclosures.

Reassess this whenever functionality changes.

## Store and distribution

Follow the platform-specific publishing instructions for the browser stores that are used for distribution.

- Complete the listing, screenshots, permissions, and privacy disclosures required by the store.
- Validate the final packaged build before submitting it for review.
- Use the store's normal process for updates rather than creating a new extension identity.

For Firefox, follow the official signing and distribution guidance for the target release channel. For Chrome, use the normal Web Store publishing flow.

## Release checklist

- Version updated.
- Regression tests run successfully.
- Browser validation completed.
- Privacy and permissions reviewed.
- Store listing and disclosures checked.
- Final build tested and submitted for publication.
