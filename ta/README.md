# MIS TA Assignment Tool

A browser-only tool for matching TA applicants to course sections, tracking each TA's load and schedule conflicts, and producing the semester appointment workbook (UGTA sheet) and offer letters.

Nothing is uploaded anywhere. Files you choose are read by your browser, and work is saved in the browser (localStorage) and in a JSON file you download.

## Run it

**Locally:** from this folder run

```
python -m http.server 8000
```

then open <http://localhost:8000>. You can also double-click `index.html`, but then the browser cannot read the bundled templates, so you have to choose the workbook and letter templates yourself on the Export tab.

**GitHub Pages:** push this folder to a repository and enable Pages (Settings → Pages → Deploy from branch, root). Only the app code is published. `.gitignore` blocks `*.csv`, `*.json`, and generated letters and workbooks so student data is never committed.

## Workflow

1. **Setup:** term, letter dates, pay (default 5 hrs/week per section, hourly rate, pay periods), max sections per TA, and per-course hour overrides for courses that differ from the default.
2. **Import:**
   - The survey: Canvas quiz → Student Analysis → CSV. Questions are found by their wording, so the semester-specific question IDs don't matter. When a student submitted more than once, only the latest attempt is kept.
   - The class schedule: the default OU schedule export (for example `Spring_Class_Schedule.csv`) can be uploaded as-is. Follow-up rows that start with `...` are extra meetings for the section above them (such as the online part of a blended course), and they are merged into that section. The minimum columns are in `samples/schedule-template.csv`.
3. **Assign:** pick a section. Candidates are ranked by availability, interest, whether they took the course, GPA, and major. Assigning someone whose sections overlap in time, who is at the max-sections limit, or who is outside their stated availability asks for confirmation, and the assignment is flagged as an override.
4. **TAs:** per-TA totals (sections, hours, biweekly, total stipend), per-assignment hour overrides and notes, and the workbook fields the survey doesn't collect (email, employee status, previously worked on campus, residence).
5. **Export:**
   - The appointment workbook, with one UGTA row per TA per section.
   - A zip of offer letters, one `.docx` per TA with hours and stipend summed.
   - An assignments CSV.
   - **Save state (.json):** reload this file later to keep editing.

## Pay formula

- Biweekly rate = hours per week × 2 × hourly rate
- Total stipend = biweekly rate × pay periods
- FTE = hours ÷ 40, unless you set an FTE override in Setup

## Templates

- `templates/appointment-template.xlsx` is a copy of the Spring 2027 appointment template. Only the `UGTA` sheet is filled.
- `templates/offer-letter-template.docx` is the MIS TA offer letter with its highlighted placeholders replaced by tags: `{letter_date}`, `{ta_name}`, `{biweekly_rate}`, `{term}`, `{total_stipend}`, `{start_date}`, `{end_date}`, `{hours_per_week}`, `{accept_by_date}`. To regenerate it from a new version of the letter (same highlighted wording), run:

```
python tools/make_tagged_template.py "MIS TA Offer Letter Template.docx" templates/offer-letter-template.docx
```

You can also edit a copy in Word to type the tags in yourself, then upload it on the Export tab.
