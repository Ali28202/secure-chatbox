# Final report — sources

The report itself is at the repository root: `گزارش نهایی.docx` and `گزارش نهایی.pdf`.
This folder holds everything needed to rebuild them.

## Layout

| Path             | What it is                                                         |
| ---------------- | ------------------------------------------------------------------ |
| `diagrams/`      | Ten Mermaid diagrams — `.mmd` source beside the rendered `.png`    |
| `screenshots/`   | Twelve captures of the running app, taken with Playwright          |
| `builder.py`     | Writes .docx on top of `قالب گزارش نهایی.docx`, reusing its styles |
| `part1..5.py`    | The report text, chapter by chapter                                |
| `make_report.py` | The three-pass build                                               |
| `to_pdf.py`      | Headless LibreOffice over UNO — refreshes the TOC, exports the PDF |

## Rebuilding

```bash
pip install python-docx
npm install @mermaid-js/mermaid-cli     # only if diagrams changed

# diagrams (optional)
mmdc -i diagrams/01-use-case.mmd -o diagrams/01-use-case.png \
     -p puppeteer.json -c mermaid.json -b white -s 2

# the report
python3 make_report.py
```

`make_report.py` expects the template at `../../قالب گزارش نهایی.docx` and writes
into a scratch `out/` directory; adjust `TEMPLATE` and `OUT` at the top if you
move things.

## Why three passes

The figure and table lists sit in the front matter, but their page numbers can
only be known after the chapters are laid out. So: one dry pass collects every
caption in order, a second pass lays the document out and is converted to PDF so
the page each caption landed on can be read back, and a third fills the numbers
in. The line count does not change between passes two and three, so the
pagination still holds.

## Two things the template does that needed working around

**Caption numbering resets.** `زيرنويس شکل` and `بالانويس جدول` sit at levels 5
and 7 of the same list as the chapter headings, so every `تيتر اول` resets them —
tables came out numbered 5-1, 5-2, 5-1, 5-1. Captions are therefore detached from
the list (`numId 0`) and numbered in `builder.py` instead, which also keeps the
body and the front-matter lists in agreement.

**The running header is a frame.** It holds a `STYLEREF فصل` field next to the
project title, and is sized for a short one — hence `HEADER_TITLE` in
`make_report.py` being shorter than the title on the cover.
