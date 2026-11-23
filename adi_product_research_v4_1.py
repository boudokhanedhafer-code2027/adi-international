#!/usr/bin/env python3
"""ADI INTERNATIONAL Product Research V4.1 — research only.

No purchases, supplier contact, spending, or publishing.
Search-result snippets are leads only; no product, seller, shipping, stock,
condition, MOQ, or destination-cost facts are independently verified here.
Requires TAVILY_API_KEY. Uses indicative static FX rates; update them before use.
"""
import os
import re
import json
import time
import hashlib
import urllib.request
import urllib.error
from datetime import datetime, timezone
from pathlib import Path


API_KEY = os.getenv("TAVILY_API_KEY", "").strip()
REPORT_DIR = Path("reports")
ARCHIVE_DIR = REPORT_DIR / "archive"
MAX_RESULTS_PER_QUERY = 8
MAX_PER_CATEGORY = 10
MARKUP_RATE = 0.30  # simulation only: 30% added to a detected price, not a verified margin

# Indicative conversion rates: units of foreign currency per 1 EUR.
# Static estimates are intentionally labeled; update these manually before using.
FX_PER_EUR = {
    "EUR": 1.0, "USD": 1.09, "GBP": 0.85, "AED": 4.00,
    "CNY": 7.80, "RMB": 7.80, "JPY": 160.0, "TRY": 35.0,
    "TND": 3.35, "CAD": 1.48, "AUD": 1.65,
}

CATEGORIES = {
    "Maison": [
        "home organization storage product item supplier price listing",
        "compact home improvement accessories product page price",
        "household cleaning organization accessories product listing",
    ],
    "Cuisine": [
        "kitchen utensils organization accessories individual product price",
        "kitchen gadgets household practical product supplier listing",
        "food storage kitchen accessories product page price",
    ],
    "Electronique": [
        "consumer electronics accessories non regulated product price listing",
        "phone computer accessories product supplier listing price",
        "USB cables adapters stands electronic accessories product page",
    ],
    "Auto": [
        "non safety critical automotive interior accessories product price",
        "car storage convenience accessories supplier listing",
        "vehicle organizers accessories product page price",
    ],
    "Mode": [
        "bags backpacks everyday fashion accessories product listing price",
        "travel bags accessories supplier product page",
        "fashion accessories individual product price listing",
    ],
    "Loisirs": [
        "hobby leisure travel accessories individual product listing price",
        "outdoor camping non safety accessories product supplier price",
        "recreation accessories product page price listing",
    ],
    "Bureau": [
        "desk organization stationery office accessories product price",
        "office supplies storage accessories product listing",
        "workspace accessories supplier product page price",
    ],
}

EXCLUDE_RE = re.compile(
    r"\b(weapon|firearm|gun|ammunition|ammo|knife|knives|sword|switchblade|taser|"
    r"pepper spray|mace|explosive|firework|poison|pesticide|toxic|radioactive|drug|"
    r"cannabis|marijuana|thc|cbd|alcohol|beer|wine|liquor|cigarette|tobacco|nicotine|"
    r"vape|adult toy|sex toy|porn|casino|gambling|steroid|hormone)\b", re.I
)

# Price parsing only recognizes an explicit supported currency marker.
PRICE_RE = re.compile(
    r"(?P<symbol>US\$|\$|€|£)\s*(?P<amount>\d{1,6}(?:[.,]\d{1,2})?)"
    r"|(?P<amount2>\d{1,6}(?:[.,]\d{1,2})?)\s*(?P<code>USD|EUR|GBP|AED|CNY|RMB|JPY|TND|CAD|AUD)\b",
    re.I,
)
SYMBOL_CURRENCY = {"$": "USD", "US$": "USD", "€": "EUR", "£": "GBP"}


def normalize_title(title):
    return re.sub(r"[^a-z0-9]+", " ", (title or "").lower()).strip()


def safe_url(url):
    url = (url or "").strip()
    return url if url.startswith("https://") else ""


def md_escape(value):
    return str(value or "").replace("|", "\\|").replace("\n", " ").strip()


def parse_amount(raw):
    raw = raw.strip().replace(" ", "")
    # Treat comma as decimal only when followed by 1-2 digits and no dot.
    if "," in raw and "." not in raw:
        raw = raw.replace(",", ".")
    elif "," in raw and "." in raw:
        raw = raw.replace(",", "")
    try:
        return float(raw)
    except ValueError:
        return None


def extract_prices(text):
    prices = []
    for match in PRICE_RE.finditer(text or ""):
        symbol = match.group("symbol")
        code = match.group("code")
        currency = SYMBOL_CURRENCY.get(symbol, code.upper() if code else None)
        raw_amount = match.group("amount") or match.group("amount2")
        amount = parse_amount(raw_amount)
        if amount is None or amount <= 0 or not currency:
            continue
        record = {"amount": amount, "currency": currency, "raw": match.group(0).strip()}
        if record not in prices:
            prices.append(record)
    return prices[:5]


def to_eur(amount, currency):
    rate = FX_PER_EUR.get(currency)
    if not rate:
        return None
    return amount / rate


def tavily_search(query):
    payload = json.dumps({
        "query": query,
        "search_depth": "advanced",
        "max_results": MAX_RESULTS_PER_QUERY,
    }).encode("utf-8")
    request = urllib.request.Request(
        "https://api.tavily.com/search",
        data=payload,
        headers={"Content-Type": "application/json", "Authorization": f"Bearer {API_KEY}"},
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=40) as response:
        return json.loads(response.read().decode("utf-8"))


def result_id(url, title):
    basis = url or normalize_title(title)
    return hashlib.sha256(basis.encode("utf-8")).hexdigest()[:16]


def main():
    if not API_KEY:
        raise SystemExit("Missing TAVILY_API_KEY environment secret")

    REPORT_DIR.mkdir(parents=True, exist_ok=True)
    ARCHIVE_DIR.mkdir(parents=True, exist_ok=True)
    collected = {category: [] for category in CATEGORIES}
    seen_by_category = {category: set() for category in CATEGORIES}
    errors = []

    for category, queries in CATEGORIES.items():
        for query in queries:
            try:
                response = tavily_search(query)
                for hit in response.get("results", []):
                    title = (hit.get("title") or "Untitled result").strip()
                    url = safe_url(hit.get("url"))
                    snippet = (hit.get("content") or "").strip()
                    if not url or EXCLUDE_RE.search(title + " " + snippet):
                        continue
                    key = url or normalize_title(title)
                    if key in seen_by_category[category]:
                        continue
                    seen_by_category[category].add(key)
                    prices = extract_prices(title + " " + snippet)
                    price_estimates = []
                    for price in prices:
                        eur = to_eur(price["amount"], price["currency"])
                        if eur is not None:
                            price_estimates.append({
                                **price,
                                "estimated_eur": round(eur, 2),
                                "simulated_sale_eur": round(eur * (1 + MARKUP_RATE), 2),
                            })
                    collected[category].append({
                        "id": result_id(url, title),
                        "title": title,
                        "url": url,
                        "snippet": snippet[:1200],
                        "search_score": hit.get("score"),
                        "price_mentions": prices,
                        "price_estimates": price_estimates,
                        "shipping_verified": False,
                        "stock_verified": False,
                        "taxes_verified": False,
                        "supplier_verified": False,
                        "condition_verified": False,
                        "moq_verified": False,
                        "delivery_verified": False,
                        "manual_review_required": True,
                    })
            except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, ValueError, KeyError) as exc:
                errors.append(f"{category}: {type(exc).__name__}")
            except Exception as exc:
                errors.append(f"{category}: unexpected {type(exc).__name__}")
            time.sleep(0.3)

    # Flag duplicate URLs across categories without deleting them from category sections.
    counts = {}
    for entries in collected.values():
        for entry in entries:
            counts[entry["url"]] = counts.get(entry["url"], 0) + 1
    for entries in collected.values():
        for entry in entries:
            entry["cross_category_duplicate"] = counts.get(entry["url"], 0) > 1

    stamp = datetime.now(timezone.utc)
    stamp_iso = stamp.strftime("%Y-%m-%dT%H:%M:%SZ")
    stamp_label = stamp.strftime("%Y-%m-%d %H:%M UTC")
    total = sum(len(entries[:MAX_PER_CATEGORY]) for entries in collected.values())
    data = {
        "project": "ADI INTERNATIONAL",
        "version": "4.1",
        "generated_at_utc": stamp_iso,
        "mode": "research_only",
        "automatic_purchase": False,
        "automatic_supplier_contact": False,
        "automatic_spending": False,
        "automatic_publication": False,
        "markup_simulation_rate": MARKUP_RATE,
        "fx_rates_units_per_eur_static_estimates": FX_PER_EUR,
        "categories_searched": list(CATEGORIES.keys()),
        "results_count": total,
        "errors": errors,
        "results_by_category": {
            category: sorted(entries, key=lambda e: (bool(e["price_estimates"]), e["search_score"] or 0), reverse=True)[:MAX_PER_CATEGORY]
            for category, entries in collected.items()
        },
    }

    md = [
        "# ADI INTERNATIONAL — Product Research V4.1",
        f"**Report date:** {stamp_label}",
        "**Mode:** research only — no purchase, supplier contact, spending, or publishing.",
        "",
        "## Important verification limits",
        "- Search results are discovery leads, not independently confirmed product or seller facts.",
        "- Price mentions may refer to a different variant, bundle, currency, or quantity.",
        "- Shipping, destination, taxes/customs, stock, MOQ, condition, delivery time, and seller identity remain unverified.",
        "- EUR conversions use static indicative rates stored in the script; they are not live FX.",
        f"- Sale price simulation adds {MARKUP_RATE:.0%} to the detected price converted to EUR; this is a markup simulation, not a verified margin or profitability calculation.",
        "- No profitability claim is made until delivered costs and destination fees are verified.",
        "",
    ]
    for category, entries in data["results_by_category"].items():
        md.append(f"## Category: {category}")
        if not entries:
            md.extend(["No eligible search leads found.", ""])
            continue
        for item in entries:
            score = item["search_score"]
            score_text = f"{score:.3f}" if isinstance(score, (int, float)) else "unavailable"
            md.extend([
                f"### {md_escape(item['title'])}",
                f"- Source: {item['url']}",
                f"- Search relevance score: {score_text} (not profitability)",
                f"- Price mentions: {', '.join(p['raw'] for p in item['price_mentions']) or 'None detected'} (unverified)",
            ])
            if item["price_estimates"]:
                for estimate in item["price_estimates"]:
                    md.append(f"- Indicative conversion: {estimate['estimated_eur']:.2f} EUR | simulated resale with markup: {estimate['simulated_sale_eur']:.2f} EUR")
            else:
                md.append("- EUR conversion/sale simulation: unavailable (no explicit supported-currency price detected)")
            md.extend([
                f"- Duplicate across categories: {'yes' if item['cross_category_duplicate'] else 'no'}",
                "- Seller/product details, shipping, destination, duties/taxes, stock, MOQ, condition, and delivery: NOT VERIFIED",
                "- ADI decision: manual review required",
                f"- Search snippet: {md_escape(item['snippet'][:600] or 'No snippet')}",
                "",
            ])
    md.extend([
        "## Summary",
        f"- Search leads included: {total}",
        f"- Categories: {len(CATEGORIES)}",
        f"- Search errors: {len(errors)}",
        "- Automatic purchase/contact/spending/publication: disabled",
        "- Manual review required before any further decision",
        "",
        "## Manual validation checklist",
        "1. Exact product/model/variant and condition",
        "2. Seller identity and reputation",
        "3. Price, currency, quantity, and MOQ",
        "4. Shipping to intended destination, cost, and delivery time",
        "5. Taxes, duties, and other fees",
        "6. Stock availability and return terms",
        "7. Confirm delivered cost before considering an ADI sale-price simulation",
    ])
    if errors:
        md.extend(["", "## Search errors (non-sensitive)"] + [f"- {e}" for e in errors])

    archive_md = ARCHIVE_DIR / f"daily-report-v4-{stamp.strftime('%Y%m%d-%H%M')}.md"
    archive_json = ARCHIVE_DIR / f"daily-report-v4-{stamp.strftime('%Y%m%d-%H%M')}.json"
    latest_md = REPORT_DIR / "daily-report-v4-latest.md"
    latest_json = REPORT_DIR / "daily-report-v4-latest.json"
    content_md = "\n".join(md) + "\n"
    content_json = json.dumps(data, ensure_ascii=False, indent=2) + "\n"

    archive_md.write_text(content_md, encoding="utf-8")
    archive_json.write_text(content_json, encoding="utf-8")
    latest_md.write_text(content_md, encoding="utf-8")
    latest_json.write_text(content_json, encoding="utf-8")
    print(f"V4.1 report saved: {latest_md}")
    print(f"Archive saved: {archive_md} and {archive_json}")
    print(f"Results={total} | Errors={len(errors)} | Mode=research-only")


if __name__ == "__main__":
    main()

