"""
Keyword-based financial news headline sentiment classifier.

Classifies headlines as 'positive', 'negative', or 'neutral' using
curated finance-specific keyword lists with simple weighting.
"""

import re
from typing import Dict, List, Optional

# ── Bullish keywords (weight, pattern) ──
_BULLISH = [
    # Strong positive
    (2.0, r"\bbeats?\b"),
    (2.0, r"\bupgrade[ds]?\b"),
    (2.0, r"\braise[ds]?\b(?:\s+(?:price\s+)?target)"),
    (2.0, r"\brecord\s+(?:revenue|earnings|profit|high)"),
    (2.0, r"\bblowout\b"),
    (2.0, r"\bsurpass(?:es|ed)?\b"),
    (2.0, r"\bsoar(?:s|ed|ing)?\b"),
    (1.5, r"\bbuyback\b"),
    (1.5, r"\bstock\s+(?:buy\s*back|repurchase)\b"),
    (1.5, r"\bsurge[ds]?\b"),
    (1.5, r"\brall(?:y|ies|ied)\b"),
    (1.5, r"\bjump(?:s|ed)?\b"),
    (1.5, r"\bsurprise[ds]?\b.*\bupside\b"),
    (1.5, r"\bstrong\s+(?:growth|revenue|results|earnings|demand|quarter)\b"),
    (1.5, r"\bbullish\b"),
    (1.5, r"\boutperform(?:s|ed|ing)?\b"),
    (1.5, r"\boverweight\b"),
    # Moderate positive
    (1.0, r"\braise[ds]?\b"),
    (1.0, r"\bgrow(?:th|s|n|ing)\b"),
    (1.0, r"\bgains?\b"),
    (1.0, r"\brise[ds]?\b|ris(?:ing|en)\b"),
    (1.0, r"\bclimb(?:s|ed|ing)?\b"),
    (1.0, r"\bexpand(?:s|ed|ing)?\b"),
    (1.0, r"\bprofit(?:s|able|ability)\b"),
    (1.0, r"\bexceed(?:s|ed)?\b"),
    (1.0, r"\brecovery\b|\brecover(?:s|ed|ing)?\b"),
    (1.0, r"\boptimis(?:m|tic)\b"),
    (1.0, r"\bpositive\b"),
    (1.0, r"\bimprove(?:s|d|ment)?\b"),
    (1.0, r"\bbuy\s+rating\b"),
    (1.0, r"\bwin(?:s|ning)?\b"),
    (1.0, r"\blaunch(?:es|ed)?\b"),
    (1.0, r"\binnovati(?:on|ve)\b"),
    (1.0, r"\bpartnership\b"),
    (1.0, r"\bdividend\s+(?:hike|increase|raise)\b"),
    (1.0, r"\bapproval\b|\bapprove[ds]?\b"),
    (1.0, r"\bbreakthrough\b"),
    (0.5, r"\bup\s+\d+%\b"),
    (0.5, r"\bhigh(?:er|s)?\b"),
    (0.5, r"\bstable\b|\bsteady\b"),
]

# ── Bearish keywords (weight, pattern) ──
_BEARISH = [
    # Strong negative
    (2.0, r"\bmisses\b|\bmissed\b"),
    (2.0, r"\bdowngrade[ds]?\b"),
    (2.0, r"\bcut(?:s|ting)?\b(?:\s+(?:price\s+)?target)"),
    (2.0, r"\blower(?:s|ed)?\b(?:\s+(?:price\s+)?target)"),
    (2.0, r"\bplunge[ds]?\b"),
    (2.0, r"\bcrash(?:es|ed|ing)?\b"),
    (2.0, r"\bcollapse[ds]?\b"),
    (2.0, r"\bfraud\b"),
    (2.0, r"\bbankrupt(?:cy)?\b"),
    (2.0, r"\bdefault(?:s|ed)?\b"),
    (1.5, r"\bsell[\s-]off\b"),
    (1.5, r"\btumble[ds]?\b"),
    (1.5, r"\bdrop(?:s|ped)?\b"),
    (1.5, r"\bslump(?:s|ed|ing)?\b"),
    (1.5, r"\bdecline[ds]?\b"),
    (1.5, r"\bfall(?:s|ing|en)?\b"),
    (1.5, r"\bsink(?:s|ing)?\b|\bsank\b|\bsunk\b"),
    (1.5, r"\bweak(?:er|ness|ening)?\b"),
    (1.5, r"\bbearish\b"),
    (1.5, r"\bunderperform(?:s|ed|ing)?\b"),
    (1.5, r"\bunderweight\b"),
    (1.5, r"\bwarn(?:s|ed|ing)?\b"),
    (1.5, r"\bshortfall\b"),
    (1.5, r"\brecall(?:s|ed)?\b"),
    (1.5, r"\blawsuit\b|\bsu(?:es?|ed|ing)\b"),
    # Moderate negative
    (1.0, r"\bloss(?:es)?\b"),
    (1.0, r"\bcuts?\b"),
    (1.0, r"\blayoff(?:s)?\b|\blay(?:s|ing)?\s+off\b"),
    (1.0, r"\bfiring\b|\bfire[ds]?\b.*\bemployees?\b"),
    (1.0, r"\brestructur(?:e[ds]?|ing)\b"),
    (1.0, r"\bpessimis(?:m|tic)\b"),
    (1.0, r"\bnegative\b"),
    (1.0, r"\bconcern(?:s|ed)?\b"),
    (1.0, r"\brisk(?:s|y|ier)?\b"),
    (1.0, r"\buncertain(?:ty|ties)?\b"),
    (1.0, r"\bsell\s+rating\b"),
    (1.0, r"\bpenalt(?:y|ies)\b|\bfine[ds]?\b"),
    (1.0, r"\binvestigat(?:e[ds]?|ion|ing)\b"),
    (1.0, r"\bdelisted?\b"),
    (1.0, r"\bdilutt?(?:ion|ive|ed?)\b"),
    (1.0, r"\bdebt\s+(?:concern|burden|load)\b"),
    (0.5, r"\bdown\s+\d+%\b"),
    (0.5, r"\blow(?:er|s)?\b"),
    (0.3, r"\bvolatil(?:e|ity)\b"),
]

# Pre-compile patterns
_BULLISH_COMPILED = [(w, re.compile(p, re.IGNORECASE)) for w, p in _BULLISH]
_BEARISH_COMPILED = [(w, re.compile(p, re.IGNORECASE)) for w, p in _BEARISH]

# Negation pattern: "not", "no", "never", "fails to", "didn't", etc.
_NEGATION = re.compile(
    r"\b(?:not|no|never|n't|neither|nor|fail(?:s|ed)?\s+to|unable\s+to)\b",
    re.IGNORECASE,
)


def classify_headline(headline: str) -> str:
    """
    Classify a single headline as 'positive', 'negative', or 'neutral'.
    """
    if not headline:
        return "neutral"

    bull_score = sum(w for w, p in _BULLISH_COMPILED if p.search(headline))
    bear_score = sum(w for w, p in _BEARISH_COMPILED if p.search(headline))

    # Negation flipping: if negation words present, swap scores partially
    if _NEGATION.search(headline):
        bull_score, bear_score = bear_score * 0.6, bull_score * 0.6

    net = bull_score - bear_score

    if net >= 1.0:
        return "positive"
    elif net <= -1.0:
        return "negative"
    else:
        return "neutral"


def enrich_news_sentiment(news_items: Optional[List[Dict]]) -> Optional[List[Dict]]:
    """
    Add 'sentiment' field to each news item in-place and return the list.
    """
    if not news_items:
        return news_items

    for item in news_items:
        title = item.get("title", "")
        item["sentiment"] = classify_headline(title)

    return news_items
