#!/usr/bin/env python3
"""
Chrome Native Messaging host — auto-launched by Chrome on demand.
Reads JSON from stdin, crawls Tabelog via curl_cffi, writes JSON to stdout.
No server, no ports — Chrome manages the process lifecycle.
"""
import json
import struct
import sys
import urllib.parse
from curl_cffi import requests
from bs4 import BeautifulSoup

SEARCH_URL = "https://tabelog.com/rst/rstsearch"
TIMEOUT = 15

LISTING_SELECTOR = "div.list-rst"
NAME_SELECTOR = "a.list-rst__rst-name-target, a.cpy-rst-name"
SCORE_SELECTOR = "span.c-rating__val.list-rst__rating-val, span.c-rating__val--strong"
REVIEW_SELECTOR = "em.list-rst__rvw-count-num, em.cpy-review-count"
AREA_SELECTOR = "div.list-rst__area-genre, div.cpy-area-genre"
LINK_SELECTOR = "a.list-rst__rst-name-target, a.cpy-rst-name"

_cache = {}


def read_message():
    """Read a 4-byte length-prefixed JSON message from stdin."""
    raw_len = sys.stdin.buffer.read(4)
    if not raw_len:
        return None
    msg_len = struct.unpack("@I", raw_len)[0]
    return json.loads(sys.stdin.buffer.read(msg_len).decode("utf-8"))


def send_message(data):
    """Write a 4-byte length-prefixed JSON message to stdout."""
    body = json.dumps(data, ensure_ascii=False).encode("utf-8")
    sys.stdout.buffer.write(struct.pack("@I", len(body)))
    sys.stdout.buffer.write(body)
    sys.stdout.buffer.flush()


def search_tabelog(name, area=None):
    """Fetch and parse Tabelog search results."""
    params = {"sk": name}
    if area:
        params["sa"] = area
    url = f"{SEARCH_URL}?{urllib.parse.urlencode(params)}"

    resp = requests.get(
        url,
        impersonate="safari",
        headers={
            "Accept-Language": "ja,en;q=0.9",
            "Accept": "text/html,application/xhtml+xml",
            "Referer": "https://tabelog.com/",
        },
        timeout=TIMEOUT,
    )

    if resp.status_code == 429:
        raise Exception("RATE_LIMITED")
    if not resp.ok:
        raise Exception(f"HTTP_{resp.status_code}")

    soup = BeautifulSoup(resp.text, "html.parser")
    listings = soup.select(LISTING_SELECTOR)
    results = []

    for item in listings:
        name_el = item.select_one(NAME_SELECTOR)
        score_el = item.select_one(SCORE_SELECTOR)
        review_el = item.select_one(REVIEW_SELECTOR)
        area_el = item.select_one(AREA_SELECTOR)
        link_el = item.select_one(LINK_SELECTOR)

        if not name_el:
            continue

        score_text = (
            "".join(c for c in score_el.text if c.isdigit() or c == ".")
            if score_el
            else ""
        )
        review_text = (
            "".join(c for c in review_el.text if c.isdigit()) if review_el else ""
        )

        results.append(
            {
                "name": " ".join(name_el.text.split()),
                "score": float(score_text) if score_text else 0,
                "reviewCount": int(review_text) if review_text else 0,
                "area": " ".join(area_el.text.split()) if area_el else "",
                "url": link_el.get("href", "") if link_el else "",
            }
        )

    return results


def main():
    while True:
        msg = read_message()
        if msg is None:
            break

        name = msg.get("name", "")
        area = msg.get("area", "")

        if not name:
            send_message({"error": "Missing name"})
            continue

        cache_key = f"{name}|{area}"
        if cache_key in _cache:
            send_message({"results": _cache[cache_key], "cached": True})
            continue

        try:
            results = search_tabelog(name, area if area else None)
            _cache[cache_key] = results
            send_message({"results": results})
        except Exception as e:
            send_message({"error": str(e)})


if __name__ == "__main__":
    main()
