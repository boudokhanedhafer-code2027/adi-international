#!/usr/bin/env python3
"""ADI INTERNATIONAL Product Finder V2 — research only, no buying/publication."""
import os, re, json, html, urllib.parse, urllib.request, urllib.error
from datetime import datetime, timezone
from pathlib import Path

API_KEY = os.getenv("TAVILY_API_KEY", "").strip()
REPORT_DIR = Path("reports")
REPORT_DIR.mkdir(exist_ok=True)
MAX_PER_CATEGORY = 5
CATEGORIES = {
    "Maison": ["wholesale home organization storage products price product page", "home storage organizer wholesale product price"],
    "Cuisine": ["wholesale kitchen gadgets utensils individual products price", "kitchen accessories wholesale product price"],
    "Electronique": ["wholesale consumer electronics accessories product price", "phone accessories wholesale product listing price"],
    "Auto": ["wholesale car accessories individual product price", "automotive accessories supplier product listing"],
    "Mode": ["wholesale travel bags backpacks accessories product price", "wholesale fashion accessories product listing price"],
    "Loisirs": ["wholesale camping outdoor leisure products product price", "outdoor travel gadgets wholesale product listing"],
}
PRICE_RE = re.compile(r"(?:\$|USD\s?|US\$\s?|€|EUR\s?|£|GBP\s?|CNY\s?|RMB\s?|\bAED\s?)(\d{1,5}(?:[.,]\d{1,2})?)|\b(\d{1,5}(?:[.,]\d{1,2})?)\s?(?:USD|EUR|GBP|AED|CNY|RMB)\b", re.I)


def tavily_search(query):
    payload = json.dumps({"query": query, "search_depth": "advanced", "max_results": 8, "include_images": True}).encode()
    req = urllib.request.Request("https://api.tavily.com/search", data=payload,
                               headers={"Content-Type": "application/json", "Authorization": f"Bearer {API_KEY}"}, method="POST")
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode("utf-8"))


def get_price_mentions(text):
    matches = []
    for m in PRICE_RE.finditer(text or ""):
        matches.append(m.group(0).strip())
    return list(dict.fromkeys(matches))[:5]


def fetch_meta_image(url):
    """Try to read a page's OpenGraph image; best-effort, bounded request."""
    try:
        parsed = urllib.parse.urlparse(url)
        if parsed.scheme not in ("http", "https"):
            return ""
        req = urllib.request.Request(url, headers={"User-Agent": "ADI-ResearchBot/1.0 (metadata preview)"})
        with urllib.request.urlopen(req, timeout=8) as resp:
            if "text/html" not in resp.headers.get("Content-Type", ""):
                return ""
            raw = resp.read(250_000).decode("utf-8", "ignore")
        for pattern in [
            r'<meta[^>]+property=["\']og:image["\'][^>]+content=["\']([^"\']+)',
            r'<meta[^>]+content=["\']([^"\']+)["\'][^>]+property=["\']og:image["\']',
            r'<meta[^>]+name=["\']twitter:image["\'][^>]+content=["\']([^"\']+)',
        ]:
            m = re.search(pattern, raw, re.I)
            if m:
                return urllib.parse.urljoin(url, html.unescape(m.group(1)))
    except Exception:
        pass
    return ""


def normalize_title(title):
    return re.sub(r"[^a-z0-9]+", " ", (title or "").lower()).strip()


def markdown_escape(text):
    return (text or "").replace("|", "\\|").replace("\n", " ").strip()


def main():
    if not API_KEY:
        raise SystemExit("Missing TAVILY_API_KEY environment secret")
    collected, seen_urls, seen_titles, errors = [], set(), set(), []
    image_cache = {}
    for category, queries in CATEGORIES.items():
        category_results = []
        for query in queries:
            try:
                data = tavily_search(query)
                for item in data.get("results", []):
                    url = (item.get("url") or "").strip()
                    title = (item.get("title") or "Untitled product/source").strip()
                    snippet = (item.get("content") or "").strip()
                    if not url or url in seen_urls:
                        continue
                    norm = normalize_title(title)
                    if norm and norm in seen_titles:
                        continue
                    seen_urls.add(url)
                    if norm:
                        seen_titles.add(norm)
                    price_mentions = get_price_mentions(title + " " + snippet)
                    image = ""
                    if item.get("images"):
                        image = item["images"][0] if isinstance(item["images"], list) else ""
                    if not image:
                        image = image_cache.get(url, "")
                        if not image:
                            image = fetch_meta_image(url)
                            image_cache[url] = image
                    category_results.append({"category": category, "title": title, "url": url,
                                          "snippet": snippet, "score": item.get("score"),
                                          "prices": price_mentions, "image": image})
            except Exception as exc:
                errors.append(f"{category} / {query}: {exc}")
        category_results.sort(key=lambda r: (bool(r["prices"]), r["score"] or 0), reverse=True)
        collected.extend(category_results[:MAX_PER_CATEGORY])

    stamp = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    report = [
        "# ADI INTERNATIONAL", "## Daily Product & Supplier Research V2", f"**Report date:** {stamp}",
        "Research only. No automatic purchases or publications.", "",
        "### V2 rules", "- Prioritize specific product pages over supplier/category landing pages.",
        "- Price mentions come from search/page text and are not independently confirmed.",
        "- Images are page metadata/search-provided and may need visual/manual validation.",
        "- Shipping, taxes, delivery, stock, exact variant and MOQ require manual verification.",
        "- Research score indicates search relevance, not profit.", "- EUR resale calculation remains pending until landed costs and margin settings are confirmed.", ""
    ]
    for category in CATEGORIES:
        report.append(f"### Category: {category}")
        items = [r for r in collected if r["category"] == category]
        if not items:
            report.append("No results collected for this category.\n")
            continue
        for r in items:
            report += [f"**{markdown_escape(r['title'])}**", f"Source: {r['url']}"]
            report.append(f"Research score: {round((r['score'] or 0) * 100)} / 100" if isinstance(r["score"], (int,float)) else "Research score: unavailable")
            report.append("Price mention: " + (", ".join(r["prices"]) if r["prices"] else "None detected"))
            report.append("Product image: " + (r["image"] if r["image"] else "Not found"))
            if r["snippet"]:
                report.append("Snippet: " + markdown_escape(r["snippet"][:900]))
            report += ["Supplier price: not verified | Shipping: not verified | Taxes/customs: not verified | Stock: not verified | Delivery: not verified",
                       "ADI sale price (EUR): pending verification | Decision: manual review", ""]
    report += ["## Summary", f"Results collected: {len(collected)}", f"Categories searched: {len(CATEGORIES)}",
               "Duplicates removed: yes", "Supplier prices independently verified: no", "Shipping/stock/taxes verified: no",
               "Automatic purchase: disabled", "Automatic publication: disabled", "",
               "## Next step", "Manually verify exact product/variant, supplier price, MOQ, stock, destination shipping, taxes/fees and delivery before calculating resale price."]
    if errors:
        report += ["", "## Search errors"] + [f"- {e}" for e in errors]
    filename = REPORT_DIR / "daily-report.md"
    filename.write_text("\n".join(report), encoding="utf-8")
    print(f"Report saved: {filename} | results={len(collected)} | errors={len(errors)}")

if __name__ == "__main__":
    main()
