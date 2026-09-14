# -*- coding: utf-8 -*-
"""Builds the report.

Three passes, because the figure and table lists sit in the front matter but
can only be known once the chapters have been laid out:

  1. a dry pass that collects every caption in order;
  2. a build with those captions but no page numbers, converted to PDF so the
     page each caption landed on can be read back;
  3. a final build with the page numbers filled in — the line count is
     unchanged from pass 2, so the pagination still holds.
"""

import os
import re
import subprocess
import sys
import unicodedata

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

from builder import Report
from part1 import TITLE, front_matter, chapter1, chapter2
from part2 import chapter3
from part3 import chapter4
from part4 import chapter5
from part5 import back_matter, chapter6

SCRATCH = os.path.dirname(HERE)
DIAG = os.path.join(SCRATCH, 'diagrams')
SHOTS = os.path.join(SCRATCH, 'shots')
TEMPLATE = os.path.join(SCRATCH, 'tpl', 'template.docx')
OUT = os.path.join(SCRATCH, 'out')
NAME = 'گزارش نهایی'

# the template's header frame is sized for a short title
HEADER_TITLE = 'پلتفرم چت‌باکس امنیتی'

FIGS = {
    'use_case': f'{DIAG}/01-use-case.png',
    'erd': f'{DIAG}/02-erd.png',
    'class': f'{DIAG}/03-class.png',
    'seq_login': f'{DIAG}/04-seq-login.png',
    'seq_message': f'{DIAG}/05-seq-message.png',
    'architecture': f'{DIAG}/06-architecture.png',
    'security': f'{DIAG}/07-security-layers.png',
    'account': f'{DIAG}/08-state-account.png',
    'monorepo': f'{DIAG}/09-monorepo.png',
    'cicd': f'{DIAG}/10-cicd.png',
}

SHOT = {
    'login': f'{SHOTS}/01-login.png',
    'register': f'{SHOTS}/02-register.png',
    'chats': f'{SHOTS}/03-chats-list.png',
    'chat': f'{SHOTS}/04-chat-detail.png',
    'members': f'{SHOTS}/05-members-dialog.png',
    'newchat': f'{SHOTS}/06-new-chat-dialog.png',
    'settings': f'{SHOTS}/07-settings.png',
    'muted': f'{SHOTS}/08-muted-composer.png',
    'admin': f'{SHOTS}/09-admin-panel.png',
    'apidocs': f'{SHOTS}/10-api-docs.png',
    'search': f'{SHOTS}/11-message-search.png',
    'sessions': f'{SHOTS}/12-sessions-dialog.png',
}

FA = str.maketrans('۰۱۲۳۴۵۶۷۸۹', '0123456789')


def build(path, figures=None, tables=None, page_map=None):
    r = Report(TEMPLATE, page_map=page_map)
    r.pending_figures = figures or []
    r.pending_tables = tables or []
    r.set_header_title(HEADER_TITLE)

    front_matter(r, SHOT, FIGS)
    chapter1(r, SHOT, FIGS)
    chapter2(r, SHOT, FIGS)
    chapter3(r, SHOT, FIGS)
    chapter4(r, SHOT, FIGS)
    chapter5(r, SHOT, FIGS)
    chapter6(r, SHOT, FIGS)
    back_matter(r, SHOT, FIGS)

    if path:
        r.finish(path)
    return r


def to_pdf(docx, pdf):
    subprocess.run(['pkill', '-x', 'soffice.bin'], capture_output=True)
    res = subprocess.run(
        [sys.executable, os.path.join(HERE, 'to_pdf.py'), docx, pdf],
        capture_output=True, text=True, timeout=900)
    if not os.path.exists(pdf):
        raise SystemExit(f'pdf conversion failed:\n{res.stdout}\n{res.stderr}')
    return pdf


def _norm(s):
    """Undo what pdftotext does to Persian: bidi marks, detached ezafe hamza,
    and the lam-alef ligature coming back out in the wrong order."""
    s = s.translate(FA)
    s = ''.join(c for c in s if unicodedata.category(c) != 'Cf')
    s = s.replace('ٔ', '').replace('ٓ', '').replace('‌', '')
    s = s.replace('لا', 'ال')
    return ''.join(c for c in s
                   if 'ء' <= c <= 'ی' or c.isdigit() or c in ' \n')


def page_numbers(pdf, entries):
    """Find the printed folio each caption landed on.

    Matched on a set of distinctive words rather than a contiguous substring,
    because the detached hamza breaks the character run mid-caption.
    """
    text = subprocess.run(['pdftotext', '-layout', pdf, '-'],
                          capture_output=True, text=True).stdout
    raw = text.split('\f')
    # spaces dropped so a word split by a stray glyph is still found
    flat = [_norm(p).replace(' ', '').replace('\n', '') for p in raw]

    # the front matter is foliated with abjad letters and the body with digits,
    # so the first numeric folio is where the body starts
    folio = {}
    for i, page in enumerate(raw):
        lines = [l.strip() for l in _norm(page).strip().split('\n') if l.strip()]
        last = lines[-1] if lines else ''
        if re.fullmatch(r'\d{1,3}', last):
            folio[i] = int(last)
    body_start = min(folio) if folio else 0

    result = {}
    # captions appear in document order, so each search may start where the
    # previous one matched — but figures and tables are two separate sequences
    for sequence in entries:
        floor = body_start
        for label, caption in sequence:
            words = [w for w in _norm(caption).split() if len(w) > 3]
            if not words:
                continue
            for i in range(floor, len(raw)):
                score = sum(1 for w in words if w in flat[i]) / len(words)
                if score >= 0.6:
                    result[f'{label} {caption}'] = folio.get(i, i + 1)
                    floor = i
                    break
    return result


def main():
    for name, path in list(FIGS.items()) + list(SHOT.items()):
        if not os.path.exists(path):
            raise SystemExit(f'missing image: {name} -> {path}')
    os.makedirs(OUT, exist_ok=True)

    docx = os.path.join(OUT, f'{NAME}.docx')
    pdf = os.path.join(OUT, f'{NAME}.pdf')
    probe = os.path.join(OUT, '_probe.docx')
    probe_pdf = os.path.join(OUT, '_probe.pdf')

    print('pass 1 — collecting captions')
    dry = build(None)
    figures, tables = dry.figure_index, dry.table_index
    print(f'  {len(figures)} figures, {len(tables)} tables')

    print('pass 2 — laying out to find page numbers')
    build(probe, figures, tables)
    to_pdf(probe, probe_pdf)
    pmap = page_numbers(probe_pdf, [figures, tables])
    missing = [k for k, _ in
               [(f'{a} {b}', 0) for a, b in figures + tables] if k not in pmap]
    print(f'  located {len(pmap)} of {len(figures) + len(tables)}')
    if missing:
        print('  not located:', *missing[:5], sep='\n    ')

    print('pass 3 — final build')
    build(docx, figures, tables, pmap)
    to_pdf(docx, pdf)

    for f in (probe, probe_pdf):
        if os.path.exists(f):
            os.remove(f)

    pages = subprocess.run(['pdfinfo', pdf], capture_output=True, text=True).stdout
    print('\nwritten:', docx, f'({round(os.path.getsize(docx)/1048576, 2)} MB)')
    print('written:', pdf, f'({round(os.path.getsize(pdf)/1048576, 2)} MB)')
    for line in pages.split('\n'):
        if line.startswith('Pages'):
            print(line)


if __name__ == '__main__':
    main()
