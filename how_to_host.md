# How to host Arcade Room

Arcade Room is a collection of browser games. The repository already contains a launcher at `index.html`; when the collection is prepared for hosting, the launcher is populated with links to the game folders and opens each game in its own directory.

## Requirements

- A web server or static-hosting service
- The complete collection, including `index.html` and every game folder
- A modern browser with JavaScript and Web Audio support

The Electron files and `node_modules` are only needed for the desktop application. They are not required for web hosting.

## Important: use the generated web files

The launcher contains a static game list so it can be served directly by GitHub Pages or any ordinary web server. A normal web server does not scan folders to discover games; when adding or removing a game, update the list in `index.html`.

Before uploading, create a static web directory containing:

```text
index.html                 # launcher
asteroids/
  index.html
  ...game assets...
berzerker/
  index.html
  ...game assets...
...
```

The launcher contains a JSON array of game directory names in the `games-data` element. Keep the list limited to published game folders; exclude `electron`, `node_modules`, and build-only folders.

A typical value looks like this:

```html
<script type="application/json" id="games-data">
["air_hockey", "asteroids", "berzerker", "pong"]
</script>
```

Keep the names exactly as they appear in the published folders. The launcher links to each game as `<game-folder>/`, so each folder needs its own `index.html` (or an equivalent server fallback).

## Host on an ordinary web server

1. Build or prepare the web-ready directory described above.
2. Copy its contents to the server's public/document root, such as `public_html`, `www`, or `/var/www/html`.
3. Make sure the server serves `index.html` for the site root.
4. Make sure static assets are served with their normal MIME types. In particular, JavaScript, CSS, audio, and font files must not be blocked.
5. Open the site URL in a browser and select a game from the launcher.

For a local smoke test, serve the prepared directory with any static file server rather than opening `index.html` directly with `file://`. Browser security rules can prevent modules, audio assets, or other resources from working correctly when loaded from a file URL.

### Apache or Nginx notes

- Upload the launcher and game directories beneath the configured document root.
- Preserve directory names and capitalization; URLs can be case-sensitive.
- If a game uses client-side routes, configure the server to fall back to that game's `index.html`. For the usual folder-based links in this collection, ordinary static file serving is sufficient.
- Use HTTPS when possible. Browsers commonly require a secure context for some web APIs, and HTTPS avoids mixed-content failures.

## Host on GitHub Pages

GitHub Pages is suitable because the collection is static.

### Option A: deploy from a branch

1. Push the repository to GitHub.
2. Ensure the web-ready launcher and all game folders are present in the branch that Pages will publish.
3. In the repository, open **Settings → Pages**.
4. Under **Build and deployment**, choose **Deploy from a branch**.
5. Select the branch and its `/ (root)` folder, then save.
6. Wait for the Pages deployment to finish and open the URL shown in the Pages settings.

### Option B: deploy from a Pages workflow

If the repository uses a GitHub Actions workflow, configure it to upload the prepared static directory as the Pages artifact and deploy that artifact. The artifact must have `index.html` at its root, with the game directories beside it—not nested one level too deeply.

### Project-site paths

For a project site, the address normally looks like:

```text
https://YOUR-ACCOUNT.github.io/YOUR-REPOSITORY/
```

The launcher uses links relative to the current site (`pong/`), so it works both for project sites and account sites. After deployment, test the launcher from the exact Pages URL and confirm that every game opens.

## Audio and browser permissions

Most games use Web Audio. Browsers generally require a user gesture before audio can start. The launcher's game links provide that gesture, but a game may still need the player to press a key or button before starting audio.

When testing:

- Use a current browser.
- Allow audio if the browser asks.
- Check the browser console if a game loads without sound.
- Verify that all referenced audio files were uploaded and that their filename capitalization matches the code.

## Updating the collection

Whenever you add or remove a game:

1. Add or remove its complete game directory.
2. Regenerate or update the launcher game list.
3. Test the link from the hosted launcher.
4. Redeploy or push the updated static files.

A successful deployment has the launcher at the site root and a working `index.html` inside every listed game directory.
