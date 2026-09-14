"""Builds the final report on top of the university's own .docx template,
reusing its styles, section structure, headers and automatic numbering."""

import copy
import re
from docx import Document
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Cm, Emu, Pt, RGBColor

# style ids in the template
S_COVER = 'af0'        # متن روي جلد
S_COVER_TITLE = 'aa'   # عنوان پايان‌نامه
S_COVER_DATE = 'af1'   # تاريخ روي جلد
S_TITLE1 = 'Title1'
S_TITLE2 = 'Title2'
S_BODY = 'a8'          # متن
S_CONT = 'ad'          # متن پيوسته
S_LISTHEAD = 'ac'      # عنوان فهرست
S_CHAPTER = 'a'        # فصل         -> "فصل N: "
S_H1 = 'a0'            # تيتر اول    -> "N-M-"
S_H2 = 'a1'            # تيتر دوم    -> "N-M-K-"
S_BULLET = 'a7'        # تيتر سوم (bulleted)
S_FIGCAP = 'a2'        # زيرنويس شکل -> "شکل (N-M) "
S_TBLCAP = 'a4'        # بالانويس جدول -> "جدول (N-M) "
S_FORMULA = 'a3'       # فرمول
S_REF = 'a5'           # شماره گذاري مراجع -> "[N]"
S_FIGURE = '-'         # شکل - جدول
S_CELL = '-'           # شکل - جدول
S_CELL_BOLD = '-2'     # شکل - جدول (ضخيم)
S_SYMBOL = 'af6'       # فهرست علائم
S_EN_BODY = 'af5'      # متن (انگليسي)
S_EN_COVER = 'af3'
S_EN_TITLE = 'af4'
S_EN_DATE = 'af2'

PERSIAN = re.compile(r'[؀-ۿ‌‏]')
LATIN = re.compile(r'[A-Za-z0-9]')


def has_persian(s):
    return bool(PERSIAN.search(s))


S_TOF = 'TableofFigures'

FA_DIGITS = str.maketrans('0123456789', '۰۱۲۳۴۵۶۷۸۹')


def fa(n):
    return str(n).translate(FA_DIGITS)


class Report:
    def __init__(self, template_path, page_map=None):
        self.doc = Document(template_path)
        self.body = self.doc.element.body
        self._capture_sectprs()
        self._clear_body()
        # caption bookkeeping, so the figure and table lists can be emitted
        # as real entries rather than relying on a field Word must refresh
        self.chapter_no = 0
        self.fig_no = 0
        self.tbl_no = 0
        self.figure_index = []
        self.table_index = []
        self.page_map = page_map or {}

    # ---------- template scaffolding ----------

    def _capture_sectprs(self):
        """Grab one copy of each distinct section setup the template uses."""
        found = []
        for child in self.body.iterchildren():
            if child.tag != qn('w:p'):
                continue
            pPr = child.find(qn('w:pPr'))
            if pPr is None:
                continue
            sect = pPr.find(qn('w:sectPr'))
            if sect is not None:
                found.append(copy.deepcopy(sect))
        final = self.body.find(qn('w:sectPr'))
        self.sect = {
            'cover': found[0],        # sec0 -> no header
            'front': found[1],        # sec1 -> no header
            'toc': found[2],          # sec2 -> no header
            'ch_first': found[3],     # sec3 -> running header
            'ch_title': found[4],     # sec4 -> chapter opener, no header
            'ch_body': found[5],      # sec5 -> running header
            'final': copy.deepcopy(final) if final is not None else copy.deepcopy(found[-1]),
        }

    def _clear_body(self):
        for child in list(self.body.iterchildren()):
            if child.tag == qn('w:sectPr'):
                continue
            self.body.remove(child)

    def finish(self, path):
        sect = self.body.find(qn('w:sectPr'))
        if sect is not None:
            self.body.remove(sect)
        self.body.append(self.sect['final'])
        self.doc.save(path)

    def set_header_title(self, title, placeholder='عنوان پروژه'):
        """The template's running header literally says «عنوان پروژه», and Word
        has it split across runs — so match on the paragraph and write the
        replacement back into the first run that contributed to it."""
        # go at the header/footer parts directly: clearing the body drops the
        # section-break paragraphs, so doc.sections no longer lists them all
        from docx.text.paragraph import Paragraph

        hits = 0
        for part in self.doc.part.package.iter_parts():
            name = str(part.partname)
            if 'header' not in name and 'footer' not in name:
                continue
            root = getattr(part, 'element', None)
            if root is None:
                continue
            for p_el in root.iter(qn('w:p')):
                before = ''.join(
                    t.text or '' for t in p_el.iter(qn('w:t')))
                if placeholder not in before:
                    continue
                self._replace_across_runs(Paragraph(p_el, part), placeholder, title)
                hits += 1
        return hits

    @staticmethod
    def _replace_across_runs(paragraph, needle, replacement):
        runs = paragraph.runs
        joined = ''.join(r.text for r in runs)
        at = joined.find(needle)
        if at < 0:
            return

        end = at + len(needle)
        cursor, first = 0, True
        for run in runs:
            length = len(run.text)
            start, stop = cursor, cursor + length
            cursor = stop
            if stop <= at or start >= end:
                continue
            head = run.text[:max(0, at - start)]
            tail = run.text[max(0, end - start):] if stop > end else ''
            run.text = head + (replacement if first else '') + tail
            first = False

    # ---------- primitives ----------

    def _p(self, style=None):
        p = self.doc.add_paragraph()
        if style:
            p.style = self.doc.styles.get_by_id(style, 1) if False else None
            pPr = p._p.get_or_add_pPr()
            for old in pPr.findall(qn('w:pStyle')):
                pPr.remove(old)
            el = OxmlElement('w:pStyle')
            el.set(qn('w:val'), style)
            pPr.insert(0, el)
        return p

    def _runs(self, p, text, base_rtl=True, mono=False, bold=False, size=None):
        """Split on script boundaries so Latin fragments stay LTR inside an RTL line,
        and honour **bold** / `code` markers."""
        tokens = re.split(r'(\*\*.+?\*\*|`[^`]+?`)', text)
        for token in tokens:
            if not token:
                continue
            tb, tm = bold, mono
            if token.startswith('**') and token.endswith('**') and len(token) > 4:
                token, tb = token[2:-2], True
            elif token.startswith('`') and token.endswith('`') and len(token) > 2:
                token, tm = token[1:-1], True
            # split into runs of same directionality
            for frag in re.split(r'([؀-ۿ‌][؀-ۿ‌\s،؛؟.,:;()«»\-–—؟!٪۰-۹]*)', token):
                if not frag:
                    continue
                # isolate Latin fragments, or bidi drags a leading or trailing
                # slash to the wrong end of a path
                if base_rtl and not has_persian(frag) and LATIN.search(frag):
                    frag = f'⁦{frag}⁩'
                run = p.add_run(frag)
                rPr = run._r.get_or_add_rPr()
                is_fa = has_persian(frag)
                if tb:
                    run.bold = True
                if tm:
                    run.font.name = 'Consolas'
                    rPr_fonts = rPr.find(qn('w:rFonts'))
                    if rPr_fonts is None:
                        rPr_fonts = OxmlElement('w:rFonts')
                        rPr.insert(0, rPr_fonts)
                    rPr_fonts.set(qn('w:ascii'), 'Consolas')
                    rPr_fonts.set(qn('w:hAnsi'), 'Consolas')
                    rPr_fonts.set(qn('w:cs'), 'Consolas')
                    run.font.size = Pt(9.5)
                if size:
                    run.font.size = Pt(size)
                if is_fa and base_rtl:
                    rtl = OxmlElement('w:rtl')
                    rPr.append(rtl)
                    fonts = rPr.find(qn('w:rFonts'))
                    if fonts is None:
                        fonts = OxmlElement('w:rFonts')
                        rPr.insert(0, fonts)
                    if not tm:
                        fonts.set(qn('w:cs'), 'B Nazanin')
                    fonts.set(qn('w:hint'), 'cs')
        return p

    # ---------- public content API ----------

    def para(self, text, style=S_BODY, mono=False, bold=False, size=None):
        p = self._p(style)
        self._runs(p, text, mono=mono, bold=bold, size=size)
        return p

    def blank(self, style=S_BODY, n=1):
        for _ in range(n):
            self._p(style)

    @staticmethod
    def _suppress_numbering(p):
        """Detach a paragraph from its style's list (numId 0), the way the
        template itself does for «مراجع» and «پیوست‌ها»."""
        pPr = p._p.get_or_add_pPr()
        numPr = OxmlElement('w:numPr')
        ilvl = OxmlElement('w:ilvl')
        ilvl.set(qn('w:val'), '0')
        numId = OxmlElement('w:numId')
        numId.set(qn('w:val'), '0')
        numPr.append(ilvl)
        numPr.append(numId)
        style = pPr.find(qn('w:pStyle'))
        if style is not None:
            style.addnext(numPr)
        else:
            pPr.insert(0, numPr)
        return p

    def chapter(self, title, numbered=True):
        if numbered:
            self.chapter_no += 1
        self.fig_no = 0
        self.tbl_no = 0
        p = self.para(title, S_CHAPTER)
        if not numbered:
            self._suppress_numbering(p)
        return p

    def h1(self, title):
        self.para(title, S_H1)

    def h2(self, title):
        self.para(title, S_H2)

    def bullet(self, text):
        self.para(text, S_BULLET)

    def code(self, text):
        for line in text.split('\n'):
            p = self._p(S_BODY)
            pPr = p._p.get_or_add_pPr()
            bidi = pPr.find(qn('w:bidi'))
            if bidi is None:
                bidi = OxmlElement('w:bidi')
                pPr.append(bidi)
            bidi.set(qn('w:val'), '0')
            p.alignment = WD_ALIGN_PARAGRAPH.LEFT
            pf = p.paragraph_format
            pf.space_after = Pt(0)
            pf.space_before = Pt(0)
            pf.left_indent = Cm(0.6)
            pf.right_indent = Cm(0.6)
            pf.line_spacing = 1.0
            run = p.add_run(line if line else ' ')
            run.font.name = 'Consolas'
            run.font.size = Pt(9)
            rPr = run._r.get_or_add_rPr()
            fonts = OxmlElement('w:rFonts')
            fonts.set(qn('w:ascii'), 'Consolas')
            fonts.set(qn('w:hAnsi'), 'Consolas')
            fonts.set(qn('w:cs'), 'Consolas')
            rPr.insert(0, fonts)

    def figure(self, path, caption, width_cm=14.0):
        p = self._p(S_FIGURE)
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        p.add_run().add_picture(path, width=Cm(width_cm))
        self.fig_no += 1
        label = f'شکل ({fa(self.chapter_no)}-{fa(self.fig_no)})'
        self.figure_index.append((label, caption))
        # the template's caption numbering sits at a low level of the chapter
        # list, so every heading resets it — number them here instead
        cap = self._suppress_numbering(self._p(S_FIGCAP))
        self._runs(cap, f'{label} {caption}')
        return cap

    def table(self, caption, header, rows, widths=None, font_size=9.5):
        if caption:
            self.tbl_no += 1
            label = f'جدول ({fa(self.chapter_no)}-{fa(self.tbl_no)})'
            self.table_index.append((label, caption))
            cap = self._suppress_numbering(self._p(S_TBLCAP))
            self._runs(cap, f'{label} {caption}')

        ncols = len(header) if header else len(rows[0])
        table = self.doc.add_table(rows=0, cols=ncols)
        tbl = table._tbl
        tblPr = tbl.tblPr

        for tag in ('w:tblStyle', 'w:tblBorders', 'w:jc', 'w:bidiVisual', 'w:tblW'):
            for old in tblPr.findall(qn(tag)):
                tblPr.remove(old)

        bidi = OxmlElement('w:bidiVisual')
        tblPr.insert(0, bidi)
        w = OxmlElement('w:tblW')
        w.set(qn('w:w'), '5000')
        w.set(qn('w:type'), 'pct')
        tblPr.append(w)
        jc = OxmlElement('w:jc')
        jc.set(qn('w:val'), 'center')
        tblPr.append(jc)
        borders = OxmlElement('w:tblBorders')
        for edge in ('top', 'left', 'bottom', 'right', 'insideH', 'insideV'):
            e = OxmlElement(f'w:{edge}')
            e.set(qn('w:val'), 'single')
            e.set(qn('w:sz'), '8')
            e.set(qn('w:space'), '0')
            e.set(qn('w:color'), '000000')
            borders.append(e)
        tblPr.append(borders)

        def fill(cells, values, bold):
            for cell, value in zip(cells, values):
                cell.text = ''
                p = cell.paragraphs[0]
                pPr = p._p.get_or_add_pPr()
                for old in pPr.findall(qn('w:pStyle')):
                    pPr.remove(old)
                el = OxmlElement('w:pStyle')
                el.set(qn('w:val'), S_CELL_BOLD if bold else S_CELL)
                pPr.insert(0, el)
                pf = p.paragraph_format
                pf.space_after = Pt(1)
                pf.space_before = Pt(1)
                pf.line_spacing = 1.0
                self._runs(p, str(value), bold=bold, size=font_size)
                tcPr = cell._tc.get_or_add_tcPr()
                va = OxmlElement('w:vAlign')
                va.set(qn('w:val'), 'center')
                tcPr.append(va)

        if header:
            row = table.add_row()
            fill(row.cells, header, True)
            trPr = row._tr.get_or_add_trPr()
            th = OxmlElement('w:tblHeader')
            trPr.append(th)

        for values in rows:
            row = table.add_row()
            fill(row.cells, values, False)

        if widths:
            total = sum(widths)
            for r in table.rows:
                for cell, wd in zip(r.cells, widths):
                    cell.width = Cm(15.5 * wd / total)
        return table

    def reference(self, text):
        self.para(text, S_REF)

    # ---------- fields ----------

    def field(self, instr, placeholder='برای به‌روزرسانی، کل سند را انتخاب و F9 را بزنید.'):
        p = self._p(S_BODY)
        r1 = p.add_run()
        fld = OxmlElement('w:fldChar')
        fld.set(qn('w:fldCharType'), 'begin')
        r1._r.append(fld)
        r2 = p.add_run()
        it = OxmlElement('w:instrText')
        it.set(qn('xml:space'), 'preserve')
        it.text = f' {instr} '
        r2._r.append(it)
        r3 = p.add_run()
        sep = OxmlElement('w:fldChar')
        sep.set(qn('w:fldCharType'), 'separate')
        r3._r.append(sep)
        r4 = p.add_run(placeholder)
        r4.font.size = Pt(10)
        r5 = p.add_run()
        end = OxmlElement('w:fldChar')
        end.set(qn('w:fldCharType'), 'end')
        r5._r.append(end)
        return p

    def caption_list(self, entries):
        """Emit «شکل (۳-۱) caption ....... page» lines in the template's own style.

        Entries are recorded during the first build pass; page numbers arrive
        from `page_map` on the second, so the line count — and therefore the
        pagination — is identical in both passes.
        """
        section = self.doc.sections[-1]
        width = section.page_width - section.left_margin - section.right_margin
        # leave room for the folio itself, or the number wraps to the next line
        stop = Emu(int(width)).twips - 420

        for label, caption in entries:
            p = self._p(S_TOF)
            pf = p.paragraph_format
            pf.left_indent = 0
            pf.right_indent = 0
            pf.first_line_indent = 0
            pPr = p._p.get_or_add_pPr()
            tabs = OxmlElement('w:tabs')
            tab = OxmlElement('w:tab')
            tab.set(qn('w:val'), 'left')
            tab.set(qn('w:leader'), 'dot')
            tab.set(qn('w:pos'), str(stop))
            tabs.append(tab)
            pPr.append(tabs)
            self._runs(p, f'{label} {caption}')
            p.add_run('\t')
            page = self.page_map.get(f'{label} {caption}')
            self._runs(p, fa(page) if page else '—')

    # ---------- layout ----------

    def section_break(self, kind):
        """Close the current section with the template's setup for `kind`."""
        p = self._p(S_BODY)
        pPr = p._p.get_or_add_pPr()
        pPr.append(copy.deepcopy(self.sect[kind]))
        return p

    def page_break(self):
        p = self._p(S_BODY)
        run = p.add_run()
        br = OxmlElement('w:br')
        br.set(qn('w:type'), 'page')
        run._r.append(br)
