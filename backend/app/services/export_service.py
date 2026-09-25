import io

from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter

from app.models.abc_xyz import AbcXyzItem

_HEADER_FILL = PatternFill(start_color="2D2F45", end_color="2D2F45", fill_type="solid")
_HEADER_FONT = Font(color="FFFFFF", bold=True)

_ABC_XYZ_COLORS = {
    ("A", "X"): "C6EFCE", ("A", "Y"): "FFEB9C", ("A", "Z"): "FFC7CE",
    ("B", "X"): "D9E1F2", ("B", "Y"): "FFF2CC", ("B", "Z"): "FCE4D6",
    ("C", "X"): "E2EFDA", ("C", "Y"): "F2F2F2", ("C", "Z"): "EDEDED",
}

_LETTER_COLORS = {
    "A": "C6EFCE", "X": "C6EFCE",
    "B": "FFEB9C", "Y": "FFEB9C",
    "C": "FFC7CE", "Z": "FFC7CE",
}


def _smart_fmt(v) -> str:
    try:
        return f"{round(float(v), 2):.2f}".rstrip("0").rstrip(".")
    except (TypeError, ValueError):
        return str(v)


def _autosize_columns(ws, max_width: int = 40) -> None:
    for col_cells in ws.columns:
        length = max((len(str(c.value)) for c in col_cells if c.value is not None), default=0)
        ws.column_dimensions[get_column_letter(col_cells[0].column)].width = min(max_width, max(10, length + 2))


def export_abc_xyz_to_excel(items: list[AbcXyzItem], matrix: list[dict],
                            period_label: str | None, lang: str = "ru") -> bytes:
    if lang not in ("ru", "pl", "en"):
        lang = "ru"
    _L = {
        "ru": dict(data="Данные", matrix="Матрица 3×3",
                   product="Продукт", qty="Продажи", unit_cost="Цена за ед.",
                   sales_val="Выручка", share_pct="Доля %", cumul_pct="Накопл. %",
                   cv="CV", abc="ABC", xyz="XYZ", category="Категория", period="Период",
                   urgent="Срочное", important="Важное",
                   not_urgent="Не срочное", not_important="Не важное"),
        "pl": dict(data="Dane", matrix="Macierz 3×3",
                   product="Produkt", qty="Sprzedaż", unit_cost="Koszt jednostkowy",
                   sales_val="Wartość", share_pct="Udział %", cumul_pct="Skumulowany %",
                   cv="CV", abc="ABC", xyz="XYZ", category="Kategoria", period="Okres",
                   urgent="Pilne", important="Ważne",
                   not_urgent="Niepilne", not_important="Nieważne"),
        "en": dict(data="Data", matrix="3×3 Matrix",
                   product="Product", qty="Sales", unit_cost="Unit cost",
                   sales_val="Value", share_pct="Share %", cumul_pct="Cumulative %",
                   cv="CV", abc="ABC", xyz="XYZ", category="Category", period="Period",
                   urgent="Urgent", important="Important",
                   not_urgent="Not urgent", not_important="Not important"),
    }
    L = _L[lang]

    def _hdr(cell, v=""):
        cell.value = v; cell.fill = _HEADER_FILL; cell.font = _HEADER_FONT
        cell.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)

    wb = Workbook()

    ws1 = wb.active
    ws1.title = L["data"]
    if period_label:
        ws1.append([f'{L["period"]}: {period_label}'])
        ws1.cell(1, 1).font = Font(italic=True, color="595959")
        ws1.append([])

    headers = [L["product"], L["qty"], L["unit_cost"], L["sales_val"],
               L["share_pct"], L["cumul_pct"], L["cv"], L["abc"], L["xyz"], L["category"]]
    ws1.append(headers)
    for cell in ws1[ws1.max_row]:
        _hdr(cell, cell.value)

    for item in sorted(items, key=lambda i: (i.sales_value or 0), reverse=True):
        ws1.append([
            item.name, float(item.quantity), round(float(item.unit_cost), 2),
            round(item.sales_value or 0, 2), round((item.share_pct or 0) * 100),
            round((item.cumulative_pct or 0) * 100), round(item.cv or 0, 2),
            item.abc_class, item.xyz_class, item.category,
        ])
        row = ws1.max_row
        for col in (2, 3, 4, 5, 6, 7, 8, 9):
            ws1.cell(row, col).alignment = Alignment(horizontal="center", vertical="center")
        if item.abc_class in _LETTER_COLORS:
            color = _LETTER_COLORS[item.abc_class]
            ws1.cell(row, 8).fill = PatternFill(start_color=color, end_color=color, fill_type="solid")
        if item.xyz_class in _LETTER_COLORS:
            color = _LETTER_COLORS[item.xyz_class]
            ws1.cell(row, 9).fill = PatternFill(start_color=color, end_color=color, fill_type="solid")

    _autosize_columns(ws1)

    ws2 = wb.create_sheet(L["matrix"])
    ws2.append(["", "X", "Y", "Z"])
    for cell in ws2[1]:
        _hdr(cell, cell.value)

    by_cell = {(c["abc_class"], c["xyz_class"]): c["items"] for c in matrix}
    for row_idx, a in enumerate(("A", "B", "C"), start=2):
        ws2.cell(row=row_idx, column=1, value=a).font = Font(bold=True)
        max_lines = 1
        for col_idx, x in enumerate(("X", "Y", "Z"), start=2):
            names = by_cell.get((a, x), [])
            cell = ws2.cell(row=row_idx, column=col_idx,
                            value="\n".join(names) if names else "—")
            cell.fill = PatternFill(start_color=_ABC_XYZ_COLORS[(a, x)],
                                    end_color=_ABC_XYZ_COLORS[(a, x)], fill_type="solid")
            cell.alignment = Alignment(wrap_text=True, vertical="top")
            max_lines = max(max_lines, len(names) or 1)
        ws2.row_dimensions[row_idx].height = max(80, max_lines * 16 + 10)
    for col in ("A", "B", "C", "D"):
        ws2.column_dimensions[col].width = 28

    buffer = io.BytesIO()
    wb.save(buffer)
    return buffer.getvalue()


def export_swot_to_excel(result: dict, lang: str = "ru") -> bytes:
    from app.data.swot_questions import ACTIVITIES
    from openpyxl.chart import BarChart, RadarChart, Reference

    if lang not in ("ru", "pl", "en"):
        lang = "ru"

    _L = {
        "ru": dict(criteria="Критерии и веса", category="Категория", code="Код",
                   criterion="Критерий", weight="Вес", n="N", s="S", r="R",
                   waga="Вес", interactions="Взаимодействия",
                   results="Результаты NSR", pair="Пара",
                   strategy="Стратегическая позиция",
                   strat_col="Стратегия", pairs_col="Пары", dom_col="Доминирует",
                   dominant="✓", n_chart="N — кол-во взаимодействий",
                   s_chart="S — взвешенная сумма"),
        "pl": dict(criteria="Kryteria i wagi", category="Kategoria", code="Kod",
                   criterion="Kryterium", weight="Waga", n="N", s="S", r="R",
                   waga="Waga", interactions="Interakcje",
                   results="Wyniki NSR", pair="Para",
                   strategy="Pozycja strategiczna",
                   strat_col="Strategia", pairs_col="Pary", dom_col="Dominuje",
                   dominant="✓", n_chart="N — liczba interakcji",
                   s_chart="S — ważona suma"),
        "en": dict(criteria="Criteria & weights", category="Category", code="Code",
                   criterion="Criterion", weight="Weight", n="N", s="S", r="R",
                   waga="Weight", interactions="Interactions",
                   results="NSR results", pair="Pair",
                   strategy="Strategic position",
                   strat_col="Strategy", pairs_col="Pairs", dom_col="Dominant",
                   dominant="✓", n_chart="N — interaction count",
                   s_chart="S — weighted sum"),
    }
    L = _L[lang]

    _GROUP = {
        "S": {"ru": "Сильные стороны", "pl": "Mocne strony", "en": "Strengths"},
        "W": {"ru": "Слабые стороны", "pl": "Słabe strony", "en": "Weaknesses"},
        "O": {"ru": "Возможности", "pl": "Szanse", "en": "Opportunities"},
        "T": {"ru": "Угрозы", "pl": "Zagrożenia", "en": "Threats"},
    }
    def gname(g): return _GROUP.get(g, {}).get(lang, g)

    _PAIR_Q = {
        "S/O": {"ru": "Позволяет ли данная сильная сторона использовать данную возможность?",
                "pl": "Czy określona mocna strona pozwala wykorzystać daną szansę?",
                "en": "Does this strength allow exploiting this opportunity?"},
        "S/T": {"ru": "Позволяет ли данная сильная сторона нейтрализовать данную угрозу?",
                "pl": "Czy określona mocna strona pozwala ograniczyć dane zagrożenie?",
                "en": "Does this strength help neutralize this threat?"},
        "W/O": {"ru": "Позволяет ли данная возможность устранить данную слабую сторону?",
                "pl": "Czy określona słaba strona ogranicza możliwość wykorzystania danej szansy?",
                "en": "Does this opportunity help overcome this weakness?"},
        "W/T": {"ru": "Увеличивает ли данная слабая сторона уязвимость к данной угрозе?",
                "pl": "Czy określona słaba strona potęguje dane zagrożenie?",
                "en": "Does this weakness increase vulnerability to this threat?"},
        "O/S": {"ru": "Усиливает ли данная возможность данную сильную сторону?",
                "pl": "Czy określona szansa potęguje daną mocną stronę?",
                "en": "Does this opportunity enhance this strength?"},
        "O/W": {"ru": "Позволяет ли данная возможность преодолеть данную слабую сторону?",
                "pl": "Czy określona szansa pozwala osłabić daną słabą stronę?",
                "en": "Does this opportunity help overcome this weakness?"},
        "T/S": {"ru": "Ослабляет ли данная угроза данную сильную сторону?",
                "pl": "Czy określone zagrożenie ogranicza daną mocną stronę?",
                "en": "Does this threat weaken this strength?"},
        "T/W": {"ru": "Усугубляет ли данная угроза данную слабую сторону?",
                "pl": "Czy określone zagrożenie wzmacnia daną słabą stronę?",
                "en": "Does this threat deepen this weakness?"},
    }

    _STRAT = {
        "agresywna":     {"ru": "Агрессивная", "pl": "Agresywna", "en": "Aggressive"},
        "konserwatywna": {"ru": "Консервативная", "pl": "Konserwatywna", "en": "Conservative"},
        "konkurencyjna": {"ru": "Конкурентная", "pl": "Konkurencyjna", "en": "Competitive"},
        "defensywna":    {"ru": "Оборонительная", "pl": "Defensywna", "en": "Defensive"},
    }
    def strat_name(n): return _STRAT.get(n, {}).get(lang, n)

    activity_key = result.get("activity") or ""
    _name_map: dict = {}
    if activity_key in ACTIVITIES:
        for c in ACTIVITIES[activity_key].get("criteria", []):
            _name_map[c["code"]] = c["name"].get(lang, c["name"].get("en", c["code"]))
    def cn(code): return _name_map.get(code, code)

    _all_factors = (
        (result.get("s_factors") or []) + (result.get("w_factors") or []) +
        (result.get("o_factors") or []) + (result.get("t_factors") or [])
    )
    _all_weights = {f["code"]: float(f.get("weight", 0)) for f in _all_factors}

    _CAT_FILL  = PatternFill(start_color="2D2F45", end_color="2D2F45", fill_type="solid")
    _CAT_FONT  = Font(color="FFFFFF", bold=True, size=12)
    _DOM_FILL  = PatternFill(start_color="C6EFCE", end_color="C6EFCE", fill_type="solid")
    _ITR_FILL  = PatternFill(start_color="F2F2F2", end_color="F2F2F2", fill_type="solid")
    _ONE_FILL  = PatternFill(start_color="6366F1", end_color="6366F1", fill_type="solid")
    _ONE_FONT  = Font(bold=True, color="FFFFFF")
    _CENTER    = Alignment(horizontal="center", vertical="center")

    _RANK_FILLS = [
        PatternFill(start_color="63BE7B", end_color="63BE7B", fill_type="solid"),
        PatternFill(start_color="A9D18E", end_color="A9D18E", fill_type="solid"),
        PatternFill(start_color="FFEB84", end_color="FFEB84", fill_type="solid"),
        PatternFill(start_color="FFAA66", end_color="FFAA66", fill_type="solid"),
        PatternFill(start_color="F8696B", end_color="F8696B", fill_type="solid"),
    ]
    def set_rank(cell, rank):
        cell.alignment = _CENTER
        if isinstance(rank, int) and 1 <= rank <= 5:
            cell.fill = _RANK_FILLS[rank - 1]
            cell.font = Font(bold=True)

    def hdr_cell(cell, value=""):
        cell.value = value
        cell.fill = _HEADER_FILL; cell.font = _HEADER_FONT; cell.alignment = _CENTER

    wb = Workbook()

    ws1 = wb.active
    ws1.title = L["criteria"]
    ws1.append([L["category"], L["code"], L["criterion"], L["weight"]])
    for cell in ws1[1]:
        hdr_cell(cell, cell.value)
    ws1.row_dimensions[1].height = 20

    for key, cat in [("s_factors","S"),("w_factors","W"),("o_factors","O"),("t_factors","T")]:
        factors = result.get(key) or []
        if not factors: continue
        start_row = ws1.max_row + 1
        for f in factors:
            code = f.get("code","")
            ws1.append(["", code, cn(code), round(float(f.get("weight",0)), 2)])
            ws1.cell(ws1.max_row, 2).alignment = _CENTER
            ws1.cell(ws1.max_row, 4).alignment = _CENTER
        end_row = ws1.max_row
        ws1.merge_cells(start_row=start_row, start_column=1, end_row=end_row, end_column=1)
        c = ws1.cell(start_row, 1)
        c.value = cat; c.fill = _CAT_FILL; c.font = _CAT_FONT; c.alignment = _CENTER

    ws1.column_dimensions["A"].width = 12
    ws1.column_dimensions["B"].width = 8
    ws1.column_dimensions["C"].width = 42
    ws1.column_dimensions["D"].width = 10

    nsr = result.get("nsr") or {}
    grids = result.get("criteria") or {}

    for pair, pdata in nsr.items():
        rg, cg = pair.split("/")
        row_codes = [f"{rg}{i}" for i in range(1, 6)]
        col_codes = [f"{cg}{i}" for i in range(1, 6)]
        grid = grids.get(pair, [])
        rows_data = {r["code"]: r for r in pdata.get("rows", [])}
        cols_data = {c["code"]: c for c in pdata.get("cols", [])}
        N = 5
        TCOLS = 1 + N + 4

        ws = wb.create_sheet(f"{rg}-{cg}")

        ws.append([f"{gname(rg)} / {gname(cg)}"] + [""] * (TCOLS - 1))
        ws.merge_cells(start_row=1, start_column=1, end_row=1, end_column=TCOLS)
        c = ws.cell(1, 1)
        c.fill = _HEADER_FILL; c.font = Font(bold=True, size=13, color="FFFFFF"); c.alignment = _CENTER
        ws.row_dimensions[1].height = 22

        pq = _PAIR_Q.get(pair, {}).get(lang, "")
        ws.append([pq] + [""] * (TCOLS - 1))
        ws.merge_cells(start_row=2, start_column=1, end_row=2, end_column=TCOLS)
        c = ws.cell(2, 1)
        c.font = Font(italic=True, size=11, color="595959")
        c.fill = PatternFill(start_color="F2F2F2", end_color="F2F2F2", fill_type="solid")
        c.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
        ws.row_dimensions[2].height = 30

        hdr_row = [pair] + col_codes + [L["waga"], L["n"], L["s"], L["r"]]
        ws.append(hdr_row)
        for cell in ws[3]:
            hdr_cell(cell, cell.value)

        for ri, rc in enumerate(row_codes):
            rd = rows_data.get(rc, {})
            row_grid = [grid[ri][ci] if ri < len(grid) and ci < len(grid[ri]) else 0
                        for ci in range(N)]
            ws.append([rc] + row_grid + [
                round(_all_weights.get(rc, 0), 2),
                rd.get("n", 0),
                round(float(rd.get("s", 0)), 2),
                rd.get("r", ""),
            ])
            r = ws.max_row
            hdr_cell(ws.cell(r, 1), rc)
            for ci, val in enumerate(row_grid, start=2):
                c = ws.cell(r, ci); c.alignment = _CENTER
                if val == 1:
                    c.fill = _ONE_FILL; c.font = _ONE_FONT
            for ci in range(N + 2, N + 5):
                ws.cell(r, ci).alignment = _CENTER
            set_rank(ws.cell(r, N + 5), rd.get("r", ""))

        ws.append([L["waga"]] + [round(_all_weights.get(cc, 0), 2) for cc in col_codes] + ["","","",""])
        r = ws.max_row
        hdr_cell(ws.cell(r, 1), L["waga"])
        for ci in range(2, N + 2):
            ws.cell(r, ci).alignment = _CENTER

        ws.append([L["n"]] + [cols_data.get(cc, {}).get("n", 0) for cc in col_codes] + ["", pdata["total_n"],"",""])
        r = ws.max_row
        hdr_cell(ws.cell(r, 1), L["n"])
        for ci in range(2, N + 2):
            ws.cell(r, ci).alignment = _CENTER
        ws.cell(r, N + 3).font = Font(bold=True); ws.cell(r, N + 3).alignment = _CENTER

        ws.append([L["s"]] + [round(float(cols_data.get(cc, {}).get("s", 0)), 2) for cc in col_codes] + ["","", round(float(pdata["total_s"]), 2),""])
        r = ws.max_row
        hdr_cell(ws.cell(r, 1), L["s"])
        for ci in range(2, N + 2):
            ws.cell(r, ci).alignment = _CENTER
        ws.cell(r, N + 4).font = Font(bold=True); ws.cell(r, N + 4).alignment = _CENTER

        col_ranks = [cols_data.get(cc, {}).get("r", "") for cc in col_codes]
        ws.append([L["r"]] + col_ranks + ["","","",""])
        r = ws.max_row
        hdr_cell(ws.cell(r, 1), L["r"])
        for ci, rank in enumerate(col_ranks, start=2):
            set_rank(ws.cell(r, ci), rank)

        ws.append([])

        ws.append([L["interactions"]])
        c = ws.cell(ws.max_row, 1)
        c.font = Font(bold=True, size=11); c.fill = _ITR_FILL
        for ri, rc in enumerate(row_codes):
            for ci, cc in enumerate(col_codes):
                val = grid[ri][ci] if ri < len(grid) and ci < len(grid[ri]) else 0
                if val == 1:
                    ws.append([f"{rc}/{cc} — {cn(rc)} / {cn(cc)}"])
                    ws.cell(ws.max_row, 1).alignment = Alignment(horizontal="left", vertical="center")

        ws.column_dimensions["A"].width = 8
        for i in range(2, N + 2):
            ws.column_dimensions[get_column_letter(i)].width = 8
        for i in range(N + 2, N + 6):
            ws.column_dimensions[get_column_letter(i)].width = 9

    if nsr:
        ws_r = wb.create_sheet(L["results"])

        ws_r.append([L["pair"], L["n"], L["s"], L["dom_col"]])
        for cell in ws_r[1]:
            hdr_cell(cell, cell.value)

        dominant_pair = max(nsr.items(), key=lambda x: float(x[1]["total_s"]))[0]
        for pair, pdata in nsr.items():
            is_dom = (pair == dominant_pair)
            ws_r.append([pair, pdata["total_n"], round(float(pdata["total_s"]), 2), L["dominant"] if is_dom else ""])
            if is_dom:
                for cell in ws_r[ws_r.max_row]:
                    cell.fill = _DOM_FILL; cell.font = Font(bold=True)
            for cell in ws_r[ws_r.max_row]:
                cell.alignment = _CENTER

        table_end = ws_r.max_row
        chart_row  = table_end + 2

        ws_r.column_dimensions["A"].width = 14
        ws_r.column_dimensions["B"].width = 12
        ws_r.column_dimensions["C"].width = 12
        ws_r.column_dimensions["D"].width = 14

        bar_n = BarChart()
        bar_n.type = "col"; bar_n.grouping = "clustered"; bar_n.style = 10
        bar_n.title = L["n_chart"]; bar_n.width = 12; bar_n.height = 9
        n_data = Reference(ws_r, min_col=2, max_col=2, min_row=1, max_row=table_end)
        n_cats_bar = Reference(ws_r, min_col=1, min_row=2, max_row=table_end)
        bar_n.y_axis.scaling.min = 0
        bar_n.add_data(n_data, titles_from_data=True)
        bar_n.set_categories(n_cats_bar)
        ws_r.add_chart(bar_n, f"A{chart_row}")

        radar_s = RadarChart()
        radar_s.type = "marker"; radar_s.style = 10
        radar_s.title = L["s_chart"]; radar_s.width = 12; radar_s.height = 9
        s_data = Reference(ws_r, min_col=3, max_col=3, min_row=1, max_row=table_end)
        s_cats_radar = Reference(ws_r, min_col=1, min_row=2, max_row=table_end)
        radar_s.y_axis.scaling.min = 0
        radar_s.add_data(s_data, titles_from_data=True)
        radar_s.set_categories(s_cats_radar)
        ws_r.add_chart(radar_s, f"H{chart_row}")

    if result.get("strategy"):
        ws_s = wb.create_sheet(L["strategy"])
        ws_s.append([L["strat_col"], L["pairs_col"], L["n"], L["s"], L["dom_col"]])
        for cell in ws_s[1]:
            hdr_cell(cell, cell.value)

        dominant = result.get("dominant_strategy")
        for st in result["strategy"]:
            is_dom = (st["name"] == dominant)
            ws_s.append([
                strat_name(st["name"]), " + ".join(st["tables"]),
                st["total_n"], round(float(st["total_s"]), 2),
                L["dominant"] if is_dom else "",
            ])
            if is_dom:
                for c in ws_s[ws_s.max_row]:
                    c.fill = _DOM_FILL; c.font = Font(bold=True)
            for c in ws_s[ws_s.max_row]:
                c.alignment = _CENTER

        strat_end = ws_s.max_row
        chart_row_s = strat_end + 2

        ws_s.column_dimensions["A"].width = 22
        ws_s.column_dimensions["B"].width = 16
        ws_s.column_dimensions["C"].width = 10
        ws_s.column_dimensions["D"].width = 10
        ws_s.column_dimensions["E"].width = 14

        bar_sn = BarChart()
        bar_sn.type = "col"; bar_sn.grouping = "clustered"; bar_sn.style = 10
        bar_sn.title = L["n_chart"]; bar_sn.width = 12; bar_sn.height = 9
        sn_data = Reference(ws_s, min_col=3, max_col=3, min_row=1, max_row=strat_end)
        sn_cats_n = Reference(ws_s, min_col=1, min_row=2, max_row=strat_end)
        bar_sn.y_axis.scaling.min = 0
        bar_sn.add_data(sn_data, titles_from_data=True)
        bar_sn.set_categories(sn_cats_n)
        ws_s.add_chart(bar_sn, f"A{chart_row_s}")

        bar_ss = BarChart()
        bar_ss.type = "col"; bar_ss.grouping = "clustered"; bar_ss.style = 10
        bar_ss.title = L["s_chart"]; bar_ss.width = 12; bar_ss.height = 9
        ss_data = Reference(ws_s, min_col=4, max_col=4, min_row=1, max_row=strat_end)
        sn_cats_s = Reference(ws_s, min_col=1, min_row=2, max_row=strat_end)
        bar_ss.y_axis.scaling.min = 0
        bar_ss.add_data(ss_data, titles_from_data=True)
        bar_ss.set_categories(sn_cats_s)
        ws_s.add_chart(bar_ss, f"H{chart_row_s}")

    buffer = io.BytesIO()
    wb.save(buffer)
    return buffer.getvalue()

_QUADRANT_NAMES = {
    1: "Pilne i ważne",
    2: "Niepilne i ważne",
    3: "Pilne i nieważne",
    4: "Niepilne i nieważne",
}
_QUADRANT_COLORS = {1: "FFC7CE", 2: "C6EFCE", 3: "FFEB9C", 4: "D9E1F2"}


def export_eisenhower_to_excel(tasks, lang: str = "ru") -> bytes:
    if lang not in ("ru", "pl", "en"):
        lang = "ru"
    _L = {
        "ru": dict(tasks="Задачи", matrix="Матрица",
                   task="Задача", quadrant="Квадрант",
                   q1="Срочное + Важное", q2="Не срочное + Важное",
                   q3="Срочное + Не важное", q4="Не срочное + Не важное",
                   urgent="Срочное", not_urgent="Не срочное",
                   important="Важное", not_important="Не важное"),
        "pl": dict(tasks="Zadania", matrix="Macierz",
                   task="Tytuł", quadrant="Kwadrant",
                   q1="Pilne + Ważne", q2="Niepilne + Ważne",
                   q3="Pilne + Nieważne", q4="Niepilne + Nieważne",
                   urgent="Pilne", not_urgent="Niepilne",
                   important="Ważne", not_important="Nieważne"),
        "en": dict(tasks="Tasks", matrix="Matrix",
                   task="Task", quadrant="Quadrant",
                   q1="Urgent + Important", q2="Not urgent + Important",
                   q3="Urgent + Not important", q4="Not urgent + Not important",
                   urgent="Urgent", not_urgent="Not urgent",
                   important="Important", not_important="Not important"),
    }
    L = _L[lang]

    _Q_NAMES = {1: L["q1"], 2: L["q2"], 3: L["q3"], 4: L["q4"]}
    _Q_FILLS = {
        1: PatternFill(start_color="FFC7CE", end_color="FFC7CE", fill_type="solid"),
        2: PatternFill(start_color="C6EFCE", end_color="C6EFCE", fill_type="solid"),
        3: PatternFill(start_color="FFEB9C", end_color="FFEB9C", fill_type="solid"),
        4: PatternFill(start_color="D9E1F2", end_color="D9E1F2", fill_type="solid"),
    }

    def _hdr(cell, v=""):
        cell.value = v; cell.fill = _HEADER_FILL; cell.font = _HEADER_FONT
        cell.alignment = Alignment(horizontal="center", vertical="center")

    wb = Workbook()

    ws1 = wb.active
    ws1.title = L["tasks"]
    ws1.append([L["task"], L["quadrant"]])
    for cell in ws1[1]:
        _hdr(cell, cell.value)

    sorted_tasks = sorted(tasks, key=lambda t: (t.quadrant is None, t.quadrant or 0))
    for t in sorted_tasks:
        qname = _Q_NAMES.get(t.quadrant, "—") if t.quadrant else "—"
        ws1.append([t.title, qname])
        row = ws1.max_row
        ws1.cell(row, 1).alignment = Alignment(wrap_text=True, vertical="top")
        ws1.cell(row, 2).alignment = Alignment(wrap_text=True, vertical="top", horizontal="center")
        if t.quadrant and t.quadrant in _Q_FILLS:
            ws1.cell(row, 2).fill = _Q_FILLS[t.quadrant]

    _autosize_columns(ws1)

    ws2 = wb.create_sheet(L["matrix"])
    ws2.append(["", L["important"], L["not_important"]])
    for cell in ws2[1]:
        _hdr(cell, cell.value)

    for row_idx, label in [(2, L["urgent"]), (3, L["not_urgent"])]:
        c = ws2.cell(row_idx, 1, label)
        c.fill = _HEADER_FILL
        c.font = _HEADER_FONT
        c.alignment = Alignment(horizontal="center", vertical="center")

    by_quadrant: dict[int, list[str]] = {1: [], 2: [], 3: [], 4: []}
    for t in tasks:
        if t.quadrant:
            by_quadrant[t.quadrant].append(t.title)

    layout = {1: (2, 2), 2: (2, 3), 3: (3, 2), 4: (3, 3)}
    for q, (row, col) in layout.items():
        names = by_quadrant[q]
        cell = ws2.cell(row=row, column=col,
                        value="\n".join(names) if names else "—")
        cell.fill = _Q_FILLS[q]
        cell.alignment = Alignment(wrap_text=True, vertical="top", horizontal="center")

    ws2.column_dimensions["A"].width = 14
    ws2.column_dimensions["B"].width = 36
    ws2.column_dimensions["C"].width = 36
    for row in (2, 3):
        ws2.row_dimensions[row].height = 100

    buffer = io.BytesIO()
    wb.save(buffer)
    return buffer.getvalue()


def export_schedule_to_excel(tasks, timeline_start, timeline_end, stats: dict | None = None, lang: str = "ru") -> bytes:
    import datetime as _dt
    if lang not in ("ru", "pl", "en"):
        lang = "ru"

    _L = {
        "ru": dict(
            sheet="Расписание",
            num="№", task="Задача", responsible="Ответственный",
            start="Начало", end="Конец", progress="% Выполнено", status="Статус",
            done="✓ Выполнено", overdue="⚠ Просрочено",
            in_progress="В работе", pending="Ожидает",
            summary_title="Итого",
            total="Всего задач", completed="Выполнено", overdue_lbl="Просрочено",
        ),
        "pl": dict(
            sheet="Harmonogram",
            num="Nr", task="Zadanie", responsible="Odpowiedzialny",
            start="Początek", end="Koniec", progress="% Wykonania", status="Status",
            done="✓ Ukończone", overdue="⚠ Po terminie",
            in_progress="W toku", pending="Oczekuje",
            summary_title="Podsumowanie",
            total="Łącznie zadań", completed="Ukończone", overdue_lbl="Po terminie",
        ),
        "en": dict(
            sheet="Schedule",
            num="#", task="Task", responsible="Responsible",
            start="Start", end="End", progress="% Done", status="Status",
            done="✓ Done", overdue="⚠ Overdue",
            in_progress="In progress", pending="Pending",
            summary_title="Summary",
            total="Total tasks", completed="Completed", overdue_lbl="Overdue",
        ),
    }
    L = _L[lang]

    today = _dt.datetime.now(_dt.timezone.utc).date()

    wb = Workbook()
    ws = wb.active
    ws.title = L["sheet"]

    if not tasks:
        ws.append(["—"])
        buffer = io.BytesIO(); wb.save(buffer); return buffer.getvalue()

    done_fill     = PatternFill(start_color="C6EFCE", end_color="C6EFCE", fill_type="solid")
    overdue_fill  = PatternFill(start_color="FFC7CE", end_color="FFC7CE", fill_type="solid")
    progress_fill = PatternFill(start_color="FFEB9C", end_color="FFEB9C", fill_type="solid")
    summary_fill  = PatternFill(start_color="E2EFDA", end_color="E2EFDA", fill_type="solid")

    headers = [L["num"], L["task"], L["responsible"], L["start"], L["end"], L["progress"], L["status"]]
    ws.append(headers)
    for cell in ws[1]:
        cell.fill = _HEADER_FILL
        cell.font = _HEADER_FONT
        cell.alignment = Alignment(horizontal="center", wrap_text=True)

    n_done = n_overdue = n_progress = n_pending = 0
    for idx, t in enumerate(tasks):
        is_done     = t.progress >= 100
        is_overdue  = (not is_done) and t.end_date <= today
        is_progress = (not is_done) and (not is_overdue) and t.progress > 0

        if is_done:        status_label = L["done"];        n_done += 1
        elif is_overdue:   status_label = L["overdue"];     n_overdue += 1
        elif is_progress:  status_label = L["in_progress"]; n_progress += 1
        else:              status_label = L["pending"];      n_pending += 1

        row = [
            idx + 1,
            t.title,
            t.responsible or "",
            t.start_date.strftime("%d.%m.%Y") if t.start_date else "",
            t.end_date.strftime("%d.%m.%Y")   if t.end_date   else "",
            t.progress,
            status_label,
        ]
        ws.append(row)
        data_row = ws.max_row

        for col in range(1, 8):
            ws.cell(row=data_row, column=col).alignment = Alignment(
                wrap_text=True, vertical="top"
            )

        status_cell = ws.cell(row=data_row, column=7)
        if is_done:
            status_cell.fill = done_fill
            status_cell.font = Font(color="276221", bold=True)
        elif is_overdue:
            status_cell.fill = overdue_fill
            status_cell.font = Font(color="9C0006", bold=True)
        elif is_progress:
            status_cell.fill = progress_fill
            status_cell.font = Font(color="7D6608")

        status_cell.alignment = Alignment(horizontal="center", wrap_text=True, vertical="top")

        ws.cell(row=data_row, column=1).alignment = Alignment(horizontal="center", vertical="top")
        ws.cell(row=data_row, column=6).alignment = Alignment(horizontal="right", vertical="top")

    total = len(tasks)
    summary_rows = [
        (L["summary_title"], ""),
        (L["total"],      total),
        (L["completed"],  n_done),
        (L["overdue_lbl"], n_overdue),
    ]
    ws.append([])
    for label, value in summary_rows:
        ws.append(["", label, value])
        r = ws.max_row
        label_cell = ws.cell(row=r, column=2)
        value_cell = ws.cell(row=r, column=3)
        label_cell.fill = summary_fill
        value_cell.fill = summary_fill
        label_cell.font = Font(bold=True)
        label_cell.alignment = Alignment(wrap_text=True, vertical="top")
        value_cell.alignment = Alignment(horizontal="center", vertical="top")
        if label == L["summary_title"]:
            label_cell.font = Font(bold=True, color="276221")

    ws.column_dimensions["A"].width = 6
    ws.column_dimensions["B"].width = 34
    ws.column_dimensions["C"].width = 20
    ws.column_dimensions["D"].width = 13
    ws.column_dimensions["E"].width = 13
    ws.column_dimensions["F"].width = 13
    ws.column_dimensions["G"].width = 16

    buffer = io.BytesIO()
    wb.save(buffer)
    return buffer.getvalue()


def export_punktowa_to_excel(state: dict, lang: str = "ru") -> bytes:
    from openpyxl.chart import RadarChart, Reference
    if lang not in ("ru", "pl", "en"):
        lang = "ru"

    _L = {
        "ru": dict(
            sh_criteria="Критерии",
            sh_scores="Таблица оценок",
            sh_ranking="Рейтинг",
            lp="№", criterion="Критерий", weight="Вес", scale="Шкала",
            avg_arith="Метод средней арифметической",
            avg_weighted="Метод взвешенной средней",
            pct="Процентный метод", rank="Ранг", subject="Объект",
            weight_total="Сумма весов",
        ),
        "pl": dict(
            sh_criteria="Kryteria",
            sh_scores="Tabela ocen",
            sh_ranking="Ranking",
            lp="Nr", criterion="Kryterium", weight="Waga", scale="Skala",
            avg_arith="Metoda średniej arytmetycznej",
            avg_weighted="Metoda średniej ważonej",
            pct="Metoda procentowa", rank="Ranga", subject="Obiekt",
            weight_total="Suma wag",
        ),
        "en": dict(
            sh_criteria="Criteria",
            sh_scores="Scores table",
            sh_ranking="Ranking",
            lp="#", criterion="Criterion", weight="Weight", scale="Scale",
            avg_arith="Arithmetic average",
            avg_weighted="Weighted average",
            pct="Percentage method", rank="Rank", subject="Object",
            weight_total="Weight total",
        ),
    }
    L = _L[lang]

    criteria = state["criteria"]
    subjects = state["subjects"]
    scores   = state["scores"]
    results  = state.get("results") or []
    scale_min = state.get("scale_min", 1)
    scale_max = state.get("scale_max", 5)

    _RANK_FILLS = [
        PatternFill(start_color="4CAF50", end_color="4CAF50", fill_type="solid"),
        PatternFill(start_color="8BC34A", end_color="8BC34A", fill_type="solid"),
        PatternFill(start_color="FF9800", end_color="FF9800", fill_type="solid"),
        PatternFill(start_color="EF6C00", end_color="EF6C00", fill_type="solid"),
        PatternFill(start_color="F44336", end_color="F44336", fill_type="solid"),
    ]
    _WINNER_FILL = PatternFill(start_color="DCEEFB", end_color="DCEEFB", fill_type="solid")
    _FOOT_FILL   = PatternFill(start_color="F0F4FF", end_color="F0F4FF", fill_type="solid")
    _CENTER = Alignment(horizontal="center", vertical="center", wrap_text=True)

    def rank_fill(rank: int) -> PatternFill:
        idx = min(rank - 1, len(_RANK_FILLS) - 1)
        return _RANK_FILLS[idx]

    def rank_font(rank: int) -> Font:
        return Font(bold=True, color="FFFFFF")

    def _hdr(cell, v=""):
        cell.value = v; cell.fill = _HEADER_FILL; cell.font = _HEADER_FONT
        cell.alignment = _CENTER

    wb = Workbook()

    ws1 = wb.active
    ws1.title = L["sh_criteria"]

    ws1.append([L["lp"], L["criterion"], L["weight"]])
    for cell in ws1[1]:
        _hdr(cell, cell.value)

    for i, c in enumerate(criteria, start=1):
        ws1.append([i, c.name, round(float(c.weight), 2)])
        ws1.cell(ws1.max_row, 1).alignment = _CENTER
        ws1.cell(ws1.max_row, 2).alignment = Alignment(horizontal="left", vertical="center", wrap_text=True)
        ws1.cell(ws1.max_row, 3).alignment = _CENTER

    total_w = round(sum(float(c.weight) for c in criteria), 2)
    ws1.append(["", L["weight_total"], total_w])
    r = ws1.max_row
    ws1.cell(r, 2).font = Font(bold=True)
    ws1.cell(r, 3).font = Font(bold=True)
    ws1.cell(r, 3).alignment = _CENTER
    ws1.cell(r, 2).fill = _FOOT_FILL
    ws1.cell(r, 3).fill = _FOOT_FILL

    ws1.column_dimensions["A"].width = 6
    ws1.column_dimensions["B"].width = 36
    ws1.column_dimensions["C"].width = 10

    ws2 = wb.create_sheet(L["sh_scores"])

    ws2.append([f"{L['scale']}: {scale_min} – {scale_max}"])
    ws2.cell(1, 1).font = Font(italic=True, bold=True, color="595959")
    ws2.append([])

    winner_ids = {r["subject_id"] for r in results if r.get("rank") == 1}
    results_by_subj = {r["subject_id"]: r for r in results}

    subj_order = list(subjects)

    hdr_row = [L["lp"], L["criterion"], L["weight"]] + [s.name for s in subj_order]
    ws2.append(hdr_row)
    for cell in ws2[ws2.max_row]:
        _hdr(cell, cell.value)

    hdr_row_idx = ws2.max_row
    for col_i, s in enumerate(subj_order, start=4):
        if s.id in winner_ids:
            ws2.cell(hdr_row_idx, col_i).fill = PatternFill(
                start_color="C6EFCE", end_color="C6EFCE", fill_type="solid")
            ws2.cell(hdr_row_idx, col_i).font = Font(bold=True, color="276221")

    for i, c in enumerate(criteria, start=1):
        row = [i, c.name, round(float(c.weight), 2)]
        for s in subj_order:
            row.append(scores.get(f"{c.id}/{s.id}", ""))
        ws2.append(row)
        ri = ws2.max_row
        ws2.cell(ri, 1).alignment = _CENTER
        ws2.cell(ri, 2).alignment = Alignment(horizontal="left", vertical="center", wrap_text=True)
        ws2.cell(ri, 3).alignment = _CENTER
        for col_i, s in enumerate(subj_order, start=4):
            ws2.cell(ri, col_i).alignment = _CENTER
            if s.id in winner_ids:
                ws2.cell(ri, col_i).fill = _WINNER_FILL

    data_end_row = ws2.max_row

    ws2.append([])

    if results:
        for label, key, fmt in [
            (L["avg_arith"],    "avg_arithmetic", lambda v: round(float(v), 2)),
            (L["avg_weighted"], "avg_weighted",   lambda v: round(float(v), 2)),
            (L["pct"],          "percentage",     lambda v: f"{_smart_fmt(float(v))}%"),
            (L["rank"],         "rank",           lambda v: int(v)),
        ]:
            row = ["", label, ""] + [
                fmt(results_by_subj[s.id][key]) if s.id in results_by_subj else ""
                for s in subj_order
            ]
            ws2.append(row)
            ri = ws2.max_row
            ws2.cell(ri, 2).font = Font(bold=True)
            ws2.cell(ri, 2).fill = _FOOT_FILL
            ws2.cell(ri, 3).fill = _FOOT_FILL
            for col_i, s in enumerate(subj_order, start=4):
                ws2.cell(ri, col_i).alignment = _CENTER
                ws2.cell(ri, col_i).fill = _FOOT_FILL
                if key == "rank" and s.id in results_by_subj:
                    rk = int(results_by_subj[s.id]["rank"])
                    ws2.cell(ri, col_i).fill = rank_fill(rk)
                    ws2.cell(ri, col_i).font = rank_font(rk)
                elif s.id in winner_ids:
                    ws2.cell(ri, col_i).fill = _WINNER_FILL
                    ws2.cell(ri, col_i).font = Font(bold=True)

    ws2.column_dimensions["A"].width = 6
    ws2.column_dimensions["B"].width = 36
    ws2.column_dimensions["C"].width = 8
    for col_i in range(4, 4 + len(subj_order)):
        ws2.column_dimensions[get_column_letter(col_i)].width = 16
    ws2.row_dimensions[hdr_row_idx].height = 40

    top_ids = state.get("top_subjects") or []
    if not top_ids and results:
        top_ids = [r["subject_id"] for r in sorted(results, key=lambda r: r["rank"])[:2]]
    top_subjs = [s for s in subj_order if s.id in top_ids]
    if top_subjs and criteria:
        chart_anchor_row = ws2.max_row + 2
        radar = RadarChart()
        radar.type = "marker"; radar.style = 10
        radar.width = 12; radar.height = 9
        for s in top_subjs:
            col_i = subj_order.index(s) + 4
            series_ref = Reference(ws2, min_col=col_i, max_col=col_i,
                                   min_row=hdr_row_idx, max_row=data_end_row)
            radar.add_data(series_ref, titles_from_data=True)
        cats_ref = Reference(ws2, min_col=2, min_row=hdr_row_idx + 1, max_row=data_end_row)
        radar.set_categories(cats_ref)
        radar.y_axis.scaling.min = 0
        ws2.add_chart(radar, f"A{chart_anchor_row}")

    if results:
        ws3 = wb.create_sheet(L["sh_ranking"])
        rank_headers = [L["rank"], L["subject"], L["avg_arith"], L["avg_weighted"], L["pct"]]
        ws3.append(rank_headers)
        for cell in ws3[1]:
            _hdr(cell, cell.value)

        sorted_results = sorted(results, key=lambda r: r["rank"])
        for r in sorted_results:
            rk = int(r["rank"])
            ws3.append([
                rk,
                r.get("subject_name", ""),
                round(float(r["avg_arithmetic"]), 2),
                round(float(r["avg_weighted"]), 4),
                f"{round(float(r['percentage']), 1)}%",
            ])
            ri = ws3.max_row
            ws3.cell(ri, 1).fill = rank_fill(rk)
            ws3.cell(ri, 1).font = Font(bold=True, color="FFFFFF")
            ws3.cell(ri, 1).alignment = _CENTER
            if rk == 1:
                for col_i in range(1, 6):
                    ws3.cell(ri, col_i).fill = _WINNER_FILL
                ws3.cell(ri, 1).fill = rank_fill(rk)
                ws3.cell(ri, 1).font = Font(bold=True, color="FFFFFF")
            for col_i in range(3, 6):
                ws3.cell(ri, col_i).alignment = _CENTER

        ws3.column_dimensions["A"].width = 8
        ws3.column_dimensions["B"].width = 30
        ws3.column_dimensions["C"].width = 14
        ws3.column_dimensions["D"].width = 14
        ws3.column_dimensions["E"].width = 10

    buffer = io.BytesIO()
    wb.save(buffer)
    return buffer.getvalue()


def export_audyt_to_excel(session, criteria, scores, results, lang: str = "ru") -> bytes:
    from openpyxl.chart import RadarChart, Reference
    if lang not in ("ru", "pl", "en"):
        lang = "ru"
    _L = {
        "ru": dict(
            sh_scores="Оценки", sh_criteria="Критерии", sh_params="Параметры",
            criterion="Критерий", auditor="Аудитор", criteria_hdr="Критерии",
            total="Сумма", avg="Среднее", pct="Шкала %", status="Статус",
            accepted="Принято", rejected="Отклонено", no_data="Нет данных",
            chart_title="Аудит — результаты",
            p_scale="Шкала", p_auditors="Кол-во аудиторов",
            p_crit_pct="Принятие критерия %", p_sys_pct="Принятие системы %",
            p_value="Значение",
        ),
        "pl": dict(
            sh_scores="Oceny", sh_criteria="Kryteria", sh_params="Parametry",
            criterion="Kryterium", auditor="Audytor", criteria_hdr="Kryteria",
            total="Suma", avg="Średnia", pct="Skala %", status="Status",
            accepted="Przyjęto", rejected="Odrzucono", no_data="Brak danych",
            chart_title="Audyt — wyniki",
            p_scale="Skala", p_auditors="Liczba audytorów",
            p_crit_pct="Akceptacja kryterium %", p_sys_pct="Akceptacja systemu %",
            p_value="Wartość",
        ),
        "en": dict(
            sh_scores="Scores", sh_criteria="Criteria", sh_params="Parameters",
            criterion="Criterion", auditor="Auditor", criteria_hdr="Criteria",
            total="Sum", avg="Average", pct="Scale %", status="Status",
            accepted="Accepted", rejected="Rejected", no_data="No data",
            chart_title="Audit — results",
            p_scale="Scale", p_auditors="Auditor count",
            p_crit_pct="Criterion acceptance %", p_sys_pct="System acceptance %",
            p_value="Value",
        ),
    }
    L = _L[lang]

    num_auditors = int(session.num_auditors)
    scale_min = int(session.scale_min)
    scale_max = int(session.scale_max)
    crit_threshold = float(session.criterion_acceptance_pct)
    sys_threshold  = float(session.system_acceptance_pct)
    red_threshold  = scale_max * crit_threshold / 100

    scores_idx: dict = {}
    for s in scores:
        if s.auditor_number <= num_auditors:
            scores_idx[(s.criterion_id, s.auditor_number)] = float(s.score)

    smart_fmt = _smart_fmt

    def _hdr(cell, v=""):
        cell.value = v
        cell.fill = _HEADER_FILL
        cell.font = _HEADER_FONT
        cell.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)

    _GREEN = PatternFill(start_color="C6EFCE", end_color="C6EFCE", fill_type="solid")
    _RED   = PatternFill(start_color="FFC7CE", end_color="FFC7CE", fill_type="solid")

    crit_stats = []
    for c in criteria:
        crit_scores = [
            scores_idx[(c.id, i)]
            for i in range(1, num_auditors + 1)
            if (c.id, i) in scores_idx
        ]
        if crit_scores:
            s_sum = sum(crit_scores)
            s_avg = s_sum / num_auditors
            s_pct = round(s_avg / scale_max * 100, 2) if scale_max else 0.0
            s_ok  = s_pct >= crit_threshold
            crit_stats.append({"sum": s_sum, "avg": s_avg, "pct": s_pct, "accepted": s_ok})
        else:
            crit_stats.append({"sum": None, "avg": None, "pct": None, "accepted": None})

    wb = Workbook()

    ws1 = wb.active
    ws1.title = L["sh_params"]
    ws1.append([L["sh_params"], L["p_value"]])
    for cell in ws1[1]:
        _hdr(cell, cell.value)

    for label, val in [
        (L["p_scale"],    f"{scale_min} – {scale_max}"),
        (L["p_auditors"], str(num_auditors)),
        (L["p_crit_pct"], smart_fmt(crit_threshold) + "%"),
        (L["p_sys_pct"],  smart_fmt(sys_threshold) + "%"),
    ]:
        ws1.append([label, val])
        ri = ws1.max_row
        ws1.cell(ri, 2).alignment = Alignment(horizontal="center", vertical="center")

    ws1.column_dimensions["A"].width = 30
    ws1.column_dimensions["B"].width = 20

    ws2 = wb.create_sheet(L["sh_scores"])
    n_crit = len(criteria)

    corner = ws2.cell(1, 1, L["criteria_hdr"])
    corner.fill = _HEADER_FILL
    corner.font = _HEADER_FONT
    corner.alignment = Alignment(horizontal="center", vertical="center")
    ws2.merge_cells(start_row=1, start_column=1, end_row=2, end_column=2)

    _INDIGO_FONT = Font(color="9999FF", bold=True)
    for ci in range(n_crit):
        cell = ws2.cell(1, 3 + ci, ci + 1)
        cell.fill = _HEADER_FILL
        cell.font = _INDIGO_FONT
        cell.alignment = Alignment(horizontal="center", vertical="center")

    _NAME_FONT = Font(color="AAAAAA", size=8)
    for ci, c in enumerate(criteria):
        cell = ws2.cell(2, 3 + ci, c.name)
        cell.fill = _HEADER_FILL
        cell.font = _NAME_FONT
        cell.alignment = Alignment(horizontal="center", vertical="bottom", wrap_text=True)

    BODY_START = 3
    _GREY_FONT  = Font(color="000000")
    _GREY_BOLD  = Font(color="000000", bold=True)
    for ai in range(num_auditors):
        r = BODY_START + ai
        if ai == 0:
            lbl = ws2.cell(r, 1, L["auditor"])
            lbl.font = _GREY_BOLD
            lbl.alignment = Alignment(horizontal="center", vertical="center")
            ws2.merge_cells(
                start_row=BODY_START, start_column=1,
                end_row=BODY_START + num_auditors - 1, end_column=1,
            )
        num_cell = ws2.cell(r, 2, ai + 1)
        num_cell.font = _GREY_FONT
        num_cell.alignment = Alignment(horizontal="center", vertical="center")

        for ci, c in enumerate(criteria):
            val = scores_idx.get((c.id, ai + 1))
            sc = ws2.cell(r, 3 + ci)
            if val is not None:
                sc.value = val
                if val <= red_threshold:
                    sc.fill = _RED
                    sc.font = Font(color="9C0006", bold=True)
            else:
                sc.value = "—"
            sc.alignment = Alignment(horizontal="center", vertical="center")

    FOOTER_START = BODY_START + num_auditors
    footer_defs = [
        (L["total"],  lambda st: round(st["sum"])              if st["sum"]  is not None else "—"),
        (L["avg"],    lambda st: smart_fmt(st["avg"])          if st["avg"]  is not None else "—"),
        (L["pct"],    lambda st: st["pct"]                      if st["pct"]  is not None else "—"),
        (L["status"], lambda st: (L["accepted"] if st["accepted"] else L["rejected"])
                                 if st["accepted"] is not None else L["no_data"]),
    ]
    PCT_ROW = FOOTER_START + 2
    for fi, (label, fn) in enumerate(footer_defs):
        r = FOOTER_START + fi
        lbl = ws2.cell(r, 1, label)
        lbl.fill = _HEADER_FILL
        lbl.font = _HEADER_FONT
        lbl.alignment = Alignment(horizontal="center", vertical="center")
        ws2.merge_cells(start_row=r, start_column=1, end_row=r, end_column=2)

        for ci, st in enumerate(crit_stats):
            val = fn(st)
            cell = ws2.cell(r, 3 + ci, val)
            cell.font = Font(bold=True)
            cell.alignment = Alignment(horizontal="center", vertical="center")
            if r == PCT_ROW and isinstance(val, float):
                cell.number_format = '0.##"%"'
            if label == L["status"]:
                if st["accepted"] is True:
                    cell.fill = _GREEN
                    cell.font = Font(bold=True, color="006100")
                elif st["accepted"] is False:
                    cell.fill = _RED
                    cell.font = Font(bold=True, color="9C0006")

    ws2.column_dimensions["A"].width = 14
    ws2.column_dimensions["B"].width = 6
    for ci in range(n_crit):
        ws2.column_dimensions[get_column_letter(3 + ci)].width = 12
    ws2.row_dimensions[2].height = 40

    chart_row = FOOTER_START + len(footer_defs) + 2
    radar = RadarChart()
    radar.type = "marker"; radar.style = 10
    radar.title = None
    radar.width = 12; radar.height = 9
    data_ref = Reference(ws2, min_col=3, max_col=2 + n_crit,
                         min_row=PCT_ROW, max_row=PCT_ROW)
    cats = Reference(ws2, min_col=3, max_col=2 + n_crit, min_row=2, max_row=2)
    radar.add_data(data_ref, from_rows=True, titles_from_data=False)
    radar.set_categories(cats)
    radar.y_axis.scaling.min = 0
    ws2.add_chart(radar, f"A{chart_row}")

    ws3 = wb.create_sheet(L["sh_criteria"])
    for cell in ws3.append(["#", L["criterion"], L["total"], L["avg"], L["pct"], L["status"]]) or ws3[1]:
        _hdr(cell, cell.value)

    for idx, (c, st) in enumerate(zip(criteria, crit_stats)):
        ws3.append([
            idx + 1,
            c.name,
            round(st["sum"]) if st["sum"] is not None else "—",
            smart_fmt(st["avg"]) if st["avg"] is not None else "—",
            (smart_fmt(st["pct"]) + "%") if st["pct"] is not None else "—",
            (L["accepted"] if st["accepted"] else L["rejected"]) if st["accepted"] is not None else L["no_data"],
        ])
        ri = ws3.max_row
        ws3.cell(ri, 2).alignment = Alignment(horizontal="left", vertical="center", wrap_text=True)
        for col in (1, 3, 4, 5, 6):
            ws3.cell(ri, col).alignment = Alignment(horizontal="center", vertical="center")
        if st["accepted"] is True:
            ws3.cell(ri, 6).fill = _GREEN
            ws3.cell(ri, 6).font = Font(bold=True, color="006100")
        elif st["accepted"] is False:
            ws3.cell(ri, 6).fill = _RED
            ws3.cell(ri, 6).font = Font(bold=True, color="9C0006")

    ws3.column_dimensions["A"].width = 6
    ws3.column_dimensions["B"].width = 40
    ws3.column_dimensions["C"].width = 10
    ws3.column_dimensions["D"].width = 10
    ws3.column_dimensions["E"].width = 10
    ws3.column_dimensions["F"].width = 14

    buffer = io.BytesIO()
    wb.save(buffer)
    return buffer.getvalue()
