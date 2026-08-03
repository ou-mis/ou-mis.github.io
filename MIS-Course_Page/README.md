# MIS Course Catalog — OU Price College

A static, GitHub Pages–ready course catalog for the University of Oklahoma Michael F. Price College of Business, Management Information Systems.

## Features

- JSON-driven course list (code, title, instructor lead, semesters, prerequisites, syllabus file)
- Jump-to-course dropdown (pick any course without typing)
- Fast search with autocomplete suggestions
- Semester filter: All / Fall / Spring / Summer
- Syllabus **in-browser PDF viewer** plus **download**
- Canvas-friendly embed mode (`?embed=1`)
- Compact crimson masthead + responsive course tile grid (2–4 per row)
- OU crimson / Price College visual branding

## Project structure

```
MIS-Course_Page/
  index.html
  css/styles.css
  js/app.js
  data/courses.json      ← edit this when courses change
  syllabi/               ← drop PDF files here
  assets/ou-mark.svg
  README.md
```

## Updating courses

Edit [`data/courses.json`](data/courses.json). Example entry:

```json
{
  "code": "MIS 3013",
  "title": "Introduction to Programming",
  "instructor": "Adam Ackerman",
  "semesters": ["Fall", "Spring"],
  "syllabus": "mis-3013.pdf",
  "prerequisites": ["MIS 2113"],
  "learningOutcomes": [
    "Apply fundamental programming syntax and constructs"
  ]
}
```

- `semesters`: any of `Fall`, `Spring`, `Summer`
- `syllabus`: filename only; file must live in `syllabi/`
- `prerequisites`: array of course codes, or `[]` for none
- `learningOutcomes`: array of PLO strings (collapsible on each tile); use `[]` if none yet

Replace placeholder PDFs in `syllabi/` with official syllabi using the same filenames (see [`syllabi/README.md`](syllabi/README.md)).

## Local preview

Because the app fetches JSON, serve the folder over HTTP (opening `index.html` via `file://` may block fetch):

```bash
# from MIS-Course_Page
npx --yes serve .
```

Or with Python:

```bash
python -m http.server 8080
```

Then open `http://localhost:8080` (or the port shown by `serve`).

## GitHub Pages

1. Create a GitHub repository and push the contents of `MIS-Course_Page` to the repo root (or keep this folder as the root of the repo).
2. **Settings → Pages → Build and deployment**
3. Source: **Deploy from a branch**
4. Branch: `main` (or `master`), folder: `/ (root)`
5. Save, then visit `https://<username>.github.io/<repo>/`

All asset paths are relative, so the site works from a project Pages URL.

## Canvas LMS embed

In a Canvas Page or Module HTML block:

```html
<iframe
  src="https://YOUR_USER.github.io/YOUR_REPO/?embed=1"
  title="OU Price MIS Course Catalog"
  width="100%"
  height="800"
  style="border:0;border-radius:4px;"
  loading="lazy"
  allow="fullscreen"
></iframe>
```

`?embed=1` (or embedding in an iframe) uses a compact header optimized for Canvas. Students can still open and download syllabi from the catalog.

## Syllabus viewing

- **View syllabus** opens an on-page modal with the PDF embedded in the browser.
- **Download** / **Download PDF** saves the file locally.
- **Open in new tab** uses the browser’s native PDF viewer.
