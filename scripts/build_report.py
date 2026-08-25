#!/usr/bin/env python3
"""Day Trader Telugu — deterministic PDF report builder.

Usage: python3 build_report.py <content.json> <output.pdf>

The agent supplies ONLY content (extracted from the day's transcript); this
script owns the layout, following the task's PART A/E design system. Never
edit this per-run — it is tested and versioned with the repo.

content.json schema (all text fields are plain strings):
{
  "title": str,                # video title
  "date_line": str,            # e.g. "August 11, 2026   •   Video duration: 29m 46s"
  "fallback_notice": str|"",   # e.g. "Latest available video — uploaded ..." or ""
  "video_url": str,
  "kpis": [{"value": str, "dir": "up"|"down", "label": str, "context": str}],  # 2-4
  "takeaways": [{"tag": str, "impact": "HIGH"|"MED"|"LOW", "lead": str, "text": str}],
  "why_it_matters": str,
  "highlights": [{"tag": str, "impact": str, "lead": str, "text": str}],
  "indicators": [[metric, value, change], ...],   # change ending in % styled by sign
  "sector_news": [{"subhead": str, "bullets": [{"tag","impact","lead","text"}]}],
  "sector_callout": str,
  "opinions": [{"lead": str, "text": str}],
  "watch": [[event, meaning], ...],
  "transcript_note": str
}
"""
from __future__ import annotations

import json
import os
import sys

from reportlab.lib.colors import HexColor, white
from reportlab.lib.enums import TA_CENTER, TA_RIGHT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.pdfmetrics import stringWidth
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    BaseDocTemplate,
    Flowable,
    Frame,
    KeepTogether,
    PageTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
)

# (path, regular subfont index, bold subfont index) — index is for .ttc files.
# Helvetica Neue ships with macOS and includes the ₹ glyph; DejaVu covers Linux.
FONT_CANDIDATES = [
    ("/System/Library/Fonts/HelveticaNeue.ttc", 0, 1),
    ("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", None, None),
]
for path, reg_idx, bold_idx in FONT_CANDIDATES:
    if not os.path.exists(path):
        continue
    if reg_idx is None:
        pdfmetrics.registerFont(TTFont("DVS", path))
        pdfmetrics.registerFont(TTFont("DVS-Bold", path.replace(".ttf", "-Bold.ttf")))
    else:
        pdfmetrics.registerFont(TTFont("DVS", path, subfontIndex=reg_idx))
        pdfmetrics.registerFont(TTFont("DVS-Bold", path, subfontIndex=bold_idx))
    break
else:
    raise SystemExit("No usable font pair found on this machine.")
pdfmetrics.registerFontFamily("DVS", normal="DVS", bold="DVS-Bold",
                              italic="DVS", boldItalic="DVS-Bold")

NAVY = HexColor("#12263F"); ACCENT = HexColor("#1F6FEB"); INK = HexColor("#1A202C")
GREY = HexColor("#4A5568"); SUBGREY = HexColor("#A8B3C2"); PANEL = HexColor("#F4F6F9")
BORDER = HexColor("#D9DEE6"); PILL_BG = HexColor("#EDF1F7"); PILL_BR = HexColor("#C7D2E0")
GREEN = HexColor("#0B7A45"); RED = HexColor("#B42318"); AMBER = HexColor("#D97706")
OP_BG = HexColor("#FFF8E6"); OP_TEXT = HexColor("#7C4A03"); OP_LABEL = HexColor("#B45309")

PAGE_W, PAGE_H = A4
MARGIN = 16 * mm
MAST_H = 30 * mm
CONTENT_W = PAGE_W - 2 * MARGIN


def st(name, **kw):
    base = dict(fontName="DVS", fontSize=8.6, leading=12.6, textColor=INK)
    base.update(kw)
    return ParagraphStyle(name, **base)


S = {
    "video_title": st("video_title", fontName="DVS-Bold", fontSize=9.5, leading=13, textColor=NAVY),
    "body": st("body"),
    "section": st("section", fontName="DVS-Bold", fontSize=10.5, leading=13.5, textColor=NAVY),
    "subhead": st("subhead", fontName="DVS-Bold", fontSize=8.5, leading=11, textColor=ACCENT),
    "caption": st("caption", fontName="DVS-Bold", fontSize=8, leading=10, textColor=ACCENT),
    "kpi_g": st("kpi_g", fontName="DVS-Bold", fontSize=13, leading=15, textColor=GREEN, alignment=TA_CENTER),
    "kpi_r": st("kpi_r", fontName="DVS-Bold", fontSize=13, leading=15, textColor=RED, alignment=TA_CENTER),
    "kpi_label": st("kpi_label", fontSize=6.2, leading=8, textColor=GREY, alignment=TA_CENTER),
    "kpi_ctx": st("kpi_ctx", fontSize=5.8, leading=7.5, textColor=GREY, alignment=TA_CENTER),
    "callout": st("callout", fontSize=8.3, leading=12),
    "op_label": st("op_label", fontName="DVS-Bold", fontSize=7.4, leading=9.5, textColor=OP_LABEL),
    "op_body": st("op_body", fontSize=8.3, leading=12, textColor=OP_TEXT),
    "cell": st("cell", fontSize=8, leading=10.5),
    "cell_r": st("cell_r", fontSize=8, leading=10.5, alignment=TA_RIGHT),
    "cell_g": st("cell_g", fontName="DVS-Bold", fontSize=8, leading=10.5, textColor=GREEN, alignment=TA_RIGHT),
    "cell_rd": st("cell_rd", fontName="DVS-Bold", fontSize=8, leading=10.5, textColor=RED, alignment=TA_RIGHT),
    "th": st("th", fontName="DVS-Bold", fontSize=8, leading=10.5, textColor=white),
    "source": st("source", fontSize=8, leading=11, textColor=GREY),
    "fallback": st("fallback", fontName="DVS-Bold", fontSize=8, leading=11, textColor=AMBER),
    "fn": st("fn", fontSize=6.8, leading=9, textColor=GREY),
}


class Pill(Flowable):
    FONT, SIZE, PAD_X, PAD_Y = "DVS-Bold", 5.6, 4, 2.2

    def __init__(self, text, bg, fg, border=None):
        super().__init__()
        self.text, self.bg, self.fg, self.border = text.upper(), bg, fg, border
        self.width = stringWidth(self.text, self.FONT, self.SIZE) + 2 * self.PAD_X
        self.height = self.SIZE + 2 * self.PAD_Y

    def draw(self):
        c, r = self.canv, self.height / 2
        c.setFillColor(self.bg)
        if self.border:
            c.setStrokeColor(self.border)
            c.setLineWidth(0.4)
            c.roundRect(0, 0, self.width, self.height, r, stroke=1, fill=1)
        else:
            c.roundRect(0, 0, self.width, self.height, r, stroke=0, fill=1)
        c.setFillColor(self.fg)
        c.setFont(self.FONT, self.SIZE)
        c.drawCentredString(self.width / 2, self.PAD_Y + 0.8, self.text)


class PillRow(Flowable):
    GAP = 4

    def __init__(self, pills):
        super().__init__()
        self.pills = pills
        self.width = sum(p.width for p in pills) + self.GAP * (len(pills) - 1)
        self.height = max(p.height for p in pills)

    def draw(self):
        x = 0
        for p in self.pills:
            p.canv = self.canv
            self.canv.saveState()
            self.canv.translate(x, 0)
            p.draw()
            self.canv.restoreState()
            x += p.width + self.GAP


IMPACT_COLORS = {"HIGH": RED, "MED": AMBER, "LOW": GREY}


def tagged_bullet(tag, impact, lead, text):
    pills = PillRow([Pill(tag, PILL_BG, GREY, PILL_BR),
                     Pill(impact, IMPACT_COLORS.get(impact, GREY), white)])
    para = Paragraph(f"<b>{lead}</b> {text}", S["body"])
    col = pills.width + 8
    t = Table([[pills, para]], colWidths=[col, CONTENT_W - col])
    t.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"),
                           ("LEFTPADDING", (0, 0), (-1, -1), 0),
                           ("RIGHTPADDING", (0, 0), (0, 0), 0),
                           ("TOPPADDING", (0, 0), (-1, -1), 0),
                           ("BOTTOMPADDING", (0, 0), (-1, -1), 0)]))
    return t


def section_heading(num, text):
    bar = Table([["", Paragraph(f"{num}. {text}", S["section"])]],
                colWidths=[2.4, CONTENT_W - 2.4], rowHeights=[16])
    bar.setStyle(TableStyle([("BACKGROUND", (0, 0), (0, 0), ACCENT),
                             ("BACKGROUND", (1, 0), (1, 0), PANEL),
                             ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                             ("LEFTPADDING", (1, 0), (1, 0), 8),
                             ("TOPPADDING", (0, 0), (-1, -1), 0),
                             ("BOTTOMPADDING", (0, 0), (-1, -1), 0)]))
    return bar


def callout(text):
    p = Paragraph(f"<b>WHY IT MATTERS —</b> {text}", S["callout"])
    t = Table([["", p]], colWidths=[2.4, CONTENT_W - 2.4])
    t.setStyle(TableStyle([("BACKGROUND", (0, 0), (0, 0), ACCENT),
                           ("BACKGROUND", (1, 0), (1, 0), PANEL),
                           ("VALIGN", (0, 0), (-1, -1), "TOP"),
                           ("LEFTPADDING", (1, 0), (1, 0), 9),
                           ("RIGHTPADDING", (1, 0), (1, 0), 9),
                           ("TOPPADDING", (0, 0), (-1, -1), 7),
                           ("BOTTOMPADDING", (0, 0), (-1, -1), 7)]))
    return t


def data_table(caption, header, rows, fracs, styled_change_col=None, text_cols=()):
    widths = [CONTENT_W * f for f in fracs]
    head = [Paragraph(h, S["th"]) for h in header]
    body = []
    for row in rows:
        cells = []
        for c_i, cell in enumerate(row):
            style = S["cell"]
            if c_i == styled_change_col:
                style = S["cell_rd"] if cell.strip().startswith("-") else S["cell_g"]
            elif c_i > 0 and c_i not in text_cols:
                style = S["cell_r"]
            cells.append(Paragraph(cell, style))
        body.append(cells)
    t = Table([head] + body, colWidths=widths, repeatRows=1)
    ts = [("BACKGROUND", (0, 0), (-1, 0), NAVY),
          ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
          ("LEFTPADDING", (0, 0), (-1, -1), 7), ("RIGHTPADDING", (0, 0), (-1, -1), 7),
          ("TOPPADDING", (0, 0), (-1, -1), 5), ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
          ("LINEBELOW", (0, 0), (-1, -1), 0.4, BORDER),
          ("BOX", (0, 0), (-1, -1), 0.5, BORDER)]
    for i in range(1, len(body) + 1):
        if i % 2 == 0:
            ts.append(("BACKGROUND", (0, i), (-1, i), PANEL))
    t.setStyle(TableStyle(ts))
    return KeepTogether([Paragraph(caption, S["caption"]), Spacer(1, 4), t])


def make_on_page(date_line):
    def on_page(canvas, doc):
        canvas.saveState()
        canvas.setFillColor(NAVY)
        canvas.rect(0, PAGE_H - MAST_H, PAGE_W, MAST_H, stroke=0, fill=1)
        canvas.setFillColor(ACCENT)
        canvas.rect(0, PAGE_H - MAST_H - 1.2 * mm, PAGE_W, 1.2 * mm, stroke=0, fill=1)
        canvas.setFillColor(white)
        canvas.setFont("DVS-Bold", 15)
        canvas.drawString(MARGIN, PAGE_H - 13 * mm, "DAY TRADER TELUGU")
        canvas.setFillColor(SUBGREY)
        canvas.setFont("DVS", 9)
        canvas.drawString(MARGIN, PAGE_H - 18.5 * mm, "Daily Market Intelligence Report")
        canvas.setFont("DVS", 8)
        canvas.drawString(MARGIN, PAGE_H - 24 * mm, date_line)
        canvas.setStrokeColor(BORDER)
        canvas.setLineWidth(0.5)
        canvas.line(MARGIN, 14 * mm, PAGE_W - MARGIN, 14 * mm)
        canvas.setFillColor(GREY)
        canvas.setFont("DVS", 6.5)
        canvas.drawString(MARGIN, 10 * mm,
                          "Summary of third-party YouTube content. For informational "
                          "purposes only. Not investment advice.")
        canvas.drawRightString(PAGE_W - MARGIN, 10 * mm, f"Page {doc.page}")
        canvas.restoreState()
    return on_page


def bullets(story, items):
    for i, b in enumerate(items):
        if i:
            story.append(Spacer(1, 6))
        story.append(tagged_bullet(b["tag"], b["impact"], b["lead"], b["text"]))


def build(content, pdf_path):
    doc = BaseDocTemplate(pdf_path, pagesize=A4, leftMargin=MARGIN, rightMargin=MARGIN,
                          topMargin=MAST_H + 8 * mm, bottomMargin=18 * mm,
                          title="Day Trader Telugu — Daily Market Intelligence Report")
    frame = Frame(MARGIN, 18 * mm, CONTENT_W, PAGE_H - MAST_H - 8 * mm - 18 * mm,
                  id="main", leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0)
    doc.addPageTemplates([PageTemplate(id="all", frames=[frame],
                                       onPage=make_on_page(content["date_line"]))])
    story = []

    if content.get("fallback_notice"):
        story.append(Paragraph(content["fallback_notice"], S["fallback"]))
        story.append(Spacer(1, 8))

    video_inner = [
        Paragraph(content["title"], S["video_title"]),
        Spacer(1, 3),
        Paragraph('Source: YouTube auto-captions — figures marked "(per video)" are '
                  f'unverified.  •  <link href="{content["video_url"]}">'
                  '<font color="#1F6FEB">Watch on YouTube</font></link>', S["source"]),
    ]
    vp = Table([[video_inner]], colWidths=[CONTENT_W])
    vp.setStyle(TableStyle([("BOX", (0, 0), (-1, -1), 0.7, NAVY),
                            ("LEFTPADDING", (0, 0), (-1, -1), 10),
                            ("RIGHTPADDING", (0, 0), (-1, -1), 10),
                            ("TOPPADDING", (0, 0), (-1, -1), 8),
                            ("BOTTOMPADDING", (0, 0), (-1, -1), 8)]))
    story.append(vp)
    story.append(Spacer(1, 12))

    kpis = content["kpis"]
    if kpis:
        row_v = [Paragraph(k["value"], S["kpi_g" if k["dir"] == "up" else "kpi_r"]) for k in kpis]
        row_l = [Paragraph(k["label"], S["kpi_label"]) for k in kpis]
        row_c = [Paragraph(k["context"], S["kpi_ctx"]) for k in kpis]
        kpi = Table([row_v, row_l, row_c], colWidths=[CONTENT_W / len(kpis)] * len(kpis))
        kpi.setStyle(TableStyle([("BOX", (0, 0), (-1, -1), 0.5, BORDER),
                                 ("LINEAFTER", (0, 0), (-2, -1), 0.5, BORDER),
                                 ("BACKGROUND", (0, 0), (-1, -1), PANEL),
                                 ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                                 ("TOPPADDING", (0, 0), (-1, 0), 8),
                                 ("TOPPADDING", (0, 1), (-1, 1), 2),
                                 ("TOPPADDING", (0, 2), (-1, 2), 1),
                                 ("BOTTOMPADDING", (0, 2), (-1, 2), 7),
                                 ("LEFTPADDING", (0, 0), (-1, -1), 4),
                                 ("RIGHTPADDING", (0, 0), (-1, -1), 4)]))
        story.append(kpi)
        story.append(Spacer(1, 12))

    story.append(section_heading(1, "KEY TAKEAWAYS (TL;DR)"))
    story.append(Spacer(1, 8))
    bullets(story, content["takeaways"])
    story.append(Spacer(1, 18))
    story.append(callout(content["why_it_matters"]))
    story.append(Spacer(1, 20))

    story.append(section_heading(2, "MARKET & ECONOMIC HIGHLIGHTS"))
    story.append(Spacer(1, 8))
    bullets(story, content["highlights"])
    if content.get("indicators"):
        story.append(Spacer(1, 12))
        story.append(data_table("FINANCIAL & MACRO INDICATORS",
                                ["Metric / Event", "Value", "Change / Impact"],
                                content["indicators"], [0.46, 0.27, 0.27],
                                styled_change_col=2))
    story.append(Spacer(1, 20))

    story.append(section_heading(3, "STOCKS & SECTOR NEWS"))
    story.append(Spacer(1, 8))
    for group in content["sector_news"]:
        story.append(Paragraph(group["subhead"].upper(), S["subhead"]))
        story.append(Spacer(1, 5))
        bullets(story, group["bullets"])
        story.append(Spacer(1, 10))
    if content.get("sector_callout"):
        story.append(Spacer(1, 8))
        story.append(callout(content["sector_callout"]))
    story.append(Spacer(1, 20))

    story.append(section_heading(4, "PRESENTER'S VIEWS & OUTLOOK"))
    story.append(Spacer(1, 8))
    op_inner = [Paragraph("OPINION — NOT FACT, NOT A RECOMMENDATION", S["op_label"])]
    for op in content["opinions"]:
        op_inner.append(Spacer(1, 4))
        op_inner.append(Paragraph(f"<b>{op['lead']}</b> {op['text']}", S["op_body"]))
    op = Table([["", op_inner]], colWidths=[2.6, CONTENT_W - 2.6])
    op.setStyle(TableStyle([("BACKGROUND", (0, 0), (0, 0), AMBER),
                            ("BACKGROUND", (1, 0), (1, 0), OP_BG),
                            ("VALIGN", (0, 0), (-1, -1), "TOP"),
                            ("LEFTPADDING", (1, 0), (1, 0), 9),
                            ("RIGHTPADDING", (1, 0), (1, 0), 9),
                            ("TOPPADDING", (0, 0), (-1, -1), 8),
                            ("BOTTOMPADDING", (0, 0), (-1, -1), 8)]))
    story.append(KeepTogether([op]))
    story.append(Spacer(1, 20))

    story.append(section_heading(5, "WHAT TO WATCH"))
    story.append(Spacer(1, 8))
    story.append(data_table("UPCOMING EVENTS", ["Date / Event", "What it means for you"],
                            content["watch"], [0.42, 0.58], text_cols=(1,)))
    story.append(Spacer(1, 10))
    story.append(Paragraph(content["transcript_note"], S["fn"]))

    doc.build(story)


def main() -> None:
    if len(sys.argv) != 3:
        raise SystemExit("usage: build_report.py <content.json> <output.pdf>")
    with open(sys.argv[1]) as f:
        content = json.load(f)
    required = ["title", "date_line", "video_url", "kpis", "takeaways",
                "why_it_matters", "highlights", "sector_news", "opinions",
                "watch", "transcript_note"]
    missing = [k for k in required if k not in content]
    if missing:
        raise SystemExit(f"content.json missing keys: {missing}")
    build(content, sys.argv[2])
    print(f"Built {sys.argv[2]} ({os.path.getsize(sys.argv[2])} bytes)")


if __name__ == "__main__":
    main()
