# -*- coding: utf-8 -*-
"""Open the .docx in a headless LibreOffice, refresh every field and index
(so the TOC, figure list and table list actually fill in), then export a PDF."""

import os
import subprocess
import sys
import time

import uno
from com.sun.star.beans import PropertyValue

PIPE = 'reportconv'


def connect(retries=40):
    local = uno.getComponentContext()
    resolver = local.ServiceManager.createInstanceWithContext(
        'com.sun.star.bridge.UnoUrlResolver', local)
    url = f'uno:pipe,name={PIPE};urp;StarOffice.ComponentContext'
    for i in range(retries):
        try:
            return resolver.resolve(url)
        except Exception:
            time.sleep(1)
    raise SystemExit('could not connect to soffice')


def prop(name, value):
    p = PropertyValue()
    p.Name = name
    p.Value = value
    return p


def main(src, dst):
    soffice = subprocess.Popen([
        'soffice', '--headless', '--norestore', '--invisible', '--nologo',
        f'--accept=pipe,name={PIPE};urp;',
    ])
    try:
        ctx = connect()
        desktop = ctx.ServiceManager.createInstanceWithContext(
            'com.sun.star.frame.Desktop', ctx)

        doc = desktop.loadComponentFromURL(
            uno.systemPathToFileUrl(os.path.abspath(src)), '_blank', 0,
            (prop('Hidden', True), prop('ReadOnly', False),
             prop('UpdateDocMode', 3)))

        # two passes: pagination shifts once the indexes gain their entries
        for _ in range(3):
            try:
                doc.getTextFields().refresh()
            except Exception as e:
                print('field refresh:', e)
            try:
                indexes = doc.getDocumentIndexes()
                for i in range(indexes.getCount()):
                    indexes.getByIndex(i).update()
            except Exception as e:
                print('index refresh:', e)
            try:
                doc.refresh()
            except Exception:
                pass
            time.sleep(1.5)

        print('indexes:', doc.getDocumentIndexes().getCount())

        doc.storeToURL(
            uno.systemPathToFileUrl(os.path.abspath(dst)),
            (prop('FilterName', 'writer_pdf_Export'),))
        doc.store()
        doc.close(False)
        print('pdf written:', dst)
    finally:
        try:
            desktop.terminate()
        except Exception:
            pass
        time.sleep(2)
        soffice.terminate()


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
