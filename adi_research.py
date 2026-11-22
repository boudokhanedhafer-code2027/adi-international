
import os
import json
import urllib.request
import urllib.parse
from datetime import datetime, timezone

API_KEY = os.environ.get("TAVILY_API_KEY")
REPORT_DIR = "reports"
REPORT_FILE = os.path.join(REPORT_DIR, "daily-report.md")

SEARCHES = [
    "best trending consumer products international suppliers wholesale prices",
    "innovative home and kitchen products wholesale suppliers",
    "popular electronics accessories wholesale supplier prices",
    "fashion accessories trending wholesale international suppliers",
    "automotive accessories useful products wholesale prices",
    "beauty lifestyle and travel accessories trending products wholesale",
]

def tavily_search(query):
    if not API_KEY:
        raise RuntimeError("TAVILY_API_KEY is missing")

    payload = {
        "api_key": API_KEY,
        "query": query,
        "search_depth": "basic",
        "max_results": 5,
        "include_answer": False,
    }

    data = json.dumps(payload).encode("utf-8")

    req = urllib.request.Request(
        "https://api.tavily.com/search",
        data=data,
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    with urllib.request.urlopen(req, timeout=40) as response:
        return json.loads(response.read().decode("utf-8"))

def main():
    os.makedirs(REPORT_DIR, exist_ok=True)

    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    report = [
        "# ADI INTERNATIONAL",
        "## Daily Supplier Research",
        f"**Date:** {now}",
        "",
        "> Research only. No automatic purchases or publications.",
        "",
    ]

    total = 0

    for query in SEARCHES:
        report += [
            "---",
            f"## Search: {query}",
            "",
        ]

        try:
            data = tavily_search(query)
            results = data.get("results", [])

            if not results:
                report.append("No results returned.")
                report.append("")
                continue

            for item in results:
                title = item.get("title", "Untitled")
                url = item.get("url", "")
                content = item.get("content", "No description available.")
                score = item.get("score", None)

                report += [
                    f"### {title}",
                    f"**Source:** {url}",
                    f"**Relevance score:** {score}",
                    "",
                    content,
                    "",
                    "**Price:** Not verified",
                    "**Shipping:** Not verified",
                    "**Stock:** Not verified",
                    "**ADI sale price:** Pending verification",
                    "",
                ]
                total += 1

        except Exception as e:
            report += [
                f"Search failed: {str(e)}",
                "",
            ]

    report += [
        "---",
        "## Summary",
        f"Total search results collected: {total}",
        "",
        "All offers require manual verification.",
        "No supplier order was placed.",
        "No product was published.",
        "",
    ]

    with open(REPORT_FILE, "w", encoding="utf-8") as f:
        f.write("\n".join(report))

    print(f"ADI report generated: {REPORT_FILE}")
    print(f"Results collected: {total}")

if __name__ == "__main__":
    main()
