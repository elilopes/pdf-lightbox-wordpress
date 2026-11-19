# PDF Smart Viewer

WordPress plugin that displays PDF documents in a responsive Lightbox with page navigation, thumbnails, text search, comments with moderation, private notes, bookmarks, history, and optional Google Drive integration.

## Requirements

- WordPress 6.0 or later.
- PHP 7.4 or later.
- Publicly accessible PDF URL. PDFs hosted on another domain must permit CORS for browser rendering and Google Drive upload.

## Integrations

- Shortcodes: `[pdf_viewer id="123"]`, `[pdf_viewer url="https://example.com/file.pdf"]`, and `[pdf_lightbox url="https://example.com/file.pdf"]`.
- Gutenberg block: **PDF Smart Viewer**.
- Elementor widget: **PDF Smart Viewer**.
- Custom HTML: `<pdf-smart-viewer src="https://example.com/file.pdf"></pdf-smart-viewer>`.
- DIV integration: `<div class="pdf-smart-viewer" data-pdf="https://example.com/file.pdf"></div>`.

See [readme.txt](readme.txt) for setup details, privacy information, and feature limitations.

## Architecture

- `pdf-smart-viewer.php`: plugin bootstrap, requirements checks, and guarded initialization.
- `includes/class-psv-core.php`: shortcodes, block registration, asset registration, and URL canonicalization.
- `includes/class-psv-rest.php`: public read endpoints and moderated comment submission.
- `includes/class-psv-admin.php`: settings, moderation, and WordPress personal-data exporter/eraser.
- `includes/class-psv-elementor.php`: Elementor widget integration.
- `assets/js/viewer.js`: Lightbox UI and PDF interactions.
- `assets/js/block.js`: Gutenberg editor controls.
- `assets/css/viewer.css`: frontend styling.
- `uninstall.php`: removes plugin options, temporary rate-limit records, and plugin comment table when the plugin is uninstalled.

## Privacy and external services

The plugin stores commenter names, email addresses, comment text, document URLs, page numbers, moderation state, and timestamps in the WordPress database. The email address is not displayed publicly. WordPress personal-data export and erasure tools are supported.

PDF.js is currently loaded from a version-pinned CDN and its worker is loaded from the same provider. This is a known WordPress.org directory-readiness issue: non-service JavaScript and CSS dependencies should be bundled locally with their license and attribution. The optional Google Identity Services and Google Drive API are loaded/used only when a visitor explicitly chooses the Drive action and the site administrator has configured a Client ID.

## Development and validation

The GitHub Actions workflow in `.github/workflows/quality.yml` runs PHP syntax checks across supported PHP versions and JavaScript syntax checks. These are static checks; they do not replace integration tests on a real WordPress installation.

Before release, test activation, deactivation, uninstall, multisite behavior, REST permissions, comment moderation, caching, CORS, accessibility, and PDF rendering on a staging WordPress site.

## License

GPL-2.0-or-later. See [LICENSE](LICENSE).
