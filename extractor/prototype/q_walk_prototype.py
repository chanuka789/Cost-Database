import csv, re, sys
import pdfplumber

PDF = sys.argv[1]
GAP = 15  # vertical gap (pt) that ends a text block


def page_lines(pg):
    words = pg.extract_words(extra_attrs=["fontname", "size"], x_tolerance=1)
    hdr = {w["text"]: w for w in words if 80 < w["top"] < 105}
    if "QUANTITY" not in hdr:
        return None, None
    cols = {
        "desc": hdr["NO"]["x1"] + 5,
        "qty": hdr["QUANTITY"]["x0"] - 15,
        "unit": hdr["UNIT"]["x0"] - 6,
        "rate": hdr["RATE"]["x0"] - 15,
        "amount": hdr["AMOUNT"]["x0"] - 15,
    }
    lines = []
    for w in sorted(words, key=lambda w: (w["top"], w["x0"])):
        if w["top"] < 105 or "CARRIED" in w["text"]:
            continue
        if lines and abs(w["top"] - lines[-1]["top"]) < 4:
            lines[-1]["words"].append(w)
        else:
            lines.append({"top": w["top"], "words": [w]})
    out = []
    for ln in lines:
        d = {"top": ln["top"], "item": [], "desc": [], "qty": [], "unit": [], "bold": False}
        for w in ln["words"]:
            x = w["x0"]
            if x < cols["desc"]:
                d["item"].append(w["text"])
            elif x < cols["qty"]:
                d["desc"].append(w["text"])
                d["bold"] |= "Bold" in w["fontname"]
            elif x < cols["unit"]:
                d["qty"].append(w["text"])
            elif x < cols["rate"]:
                d["unit"].append(w["text"])
        if "".join(d["desc"]).startswith("CARRIED") or re.fullmatch(r"B\d+/", "".join(d["desc"])):
            continue
        out.append(d)
    return cols, out


def extract(path):
    rows, bill, heading, main, cur = [], None, None, [], None
    last_top, block_is_main = None, False
    with pdfplumber.open(path) as pdf:
        for pno, pg in enumerate(pdf.pages, 1):
            text = pg.extract_text() or ""
            m = re.search(r"BILL NO\. (\d+) - (.+)", text)
            if m:
                bill = f"{m.group(1)} - {m.group(2).strip()}"
            if "COLLECTION" in text.split("\n")[3:6].__str__():
                continue
            cols, lines = page_lines(pg)
            if not lines:
                continue
            last_top = None
            block = []  # text lines (desc, bold) not belonging to an item

            def flush():
                # a text block is either a heading (one short line), heading + main, or main only
                nonlocal heading, main
                if not block:
                    return
                if len(block) == 1 and (block[0][1] or len(block[0][0]) < 60):
                    heading, main = block[0][0], []
                elif block[0][1] and not block[1][1]:
                    heading, main = block[0][0], [b[0] for b in block[1:]]
                else:
                    main = [b[0] for b in block]
                block.clear()

            for d in lines:
                desc = " ".join(d["desc"])
                gap = last_top is None or d["top"] - last_top > GAP
                last_top = d["top"]
                if d["item"]:  # new measured item
                    flush()
                    cur = {"page": pno, "bill": bill, "heading": heading,
                           "main": " ".join(main), "item": " ".join(d["item"]),
                           "desc": [desc] if desc else [], "qty": d["qty"], "unit": d["unit"]}
                    rows.append(cur)
                    block_is_main = False
                    continue
                if cur and not gap and not d["bold"]:  # continuation of item
                    if desc: cur["desc"].append(desc)
                    cur["qty"] += d["qty"]; cur["unit"] += d["unit"]
                    continue
                if not desc:
                    if cur: cur["qty"] += d["qty"]; cur["unit"] += d["unit"]
                    continue
                cur = None
                if gap:
                    flush()
                block.append((desc, d["bold"]))
            flush()
    for r in rows:
        r["desc"] = " ".join(r["desc"])
        r["main"] = re.sub(r"\s+", " ", r["main"])
        r["qty"] = "".join(r["qty"]).replace(",", "")
        # superscript '2'/'3' after m -> m2 / m3
        r["unit"] = "".join(r["unit"])
        r["unit"] = re.sub(r"^(\d)m$", r"m\1", r["unit"])
        r["full"] = " | ".join(x for x in (r["heading"], r["main"], r["desc"]) if x)
    return rows


rows = extract(PDF)
with open("items.csv", "w", newline="", encoding="utf-8-sig") as f:
    w = csv.DictWriter(f, fieldnames=["page", "bill", "item", "heading", "main", "desc", "qty", "unit", "full"])
    w.writeheader()
    for r in rows:
        w.writerow({k: r[k] for k in w.fieldnames})
print(len(rows), "items")
