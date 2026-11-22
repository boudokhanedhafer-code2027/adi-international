
import os
import json
import re
import urllib.request
import urllib.parse
from datetime import datetime, timezone

API_KEY = os.environ.get("TAVILY_API_KEY")
REPORT_DIR = "reports"
REPORT_FILE = os.path.join(REPORT_DIR, "daily-report.md")
MAX_RESULTS_PER_SEARCH = 5
MAX_REPORT_ITEMS = 25

SEARCHES = [
    ("Maison", "useful innovative home organization products wholesale suppliers"),
    ("Cuisine", "practical kitchen accessories wholesale suppliers new products"),
    ("Electronique", "useful electronic accessories wholesale supplier"),
    ("Auto", "automotive accessories everyday products wholesale suppliers"),
    ("Mode", "fashion bags travel accessories wholesale supplier products"),
    ("Loisirs", "travel outdoor leisure accessories wholesale suppliers"),
]

def clean_text(value, limit=1200):
    value = str(value or "")
    value = re.sub(r"<[^>]*>", " ", value)
    value = value.replace("|", "/")
    value = re.sub(r"[\r\n\t]+", " ", value)
    value = re.sub(r"\s+", " ", value)
    return value.strip()[:limit]

def normalize_url(url):
    try:
        parts = urllib.parse.urlsplit(url)
        if not parts.netloc:
            return url.strip().lower()
        return (
            parts.scheme.lower() + "://" +
            parts.netloc.lower() +
            parts.path.rstrip("/")
        )
    except Exception:
        return url.strip().lower()

def get_domain(url):
    try:
        return urllib.parse.urlparse(url).netloc.lower()
    except Exception:
        return "Unknown source"

def detect_price(text):
    patterns = [
        r"(?:USD|US\$|\$)\s?\d+(?:[.,]\d{1,2})?",
        r"\d+(?:[.,]\d{1,2})?\s?(?:USD|US dollars)",
        r"(?:EUR|€)\s?\d+(?:[.,]\d{1,2})?",
        r"\d+(?:[.,]\d{1,2})?\s?(?:EUR|€)",
        r"(?:CNY|RMB|¥)\s?\d+(?:[.,]\d{1,2})?",
        r"\d+(?:[.,]\d{1,2})?\s?(?:CNY|RMB)",
        r"(?:GBP|£)\s?\d+(?:[.,]\d{1,2})?",
        r"\d+(?:[.,]\d{1,2})?\s?(?:GBP|£)",
    ]

    for pattern in patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            return match.group(0)

    return "No price mention detected"

def research_score(item):
    try:
        relevance = float(item.get("score", 0))
    except (TypeError, ValueError):
        relevance = 0

    relevance = max(0, min(1, relevance))
    score = int(relevance * 100)

    if item.get("title"):
        score += 3
    if item.get("url"):
        score += 2

    return min(score, 100)

def tavily_search(query):
    if not API_KEY:
        raise RuntimeError("TAVILY_API_KEY is missing")

    payload = {
        "api_key": API_KEY,
        "query": query,
        "search_depth": "basic",
        "max_results": MAX_RESULTS_PER_SEARCH,
        "include_answer": False,
    }

    request_data = json.dumps(payload).encode("utf-8")

    request = urllib.request.Request(
        "https://api.tavily.com/search",
        data=request_data,
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    with urllib.request.urlopen(request, timeout=40) as response:
        return json.loads(response.read().decode("utf-8"))

def main():
    os.makedirs(REPORT_DIR, exist_ok=True)

    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")

    report = [
        "# ADI INTERNATIONAL",
        "## Daily Product & Supplier Research",
        f"**Report date:** {now}",
        "",
        "> Research report only. Prices, stock, shipping and supplier details "
        "require manual verification.",
        "> No automatic purchase or publication.",
        "",
        "## Research rules",
        "- Source links are provided for manual checking.",
        "- Price mentions are extracted from search snippets only.",
        "- Shipping, taxes, delivery and stock are not verified.",
        "- Research score measures search relevance, not profit.",
        "",
    ]

    all_results = []
    seen = set()
    errors = []

    for category, query in SEARCHES:
        try:
            data = tavily_search(query)
            results = data.get("results", [])

            for item in results:
                title = clean_text(item.get("title", "Untitled"), 200)
                url = item.get("url", "")
                content = clean_text(
                    item.get("content", "No description available.")
                )

                if not url:
                    continue

                key = normalize_url(url)
                title_key = title.lower()

                if key in seen or title_key in seen:
                    continue

                seen.add(key)
                seen.add(title_key)

                all_results.append({
                    "category": category,
                    "title": title,
                    "url": url,
                    "domain": get_domain(url),
                    "content": content,
                    "price": detect_price(content),
                    "score": research_score(item),
                })

        except Exception as error:
            errors.append(f"{category}: {clean_text(error, 300)}")

    all_results.sort(key=lambda x: x["score"], reverse=True)
    selected = all_results[:MAX_REPORT_ITEMS]

    for category, _ in SEARCHES:
        category_items = [
            item for item in selected
            if item["category"] == category
        ]

        report += [
            "---",
            f"## Category: {category}",
            "",
        ]

        if not category_items:
            report += ["No results retained for this category.", ""]
            continue

        for item in category_items:
            report += [
                f"### {item['title']}",
                f"**Source:** [{item['domain']}]({item['url']})",
                f"**Research score:** {item['score']}/100",
                f"**Price mention:** {item['price']}",
                "",
                item["content"] or "No description available.",
                "",
                "**Supplier price:** Not verified",
                "**Shipping cost:** Not verified",
                "**Taxes/customs:** Not verified",
                "**Stock:** Not verified",
                "**Delivery time:** Not verified",
                "**ADI sale price (EUR):** Pending verification",
                "**Decision:** Manual review required",
                "",
            ]

    report += [
        "---",
        "## Daily Summary",
        f"- Unique results collected: {len(all_results)}",
        f"- Results displayed: {len(selected)}",
        f"- Categories searched: {len(SEARCHES)}",
        "- Duplicate results removed: Yes",
        "- Supplier prices independently verified: No",
        "- Shipping verified: No",
        "- Stock verified: No",
        "- Automatic purchase: Disabled",
        "- Automatic publication: Disabled",
        "",
    ]

    if errors:
        report += ["## Search warnings", ""]
        for error in errors:
            report.append(f"- {error}")
        report.append("")

    report += [
        "## Next step",
        "Manually verify the original source, exact product/variant, "
        "supplier price, MOQ, stock, shipping to destination, fees and "
        "delivery estimate before calculating an ADI resale price.",
        "",
    ]

    with open(REPORT_FILE, "w", encoding="utf-8") as file:
        file.write("\n".join(report))

    print("ADI report generated:", REPORT_FILE)
    print("Unique results collected:", len(all_results))
    print("Results displayed:", len(selected))
    print("Search errors:", len(errors))

if __name__ == "__main__":
    main()
