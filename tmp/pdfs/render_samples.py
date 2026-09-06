from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

ROOT = Path(__file__).resolve().parents[2]
OUTPUT = ROOT / "output" / "pdf"
OUTPUT.mkdir(parents=True, exist_ok=True)

pdfmetrics.registerFont(TTFont("TimesVN", "/System/Library/Fonts/Supplemental/Times New Roman.ttf"))
pdfmetrics.registerFont(
    TTFont("TimesVNBold", "/System/Library/Fonts/Supplemental/Times New Roman Bold.ttf")
)

normal = ParagraphStyle("normal", fontName="TimesVN", fontSize=10, leading=13)
center = ParagraphStyle(
    "center", fontName="TimesVNBold", fontSize=15, leading=18, alignment=TA_CENTER
)


def header(title, metadata, code):
    logo = Paragraph("<b><font color='#287f80'>PHÚC<br/>LONG</font></b>", center)
    info = Paragraph(
        f"<b>{title}</b><br/><br/>" + "<br/>".join(metadata), normal
    )
    return Table([[logo, info, Paragraph(f"<b>{code}</b>", normal)]], colWidths=[32 * mm, 112 * mm, 34 * mm])


def make_advance():
    doc = SimpleDocTemplate(
        str(OUTPUT / "mau-phieu-nghiep-vu-xe.pdf"),
        pagesize=A4,
        leftMargin=13 * mm,
        rightMargin=13 * mm,
        topMargin=10 * mm,
        bottomMargin=10 * mm,
    )
    story = [
        header(
            "PHIẾU TẠM ỨNG HÀNG",
            ["• Thời gian: 06/09/2026 08:30", "• Người thực hiện: Nguyễn Văn A", "• Xe / tuyến: T02 · Xe Bán Tải"],
            "PX-260906-000001",
        ),
        Spacer(1, 5 * mm),
    ]
    rows = [["STT", "HÀNG HOÁ", "SỐ LƯỢNG", "GHI CHÚ"]]
    items = [
        ("PlusEx 1 Lít\nPLUSEX1L", "12 Thùng", ""),
        ("Má phanh lớn\nMAPHANHL", "10 Hộp", ""),
        ("6200 TLT\n6200TLT", "5 Hộp", "+ 5 hộp"),
    ]
    for index in range(15):
        item = items[index] if index < len(items) else ("", "", "")
        rows.append([index + 1 if index < len(items) else "", item[0], item[1], item[2]])
    table = Table(rows, colWidths=[14 * mm, 84 * mm, 36 * mm, 44 * mm], rowHeights=[9 * mm] + [10 * mm] * 15)
    table.setStyle(
        TableStyle(
            [
                ("FONTNAME", (0, 0), (-1, -1), "TimesVN"),
                ("FONTNAME", (0, 0), (-1, 0), "TimesVNBold"),
                ("FONTSIZE", (0, 0), (-1, -1), 10),
                ("GRID", (0, 0), (-1, -1), 0.7, colors.black),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("ALIGN", (0, 0), (0, -1), "CENTER"),
                ("ALIGN", (2, 1), (2, -1), "CENTER"),
                ("LEFTPADDING", (0, 0), (-1, -1), 4),
            ]
        )
    )
    story.extend(
        [
            table,
            Spacer(1, 4 * mm),
            Table(
                [[Paragraph("<b>Các vấn đề cần chú ý:</b><br/>........................................................", normal), Paragraph("<b>Ghi chú:</b><br/>........................................................", normal)]],
                colWidths=[89 * mm, 89 * mm],
            ),
            Spacer(1, 5 * mm),
            Table(
                [["Người lập phiếu\n(ký, ghi rõ họ tên)", "Người xuất kho\n(ký, ghi rõ họ tên)", "Người tạm ứng\n(ký, ghi rõ họ tên)"]],
                colWidths=[59 * mm] * 3,
                style=TableStyle([("FONTNAME", (0, 0), (-1, -1), "TimesVNBold"), ("ALIGN", (0, 0), (-1, -1), "CENTER")]),
            ),
        ]
    )
    doc.build(story)


def make_report():
    doc = SimpleDocTemplate(
        str(OUTPUT / "mau-tong-hop-bao-cao-ngay.pdf"),
        pagesize=A4,
        leftMargin=13 * mm,
        rightMargin=13 * mm,
        topMargin=10 * mm,
        bottomMargin=10 * mm,
    )
    story = [
        header(
            "TỔNG HỢP BÁO CÁO NGÀY",
            ["• Thời gian: 06/09/2026", "• Địa bàn: Cần Thơ", "• Người thực hiện: Nguyễn Văn A", "• Phương tiện: T02"],
            "BCN-260906-0001",
        ),
        Spacer(1, 4 * mm),
    ]
    rows = [["STT", "Khách hàng", "Nghiệp vụ PS", "Thanh toán\nTM/CK", "Số tiền", "Ghi chú"]]
    items = [
        ("Anh An", "Bán hàng", "CK", "1.030.000", ""),
        ("Anh Cường", "Bán hàng", "TM", "2.220.000", ""),
        ("Quốc Nhân", "Thu nợ", "CK", "2.000.000", ""),
    ]
    for index in range(13):
        item = items[index] if index < len(items) else ("", "", "", "", "")
        rows.append([index + 1 if index < len(items) else "", *item])
    table = Table(rows, colWidths=[11 * mm, 48 * mm, 30 * mm, 25 * mm, 31 * mm, 33 * mm], rowHeights=[10 * mm] + [9 * mm] * 13)
    table.setStyle(
        TableStyle(
            [
                ("FONTNAME", (0, 0), (-1, -1), "TimesVN"),
                ("FONTNAME", (0, 0), (-1, 0), "TimesVNBold"),
                ("FONTSIZE", (0, 0), (-1, -1), 9),
                ("GRID", (0, 0), (-1, -1), 0.7, colors.black),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("ALIGN", (0, 0), (0, -1), "CENTER"),
                ("ALIGN", (2, 1), (4, -1), "CENTER"),
            ]
        )
    )
    footer = Table(
        [[Paragraph("CK: 3.030.000<br/>TM: 2.220.000 ⇒ <b>DT hôm nay: 5.250.000</b><br/><br/><b>Chi phí:</b><br/>Dầu: 100.000<br/>Ăn: 50.000<br/>Trạm: 0<br/>CP khác: 0<br/><br/><b>Còn lại nộp: 2.070.000</b>", normal), Paragraph("<b>SỐ HÀNG BÁN TRONG NGÀY</b><br/><br/>PlusEx 1 Lít: 24 Thùng<br/>Má phanh lớn: 10 Hộp<br/>6200 TLT: 5 Hộp", normal)]],
        colWidths=[82 * mm, 96 * mm],
        style=TableStyle([("BOX", (1, 0), (1, 0), 0.7, colors.black), ("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (-1, -1), 4), ("TOPPADDING", (0, 0), (-1, -1), 5)]),
    )
    story.extend([table, Spacer(1, 4 * mm), footer, Spacer(1, 3 * mm), Paragraph("<b><i>Các vấn đề cần giải quyết ngay:</i></b><br/>........................................................................................................................................................", normal)])
    doc.build(story)


if __name__ == "__main__":
    make_advance()
    make_report()
