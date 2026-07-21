"""Meta Ad Library ingestion — the first live data source.

Hits the public Ad Library API (graph.facebook.com/.../ads_archive) and maps the
response into our Ad schema. Gated by META_ADLIB_TOKEN; returns [] on any error so
callers fall back to mock data.

Docs: https://www.facebook.com/ads/library/api/
"""
from datetime import datetime, timezone
import httpx
from ..config import get_settings
from ..schemas import Ad

GRAPH = "https://graph.facebook.com/v19.0/ads_archive"

# our country name -> ISO code the Ad Library expects
COUNTRY_CODE = {
    "qatar": "QA", "saudi arabia": "SA", "ksa": "SA", "kuwait": "KW",
    "uae": "AE", "united arab emirates": "AE", "bahrain": "BH", "oman": "OM",
    "jordan": "JO",
}


def _has_arabic(text: str) -> bool:
    return any("؀" <= ch <= "ۿ" for ch in text)


def _days_active(start: str | None) -> int:
    if not start:
        return 0
    try:
        d = datetime.fromisoformat(start.replace("Z", "+00:00"))
        return max(0, (datetime.now(timezone.utc) - d).days)
    except Exception:
        return 0


def _platform(raw: dict) -> str:
    """Meta Ad Library returns publisher_platforms; split Facebook vs Instagram."""
    pubs = [p.lower() for p in (raw.get("publisher_platforms") or [])]
    if "instagram" in pubs and "facebook" not in pubs:
        return "instagram"
    return "facebook"  # default (facebook, or mixed FB+IG)


def _map_ad(raw: dict) -> Ad:
    bodies = raw.get("ad_creative_bodies") or [""]
    headline = (bodies[0] or "").strip()[:180]
    days = _days_active(raw.get("ad_delivery_start_time"))
    lang = "arabic" if _has_arabic(headline) else "english"
    return Ad(
        id=str(raw.get("id", "")),
        advertiser=raw.get("page_name", "Unknown"),
        platform=_platform(raw),
        country=(raw.get("ad_reached_countries") or ["QA"])[0],
        format="video" if raw.get("ad_snapshot_url", "").find("video") >= 0 else "image",
        language=lang,
        headline_original=headline or "(no text)",
        # Translation/classification are enriched later by the flash model;
        # left as the original here so the pipeline stays cheap on ingest.
        headline_translation="" if lang == "arabic" else headline,
        offer_type="—",
        days_active=days,
        # Longevity-based placeholder until reach/engagement scoring is wired.
        performance_score=min(100, days * 2),
        first_seen=(raw.get("ad_delivery_start_time") or "")[:10],
    )


async def fetch_meta_ads(advertiser: str | None, country: str = "Qatar",
                         search_terms: str | None = None, limit: int = 25) -> list[Ad]:
    s = get_settings()
    if not s.meta_adlib_token:
        return []
    params = {
        "access_token": s.meta_adlib_token,
        "ad_reached_countries": COUNTRY_CODE.get((country or "").lower(), "QA"),
        "ad_type": "ALL",
        "ad_active_status": "ACTIVE",
        "limit": str(limit),
        "fields": ("id,page_name,ad_creative_bodies,ad_delivery_start_time,"
                   "ad_reached_countries,ad_snapshot_url,publisher_platforms"),
        "search_terms": search_terms or advertiser or "",
    }
    try:
        async with httpx.AsyncClient(timeout=45) as client:
            resp = await client.get(GRAPH, params=params)
            resp.raise_for_status()
            data = resp.json().get("data", [])
        ads = [_map_ad(a) for a in data]
        if advertiser:  # narrow to the requested competitor if given
            ads = [a for a in ads if advertiser.lower() in a.advertiser.lower()]
        return ads
    except Exception:
        return []
