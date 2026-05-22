"""
PromptoAI - Invite Code Generator
Usage: python generate_codes.py [number_of_codes]
"""
import json
import random
import string
import sys
from datetime import datetime
from pathlib import Path

BASE_DIR = Path(__file__).parent
CODES_FILE = BASE_DIR / "codes.json"

# Exclude characters that are easy to confuse (0/O, 1/I, etc.)
SAFE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"


def generate_code(length=8):
    return "".join(random.choices(SAFE_CHARS, k=length))


def generate_codes(n: int = 5):
    if CODES_FILE.exists():
        data = json.loads(CODES_FILE.read_text(encoding="utf-8"))
    else:
        data = {}

    new_codes = []
    for _ in range(n):
        code = generate_code()
        while code in data:
            code = generate_code()
        data[code] = {
            "used": False,
            "created_at": datetime.now().isoformat(),
            "used_at": None,
        }
        new_codes.append(code)

    CODES_FILE.write_text(
        json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    return new_codes, data


def show_status():
    if not CODES_FILE.exists():
        print("No codes.json found.")
        return
    data = json.loads(CODES_FILE.read_text(encoding="utf-8"))
    unused = [c for c, v in data.items() if not v["used"]]
    used   = [c for c, v in data.items() if v["used"]]
    print(f"\n  Total  : {len(data)}")
    print(f"  Unused : {len(unused)}")
    print(f"  Used   : {len(used)}\n")
    if unused:
        print("  Available codes:")
        for c in unused:
            print(f"    {c[:4]}-{c[4:]}")


if __name__ == "__main__":
    n = int(sys.argv[1]) if len(sys.argv) > 1 else 5
    new_codes, all_data = generate_codes(n)

    print(f"\n  Generated {n} new codes:\n")
    for code in new_codes:
        print(f"    {code[:4]}-{code[4:]}")

    unused = sum(1 for v in all_data.values() if not v["used"])
    print(f"\n  Total unused codes: {unused}\n")
