#!/usr/bin/env python3
"""Checks the biographies of the states given: how alike any two are, banned wording, and length. Usage: python3 tools/us-data/check_bios.py FL TX"""
import json, re, sys, itertools
bios = {}
sys.path.insert(0, __import__('os').path.dirname(__import__('os').path.abspath(__file__)))
from profile_facts import AWARDS
AWARD_NAMES = re.compile('|'.join(re.escape(n) for n, _ in AWARDS) + r'|Martindale-Hubbell|Million Dollar Advocates Forum', re.I)   # real award names may contain words such as Best or Top
for st in sys.argv[1:]: bios.update(json.load(open(f'data/states/{st}/bios.json')))
BAD = re.compile(r'\b(best|top[- ]rated|#1|number one|leading|premier|expert|guarantee[sd]?|unmatched|finest|win(?:ning)?|aggressive|proven)\b', re.I)
def grams(t, n=5):
    w = re.findall(r"[a-z0-9’']+", t.lower()); return {' '.join(w[i:i + n]) for i in range(len(w) - n + 1)}
G = {k: grams(v) for k, v in bios.items()}
worst = []
for a, b in itertools.combinations(G, 2):
    u = len(G[a] | G[b]); j = len(G[a] & G[b]) / u if u else 0
    if j > 0.25: worst.append((round(j, 2), a, b))
worst.sort(reverse=True)
words = sorted(len(v.split()) for v in bios.values())
print('bios', len(bios), '| words min/median/max', words[0], words[len(words) // 2], words[-1])
print('pairs with >25% shared 5-word runs:', len(worst), worst[:5])
bad = [(k, m.group(0)) for k, v in bios.items() for m in [BAD.search(AWARD_NAMES.sub(' ', v))] if m]
print('banned wording:', bad[:8], len(bad))
