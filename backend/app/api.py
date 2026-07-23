"""API routes. Each endpoint uses the flash model when configured, otherwise
falls back to mock data so the frontend is fully explorable today."""
import asyncio
import re
import httpx
from fastapi import APIRouter
from .schemas import (DiscoverRequest, Competitor, Ad, CompetitorSummary,
                      AnalyzeRequest, Product)
from . import mock, db
from .config import get_settings
from .services.openrouter import (client, enrich_ads, verify_competitors,
                                   DISCOVER_SYSTEM, ANALYZE_SYSTEM)
from .services import rapidapi

router = APIRouter(prefix="/api")


@router.get("/health")
def health():
    s = get_settings()
    sources = {p: s.rapidapi_enabled for p in rapidapi.LIVE_PLATFORMS}
    return {
        "status": "ok",
        "model_enabled": client.enabled,
        "db_enabled": s.db_enabled,
        "sources": sources,
        "data_source": "live" if (client.enabled or s.rapidapi_enabled) else "mock",
    }


async def _fetch_site_text(url: str, limit: int = 2000) -> str:
    """Best-effort: fetch a company website and extract readable text (title, meta
    description, body) so the model can analyse it. Returns '' on any failure."""
    if not url:
        return ""
    if not url.startswith(("http://", "https://")):
        url = "https://" + url
    try:
        async with httpx.AsyncClient(timeout=12, follow_redirects=True,
                                     headers={"user-agent": "Mozilla/5.0 GulfAdIntel"}) as c:
            html = (await c.get(url)).text
    except Exception:
        return ""
    html = re.sub(r"(?is)<(script|style|noscript)[^>]*>.*?</\1>", " ", html)
    title = (re.search(r"(?is)<title[^>]*>(.*?)</title>", html) or [None, ""])[1]
    md = re.search(r'(?is)<meta[^>]+name=["\']description["\'][^>]+content=["\'](.*?)["\']', html)
    md = md.group(1) if md else ""
    body = re.sub(r"(?is)<[^>]+>", " ", html)
    parts = [re.sub(r"\s+", " ", x).strip() for x in (title, md, body) if x]
    return " | ".join(parts)[:limit]


@router.post("/competitors/discover", response_model=list[Competitor])
async def discover_competitors(req: DiscoverRequest):
    """Stage 2–3: derive competitors from a free-text description and/or website URL.

    REAL-TIME every request — competitors are NOT cached or stored. The model
    analyses the description/site fresh each time and returns same-service
    competitors that operate in the selected region.
    """
    p = req.product
    if not p.name:
        p.name = (p.description[:80] or p.website or "product").strip()

    out: list[Competitor] = []
    if client.enabled:
        try:
            site_text = await _fetch_site_text(p.website)
            user = f"Company / product / service description: {p.description or p.name}\n"
            if p.category:
                user += f"Category: {p.category}\n"
            if p.website:
                user += f"Website: {p.website}\n"
            if site_text:
                user += f"Website content: {site_text}\n"
            user += f"Country / region of interest: {p.country}\n"
            if p.known_competitors:
                user += f"Known competitors: {', '.join(p.known_competitors)}\n"
            data = await client.chat_json(DISCOVER_SYSTEM, user)
            for c in data.get("competitors", []):
                out.append(Competitor(
                    id=c["name"].lower().replace(" ", "-"),
                    name=c["name"], tier=c.get("tier", "challenger"),
                    confidence=float(c.get("confidence", 0.5)),
                    reason=c.get("reason", ""),
                    kind=c.get("kind", ""),
                    handle=(c.get("handle") or "").lstrip("@"),
                    origin=(c.get("origin") or "").lower(),
                ))
            # Layer 3 — adversarial verification: keep only candidates that truly
            # offer the same service in-region (drops tangential/wrong-industry hits).
            if out:
                keep = await verify_competitors(p.description or p.name, p.country,
                                                [c.name for c in out])
                if keep:                        # only filter when verification succeeded
                    out = [c for c in out if c.name in keep]
        except Exception:
            out = []  # fall through to mock on any model/parse error
    if not out:
        out = mock.mock_competitors(p)

    # NOTE: intentionally not stored — discovery is real-time per request.
    return out


async def _gather_platform(advertiser: str, p: str, country: str, handle: str = "",
                           topic: str = "") -> list[Ad]:
    """Fetch one live platform, cached per (advertiser, platform, country, topic).

    Only NON-empty results are cached — so a transient API failure just retries
    next time instead of poisoning the cache with an empty result for 6h.
    `handle` is the competitor's official social handle (from discovery) for
    reliable account resolution; `topic` scopes the relevance judgement.
    """
    tkey = re.sub(r"[^a-z0-9]", "", (topic or "").lower())[:24]
    key = f"ads:v11:{advertiser.lower()}:{p}:{country.lower()}:{tkey}"
    cached = await db.cache_get_ads(key)
    if cached is not None:
        return [Ad(**d) for d in cached]
    fn = rapidapi.LIVE_FETCHERS.get(p)
    ads = await fn(advertiser, country=country, handle=handle) if fn else []
    if ads:
        await enrich_ads(ads, topic=topic)   # translate + classify paid/ad + relevance
        await db.cache_put_ads(key, [a.model_dump() for a in ads])
    return ads


@router.get("/ads", response_model=list[Ad])
async def list_ads(advertiser: str | None = None, platform: str | None = None,
                   country: str = "Qatar", handle: str | None = None,
                   topic: str | None = None):
    """Stage 5–8: competitor ads, gathered from live sources, understood, scored.

    Live gathering needs to know *whose* ads to fetch, so it runs when an
    `advertiser` is supplied. `handle` (official social handle from discovery)
    makes account resolution reliable; `topic` scopes off-topic filtering.
    Everything degrades to mock on any gap.
    """
    s = get_settings()
    h = handle or ""
    t = topic or ""
    if s.rapidapi_enabled and advertiser:
        if platform in rapidapi.LIVE_PLATFORMS:
            ads = await _gather_platform(advertiser, platform, country, h, t)
            if ads:
                return sorted(ads, key=lambda a: a.performance_score, reverse=True)
            return mock.mock_ads(advertiser, platform)
        # "all": gather every live platform CONCURRENTLY (each cached independently),
        # so no platform (e.g. X/Facebook, gathered last) is starved or slow to appear.
        results = await asyncio.gather(
            *[_gather_platform(advertiser, p, country, h, t) for p in rapidapi.LIVE_PLATFORMS],
            return_exceptions=True,
        )
        gathered: list[Ad] = []
        for r in results:
            if isinstance(r, list):
                gathered.extend(r)
        if gathered:
            # show only the real gathered ads (no mock contamination)
            return sorted(gathered, key=lambda a: a.performance_score, reverse=True)
    return mock.mock_ads(advertiser, platform)


@router.get("/competitors/summary", response_model=list[CompetitorSummary])
def competitor_summary():
    """Stage 9 data: share of voice, platform mix, longevity per competitor."""
    return mock.mock_summaries()


@router.post("/analyze")
async def analyze(req: AnalyzeRequest):
    """Understand one creative's text (used by the ingestion pipeline)."""
    if client.enabled:
        try:
            return await client.chat_json(ANALYZE_SYSTEM, req.text)
        except Exception:
            pass
    return {
        "language": "arabic",
        "headline_translation": "(mock) English translation of the ad",
        "offer_type": "Bundle",
        "objective": "Promo/offer",
        "tone": "Family/Value",
        "note": "mock — set OPENROUTER_API_KEY for live analysis",
    }
