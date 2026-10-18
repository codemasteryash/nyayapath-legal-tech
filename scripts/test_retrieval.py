"""Smoke test for the retrieval engine, run over the stdio protocol."""

import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

REQUESTS = [
    {"op": "health"},
    {
        "op": "retrieve",
        "collection": "provisions",
        "query": (
            "My husband and I have been married for 8 years and we live in a rented "
            "flat in Jaipur with our 7 year old daughter. On 12 April 2026 he held my "
            "hand so hard that there was a mark and I had to see a doctor. On 3 May 2026 "
            "he took my phone and said he will throw me out of the house."
        ),
        "topK": 6,
    },
    {
        "op": "retrieve",
        "collection": "judgments",
        "query": "husband throwing wife out of the shared house residence order right to reside",
        "topK": 4,
    },
    {
        "op": "retrieve",
        "collection": "provisions",
        "query": (
            "मेरी उम्र 26 साल है और शादी 2023 में हुई थी। 2 नवंबर 2025 को ससुराल के "
            "लोगों ने कहा कि दस लाख रुपये और सोना की चेन लाना होगा वरना घर से निकाल "
            "देंगे। पति ने मुझे धक्का देकर गिरा दिया।"
        ),
        "topK": 6,
    },
    {
        "op": "categorise",
        "text": (
            "On 28 September 2026 I got an SMS from my bank asking for my OTP and I "
            "lost 85000 rupees. The same number now threatens to publish my address."
        ),
        "explicit": None,
    },
]


def main() -> int:
    proc = subprocess.Popen(
        [sys.executable, str(ROOT / "retrieval" / "engine.py")],
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.DEVNULL,
        text=True,
        encoding="utf-8",
        bufsize=1,
    )
    failures = 0
    try:
        for req in REQUESTS:
            proc.stdin.write(json.dumps(req, ensure_ascii=False) + "\n")
            proc.stdin.flush()
            resp = json.loads(proc.stdout.readline())
            label = req.get("collection") or req.get("op")
            if not resp.get("ok"):
                print(f"FAIL {label}: {resp}")
                failures += 1
                continue
            if "results" in resp:
                print(f"OK   {label} -> {len(resp['results'])} results")
                for r in resp["results"]:
                    name = r.get("heading") or r.get("title")
                    print(f"       {r['score']:.3f}  {r['id']:<16} {str(name)[:58]}")
            elif "categories" in resp:
                print(f"OK   {label} -> categories")
                for c in resp["categories"]:
                    print(f"       {c['score']:>6}  {c['id']:<22} {c['matchedSignals']}")
            else:
                print(f"OK   {label} -> {resp.get('counts')}")
    finally:
        proc.stdin.close()
        proc.terminate()
    print("FAILURES:", failures)
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())