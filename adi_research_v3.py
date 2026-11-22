#!/usr/bin/env python3
"""ADI INTERNATIONAL Product Research V3 — research only, no purchasing or publishing."""
import os
import re
import json
import urllib.request
import urllib.error
from datetime import datetime, timezone
from pathlib import Path

API_KEY = os.getenv("TAVILY_API_KEY", "").strip()
REPORT_DIR = Path("reports")
REPORT_DIR.mkdir(exist_ok=True)
MAX_PER_CATEGORY = 5
MAX_RESULTS_PER_QUERY = 8

CATEGORIES = {
    "Maison": ["individual home organization storage product listing price", "home storage organizer product supplier price", "compact home improvement accessories product page"],
    "Cuisine": ["individual kitchen gadgets utensils product listing price", "kitchen accessories product supplier listing", "practical kitchen organization products price"],
    "Electronique": ["consumer electronics accessories individual product price", "phone computer accessories supplier product listing", "non regulated electronic accessories product page"],
    "Auto": ["non safety critical car accessories individual product listing price", "car interior organization accessories supplier product", "automotive convenience accessories product price"],
    "Mode": ["travel bags backpacks fashion accessories individual product price", "fashion accessories supplier product listing price", "everyday bags accessories product page"],
    "Loisirs": ["camping outdoor leisure accessories individual product listing price", "travel outdoor convenience gadgets product price", "hobby leisure accessories supplier listing"],
}


PRICE_RE = re.compile(
    r"(?:\$|USD\s?|US\$\s?|€|EUR\s?|£|GBP\s?|CNY\s?|RMB\s?|AED\s?)(\d{1,5}(?:[.,]\d{1,2})?)"
    r"|\b(\d{1,5}(?:[.,]\d{1,2})?)\s?(?:USD|EUR|GBP|AED|CNY|RMB)\b", re.I
)
# Exclude clearly restricted / unsafe product categories from research results.
EXCLUDE_RE = re.compile(
    r"\b(weapon|firearm|gun|ammunition|ammo|knife|knives|sword|switchblade|taser|pepper spray|mace|explosive|"
    r"firework|poison|pesticide|toxic|radioactive|drug|cannabis|marijuana|thc|cbd|alcohol|beer|wine|liquor|"
    r"cigarette|tobacco|nicotine|vape|adult toy|sex toy|porn|casino|gambling|steroid|hormone)\b", re.I
)


def tavily_search(query):
    payload = json.dumps({"query": query, "search_depth": "advanced", "max_results": MAX_RESULTS_PER_QUERY}).encode("utf-8")
    request = urllib.request.Request(
        "https://api.tavily.com/search", data=payload,
        headers={"Content-Type": "application/json", "Authorization": f"Bearer {API_KEY}"}, method="POST"
    )
    with urllib.request.urlopen(request, timeout=30) as response:
        return json.loads(response.read().decode("utf-8"))


def normalize_title(title):
    return re.sub(r"[^a-z0-9]+", " ", (title or "").lower()).strip()


def safe_url(url):
    url = (url or "").strip()
    return url if url.startswith("https://") else ""


def markdown_escape(text):
    return (text or "").replace("|", "\\|").replace("\n", " ").strip()


def get_price_mentions(text):
    found = []
    for match in PRICE_RE.finditer(text or ""):
        value = match.group(0).strip()
        if value not in found:
            found.append(value)
    return found[:5]


def main():
    if not API_KEY:
        raise SystemExit("Missing TAVILY_API_KEY environment secret")

    results_by_category = {category: [] for category in CATEGORIES}
    seen_by_category = {category: set() for category in CATEGORIES}
    errors = []

    for category, queries in CATEGORIES.items():
        for query in queries:
            try:
                data = tavily_search(query)
                for item in data.get("results", []):
                    title = (item.get("title") or "Untitled product/source").strip()
                    url = safe_url(item.get("url"))
                    snippet = (item.get("content") or "").strip()
                    if not url or EXCLUDE_RE.search(title + " " + snippet):
                        continue
                    key = url or normalize_title(title)
                    if key in seen_by_category[category]:
                        continue
                    seen_by_category[category].add(key)
                    results_by_category[category].append({
                        "title": title, "url": url, "snippet": snippet,
                        "score": item.get("score"), "prices": get_price_mentions(title + " " + snippet),
                    })
            except Exception as exc:
                # Do not print credentials or request details in the report.
                errors.append(f"{category} / query failed ({type(exc).__name__})")

    # Keep a cross-category list of duplicate URLs, but do not silently drop items from categories.
    all_items = [item for items in results_by_category.values() for item in items]
    url_counts = {}
    for item in all_items:
        url_counts[item["url"]] = url_counts.get(item["url"], 0) + 1

    stamp = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    report = [
        "# ADI INTERNATIONAL", "## Daily Product & Supplier Research V3", f"**Report date:** {stamp}",
        "Research only. No automatic purchases, supplier orders, or publications.", "",
        "### Verification rules",
        "- Search result titles and snippets are leads, not verified supplier facts.",
        "- Price mentions are not confirmed and may refer to a different variant, quantity, currency, or offer.",
        "- Shipping, destination, taxes/customs, stock, MOQ, delivery time, seller identity, and condition require manual verification.",
        "- Only HTTPS links are included. External product pages are not opened to scrape images.",
        "- Research relevance score is not a profitability score.",
        "- EUR resale price and ADI margin are not calculated until a delivered-cost basis is verified.", "",
    ]
    total_kept = 0
    for category, items in results_by_category.items():
        report.append(f"### Category: {category}")
        ranked = sorted(items, key=lambda item: (bool(item["prices"]), item["score"] if isinstance(item["score"], (int, float)) else 0), reverse=True)
        chosen = ranked[:MAX_PER_CATEGORY]
        total_kept += len(chosen)
        if not chosen:
            report.append("No eligible results collected for this category.\n")
            continue
        for item in chosen:
            report.extend([
                f"**{markdown_escape(item['title'])}**",
                f"Source: {item['url']}",
                f"Research score: {round(item['score'] * 100)} / 100" if isinstance(item["score"], (int, float)) else "Research score: unavailable",
                "Price mention (unverified): " + (", ".join(item["prices"]) if item["prices"] else "None detected"),
                "Cross-category duplicate: yes" if url_counts.get(item["url"], 0) > 1 else "Cross-category duplicate: no",
                "Supplier price: not verified | Shipping: not verified | Taxes/customs: not verified | Stock: not verified | MOQ: not verified | Delivery: not verified",
                "ADI sale price (EUR): pending verification | Decision: manual review",
                "Snippet: " + markdown_escape(item["snippet"][:700] if item["snippet"] else "No snippet provided"), "",
            ])
    report.extend([
        "## Summary", f"Results included in report: {total_kept}", f"Categories searched: {len(CATEGORIES)}",
        "Cross-category duplicate URLs flagged: yes (not silently removed)",
        "Supplier prices independently verified: no", "Shipping/stock/taxes verified: no",
        "Automatic purchase: disabled", "Automatic supplier order: disabled", "Automatic publication: disabled", "",
        "## Manual validation checklist",
        "Verify exact product/model/variant, seller identity, condition, price and currency, quantity/MOQ, destination shipping, taxes/fees, stock, and delivery time before any ADI resale-price or margin estimate.",
    ])
    if errors:
        report.extend(["", "## Search errors"] + [f"- {error}" for error in errors])

    filename = REPORT_DIR / "daily-report-v3.md"
    filename.write_text("\n".join(report), encoding="utf-8")
    print(f"Report saved: {filename} | results={total_kept} | errors={len(errors)}")


if __name__ == "__main__":
    main()
