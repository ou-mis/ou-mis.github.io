"""Convert the MIS TA offer letter (highlighted placeholders) into a docxtemplater template.

Usage:
    python tools/make_tagged_template.py "<source offer letter.docx>" templates/offer-letter-template.docx

Each placeholder below is located by its surrounding text, which may be split across
many Word runs; the matched text is rewritten into a single {tag} and highlights are removed.
"""
import re
import sys
import zipfile

REPLACEMENTS = [
    ("7/13/2026", "{letter_date}"),
    ("TA NAME", "{ta_name}"),
    ("Your biweekly rate is $0", "Your biweekly rate is {biweekly_rate}"),
    ("for Fall 2026 will be $0.", "for {term} will be {total_stipend}."),
    ("start on 08/17/2026", "start on {start_date}"),
    ("end on 12/18/2026", "end on {end_date}"),
    ("exceed 0 hours per week", "exceed {hours_per_week} hours per week"),
    ("offer by 5/7/2026", "offer by {accept_by_date}"),
]

T_RE = re.compile(r"(<w:t(?: [^>]*)?>)(.*?)(</w:t>)", re.S)


def replace_in_paragraph(par, target, replacement):
    ts = list(T_RE.finditer(par))
    texts = [m.group(2) for m in ts]
    full = "".join(texts)
    idx = full.find(target)
    if idx < 0:
        return par, False
    end = idx + len(target)
    new_texts = list(texts)
    pos = 0
    first = None
    for i, t in enumerate(texts):
        s, e = pos, pos + len(t)
        pos = e
        if e <= idx or s >= end:
            continue
        keep_prefix = t[: max(0, idx - s)]
        keep_suffix = t[max(0, end - s):] if end < e else ""
        if first is None:
            first = i
            new_texts[i] = keep_prefix + replacement + keep_suffix
        else:
            new_texts[i] = keep_suffix
    out = []
    last = 0
    for i, m in enumerate(ts):
        out.append(par[last:m.start()])
        open_tag = m.group(1)
        if i == first and "xml:space" not in open_tag:
            open_tag = '<w:t xml:space="preserve">'
        out.append(open_tag + new_texts[i] + m.group(3))
        last = m.end()
    out.append(par[last:])
    return "".join(out), True


def tag_document(xml):
    paragraphs = re.split(r"(<w:p[ >].*?</w:p>)", xml, flags=re.S)
    for target, replacement in REPLACEMENTS:
        done = False
        for i, chunk in enumerate(paragraphs):
            if not chunk.startswith("<w:p"):
                continue
            new, ok = replace_in_paragraph(chunk, target, replacement)
            if ok:
                paragraphs[i] = new
                done = True
                break
        if not done:
            raise SystemExit(f"Placeholder text not found: {target!r}")
    xml = "".join(paragraphs)
    return re.sub(r"<w:highlight [^>]*/>", "", xml)


def main(src, dst):
    with zipfile.ZipFile(src) as zin, zipfile.ZipFile(dst, "w", zipfile.ZIP_DEFLATED) as zout:
        for item in zin.infolist():
            data = zin.read(item.filename)
            if item.filename == "word/document.xml":
                data = tag_document(data.decode("utf-8")).encode("utf-8")
            zout.writestr(item, data)
    print(f"Wrote {dst}")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        raise SystemExit(__doc__)
    main(sys.argv[1], sys.argv[2])
