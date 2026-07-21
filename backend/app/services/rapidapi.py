"""RapidAPI data sources — competitor content gathered from each platform.

Security & robustness:
- The RapidAPI key is read from settings (env), never hardcoded, never logged,
  never returned to the client.
- Every call has a timeout and is wrapped so a slow / failing / discontinued API
  returns [] instead of raising — the caller then falls back to mock data.

Live-confirmed: Instagram (posts), Google (search), YouTube (search), Twitter/X (timeline).
Facebook: no post feed on this scraper, so we resolve the page and link to the brand's
live ads in Meta's public, region-filterable Ad Library.
(LinkedIn was dropped — the RapidAPI provider discontinued that scraper; X replaces it.)

Geo-targeting (so results reflect the country the user selected):
- YouTube  -> `gl=<ISO>` (confirmed to change results by market).
- Google   -> region name injected into the query (this API ignores gl/country).
- Instagram-> the account itself is global; the geo lever is the regional handle.
"""
import asyncio
import re
import unicodedata
import urllib.parse
from datetime import datetime, timezone
import httpx
from ..config import get_settings
from ..schemas import Ad

# demo handle overrides so the known competitors resolve to real IG accounts
IG_HANDLES = {"ooredoo": "ooredooqatar", "vodafone qatar": "vodafoneqatar"}

# selected country -> ISO 3166 alpha-2 (used for geo-targeting where supported)
COUNTRY_ISO = {
    "qatar": "QA", "saudi arabia": "SA", "oman": "OM", "bahrain": "BH",
    "united arab emirates": "AE", "uae": "AE", "jordan": "JO", "kuwait": "KW",
}


def _is_all_regions(country: str) -> bool:
    return (country or "").strip().lower().startswith("all region")


def _iso(country: str) -> str:
    """ISO code for geo-targeting; '' for 'All regions' or unknown country."""
    if _is_all_regions(country):
        return ""
    return COUNTRY_ISO.get((country or "").strip().lower(), "")


def _region_term(country: str) -> str:
    """Plain region name to bias keyword queries; '' for 'All regions'."""
    return "" if _is_all_regions(country) else (country or "").strip()


def _has_arabic(t: str) -> bool:
    return any("؀" <= c <= "ۿ" for c in t)


def _int(v):
    """Parse a count that arrives as int, numeric string, or None → int | None."""
    try:
        return int(v)
    except (TypeError, ValueError):
        return None


def _days(epoch) -> int:
    try:
        d = datetime.fromtimestamp(int(epoch), timezone.utc)
        return max(0, (datetime.now(timezone.utc) - d).days)
    except Exception:
        return 0


def _slug(name: str) -> str:
    """Best-effort brand name -> handle: strip accents & punctuation.
    e.g. 'Estée Lauder' -> 'esteelauder', "L'Oréal Paris" -> 'lorealparis'."""
    ascii_name = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]", "", ascii_name.lower())


async def _req(method: str, host: str, path: str, params=None, json_body=None,
               timeout: float = 25.0, key: str | None = None):
    """Single RapidAPI request. Returns parsed JSON or None on any failure.

    `key` lets a host use a different RapidAPI key (e.g. Twitter/X); it falls
    back to the shared key when not supplied.
    """
    s = get_settings()
    api_key = key or s.rapidapi_key
    if not api_key:
        return None
    headers = {"x-rapidapi-key": api_key, "x-rapidapi-host": host}
    try:
        async with httpx.AsyncClient(timeout=timeout) as c:
            r = await c.request(method, f"https://{host}{path}", params=params, json=json_body, headers=headers)
            r.raise_for_status()
            return r.json()
    except Exception:
        return None  # never break the caller


# ---------- Instagram (live) ----------
async def fetch_instagram(advertiser: str, country: str = "", handle: str = "", limit: int = 8) -> list[Ad]:
    s = get_settings()
    user = handle or IG_HANDLES.get(advertiser.lower(), _slug(advertiser))
    data = await _req("POST", s.rapidapi_instagram_host, "/api/instagram/posts",
                      json_body={"username": user})
    edges = ((data or {}).get("result") or {}).get("edges") or []
    ads: list[Ad] = []
    for e in edges[:limit]:
        n = e.get("node") or {}
        cap = n.get("caption") or {}
        text = (cap.get("text") or "").strip()
        if not text:
            continue
        # collapse to meaningful text (captions often open with emoji-only lines)
        joined = " ".join(ln.strip() for ln in text.splitlines() if ln.strip())
        head = joined[:180] or text[:180]
        is_video = n.get("media_type") == 2 or bool(n.get("video_versions"))
        days = _days(cap.get("created_at"))
        arabic = _has_arabic(joined)
        code = n.get("code")
        # media: thumbnail image + (for clips) a directly-playable video file
        cands = ((n.get("image_versions2") or {}).get("candidates")) or []
        thumb = (cands[0].get("url") if cands else "") or ""
        vvs = n.get("video_versions") or []
        media_url = (vvs[0].get("url") if (is_video and vvs) else "") or ""
        # native "paid" signal: boosted / sponsored / paid-partnership posts
        paid = (bool(n.get("is_paid_partnership")) or bool(n.get("ad_id"))
                or str(n.get("boosted_status") or "").lower() not in ("", "none", "not_boosted"))
        ads.append(Ad(
            id=str(n.get("id") or code or head[:20]),
            advertiser=advertiser, platform="instagram", country=country,
            format="video" if is_video else "image",
            language="arabic" if arabic else "english",
            headline_original=head,
            headline_translation="" if arabic else head,
            offer_type="Boosted post" if paid else "Organic post", days_active=days,
            performance_score=min(100, (55 if paid else 40) + days), first_seen="",
            url=f"https://www.instagram.com/p/{code}/" if code else "",
            thumbnail_url=thumb, media_url=media_url,
            likes=_int(n.get("like_count")), comments=_int(n.get("comment_count")),
            views=_int(n.get("view_count")) or _int(n.get("play_count")),
            shares=_int(n.get("reshare_count")) or _int(n.get("share_count")),
            is_ad=paid, ad_signal="instagram_paid" if paid else "",
        ))
    return ads


# ---------- Google (live) ----------
async def fetch_google(advertiser: str, country: str = "", handle: str = "", limit: int = 6) -> list[Ad]:
    s = get_settings()
    region = _region_term(country)
    search_q = f"{advertiser} {region}".strip()   # geo lever: this API ignores gl/country
    data = await _req("GET", s.rapidapi_google_host, "/",
                      params={"query": search_q, "limit": str(limit), "related_keywords": "false"})
    ads: list[Ad] = []
    for r in ((data or {}).get("results") or [])[:limit]:
        title = (r.get("title") or "").strip()[:180]
        if not title:
            continue
        ads.append(Ad(
            id=(r.get("url") or title)[:120], advertiser=advertiser, platform="google",
            country=country, format="search",
            language="arabic" if _has_arabic(title) else "english",
            headline_original=title,
            headline_translation="" if _has_arabic(title) else title,
            offer_type="Search result", days_active=0,
            performance_score=40, first_seen="",
            url=r.get("url") or "",
        ))
    return ads


# ---------- Facebook (live: region-scoped Ad Library) ----------
async def fetch_facebook(advertiser: str, country: str = "", handle: str = "", **_) -> list[Ad]:
    """This scraper has no post feed, but it exposes the page's Ad-Library id and
    whether it is currently running ads. We surface a region-scoped link to the
    brand's live ads in Meta's public Ad Library — the authoritative source of
    what they are actually running (and filterable by the selected country).
    Ad Library entries are paid by definition → is_ad=True."""
    s = get_settings()
    iso = _iso(country) or "ALL"                                # Ad Library country filter
    base = "https://www.facebook.com/ads/library/?active_status=all&ad_type=all"

    # 1) try to resolve the exact page → precise, page-scoped library link + ad status
    link = f"https://www.facebook.com/{handle or _slug(advertiser)}"   # best-effort vanity URL
    data = await _req("GET", s.rapidapi_facebook_host, "/get_facebook_pages_details",
                      params={"link": link})
    d0 = (data[0] if isinstance(data, list) and data else data) or {}
    d0 = d0 if isinstance(d0, dict) else {}
    page_id = d0.get("ad_page_id")

    if page_id:
        status = (d0.get("ad_status") or "").lower()
        running = "currently running" in status and "isn't" not in status and "not currently" not in status
        name = d0.get("name") or advertiser
        label = "currently running ads" if running else "no ads running right now"
        head = f"{name} — {label}. View their live Facebook ads in Meta's Ad Library ({iso})."
        url = f"{base}&country={iso}&view_all_page_id={page_id}"
        return [Ad(
            id=f"fb-{page_id}", advertiser=advertiser, platform="facebook", country=country,
            format="ad library", language="english",
            headline_original=head, headline_translation=head,
            offer_type="Ad library", days_active=0,
            performance_score=50 if running else 40, first_seen="",
            url=url, thumbnail_url=d0.get("image") or "",
            is_ad=True, ad_type="library", ad_signal="meta_ad_library",
        )]

    # 2) fallback: a region-scoped Ad Library KEYWORD search (always works; covers FB+IG ads)
    q = urllib.parse.quote(advertiser)
    url = f"{base}&country={iso}&q={q}&search_type=keyword_unordered&media_type=all"
    head = f"Search {advertiser}'s live Facebook & Instagram ads in Meta's Ad Library ({iso})."
    return [Ad(
        id=f"fb-search-{_slug(advertiser)}", advertiser=advertiser, platform="facebook",
        country=country, format="ad library", language="english",
        headline_original=head, headline_translation=head,
        offer_type="Ad library search", days_active=0, performance_score=41, first_seen="",
        url=url, thumbnail_url="",
        is_ad=True, ad_type="library", ad_signal="meta_ad_library",
    )]


# ---------- YouTube (live) ----------
def _ytapi_key():
    s = get_settings()
    return s.rapidapi_ytapi_key or s.rapidapi_key


async def _yt_stats(vid: str) -> dict:
    """Per-video stats (likes + views) via yt-api /video/info. {} on failure."""
    s = get_settings()
    d = await _req("GET", s.rapidapi_ytapi_host, "/video/info",
                   params={"id": vid}, key=_ytapi_key())
    if not d:
        return {}
    return {"likes": _int(d.get("likeCount")), "views": _int(d.get("viewCount"))}


def _lentext_secs(lt: str):
    """'2:15' -> 135 seconds; '1:02:03' -> 3723. None if unparseable."""
    try:
        parts = [int(x) for x in (lt or "").split(":")]
        if len(parts) == 2:
            return parts[0] * 60 + parts[1]
        if len(parts) == 3:
            return parts[0] * 3600 + parts[1] * 60 + parts[2]
    except Exception:
        pass
    return None


async def fetch_youtube(advertiser: str, country: str = "", handle: str = "", limit: int = 6) -> list[Ad]:
    """YouTube via yt-api (large quota). Search, then keep ONLY videos from the
    competitor's OWN channel (channelTitle/handle match), then enrich likes+views."""
    s = get_settings()
    data = await _req("GET", s.rapidapi_ytapi_host, "/search",
                      params={"query": advertiser}, key=_ytapi_key())
    target, hnorm = _norm(advertiser), _norm(handle)

    def _official(it: dict) -> bool:
        for cn in (_norm(it.get("channelTitle")), _norm(it.get("channelHandle"))):
            if not cn:
                continue
            if cn == target or (len(target) >= 4 and target in cn) or (len(cn) >= 4 and cn in target):
                return True
            if hnorm and (cn == hnorm or (len(hnorm) >= 4 and hnorm in cn)):
                return True
        return False

    ads: list[Ad] = []
    for it in ((data or {}).get("data") or []):
        if it.get("type") != "video" or not _official(it):
            continue                                  # official channel only
        title = (it.get("title") or "").strip()[:180]
        vid = it.get("videoId")
        if not title or not vid:
            continue
        ar = _has_arabic(title)
        thumbs = it.get("thumbnail")
        if isinstance(thumbs, list) and thumbs:
            thumb = thumbs[-1].get("url", "")         # last = largest
        else:
            thumb = thumbs if isinstance(thumbs, str) else ""
        ads.append(Ad(
            id=str(vid), advertiser=advertiser, platform="youtube", country=country,
            format="video", language="arabic" if ar else "english",
            headline_original=title, headline_translation="" if ar else title,
            offer_type="Video", days_active=0, performance_score=45, first_seen="",
            url=f"https://www.youtube.com/watch?v={vid}",
            thumbnail_url=thumb or "",
            embed_url=f"https://www.youtube.com/embed/{vid}",
            duration=_lentext_secs(it.get("lengthText")),
            posted=it.get("publishedTimeText") or "",
            views=_int(it.get("viewCount")),
        ))
        if len(ads) >= limit:
            break
    # enrich with likes (+refine views) via /video/info, concurrently
    stats = await asyncio.gather(*[_yt_stats(a.id) for a in ads], return_exceptions=True)
    for a, st in zip(ads, stats):
        if isinstance(st, dict):
            if st.get("likes") is not None:
                a.likes = st["likes"]
            if st.get("views") is not None:
                a.views = st["views"]
    return ads


# ---------- Twitter / X (live) ----------
def _tw_days(created_at: str) -> int:
    """Parse Twitter's 'Wed Jul 08 06:02:45 +0000 2026' date into age in days."""
    try:
        d = datetime.strptime(created_at, "%a %b %d %H:%M:%S %z %Y")
        return max(0, (datetime.now(timezone.utc) - d).days)
    except Exception:
        return 0


def _tw_find_tweets(obj, out: list) -> None:
    """Twitter241 returns GraphQL-nested data; walk it to collect Tweet objects."""
    if isinstance(obj, dict):
        if obj.get("__typename") == "Tweet" and "legacy" in obj:
            out.append(obj)
        for v in obj.values():
            _tw_find_tweets(v, out)
    elif isinstance(obj, list):
        for v in obj:
            _tw_find_tweets(v, out)


def _tw_find_users(obj, out: list) -> None:
    if isinstance(obj, dict):
        if obj.get("__typename") == "User" and obj.get("core"):
            out.append(obj)
        for v in obj.values():
            _tw_find_users(v, out)
    elif isinstance(obj, list):
        for v in obj:
            _tw_find_users(v, out)


def _norm(s: str) -> str:
    return re.sub(r"[^a-z0-9]", "", (s or "").lower())


async def _tw_resolve(advertiser: str, tkey: str, handle_hint: str = ""):
    """Resolve a brand → (rest_id, screen_name), or (None, None).

    Handle guessing alone is fragile (AWS→@awscloud, Anthropic→@AnthropicAI), so:
    0) if discovery gave an official handle, use it first.
    1) try the guessed @handle; if it resolves, use it.
    2) else People-search and pick the account whose NAME/handle matches the brand
       (not merely the first result, which can be an unrelated verified account).
    """
    s = get_settings()
    handle = handle_hint or IG_HANDLES.get(advertiser.lower(), _slug(advertiser))
    u = await _req("GET", s.rapidapi_twitter_host, "/user", params={"username": handle}, key=tkey)
    res = ((((u or {}).get("result") or {}).get("data") or {}).get("user") or {}).get("result") or {}
    if res.get("rest_id"):
        return res["rest_id"], ((res.get("core") or {}).get("screen_name")) or handle

    q = re.sub(r"\(.*?\)", "", advertiser).strip()          # drop "(AWS)"-style suffixes
    data = await _req("GET", s.rapidapi_twitter_host, "/search-v2",
                      params={"type": "People", "count": "8", "query": q}, key=tkey)
    users: list = []
    _tw_find_users(data, users)
    target, qn, hn = _norm(advertiser), _norm(q), _norm(handle)

    def nm(us): return _norm((us.get("core") or {}).get("name"))
    def sn(us): return _norm((us.get("core") or {}).get("screen_name"))

    strong = [us for us in users if nm(us) in (target, qn) or sn(us) in (hn, qn)]
    pick = strong[0] if strong else next((us for us in users if qn and qn in sn(us)), None)
    if pick:
        return pick.get("rest_id"), (pick.get("core") or {}).get("screen_name")
    return None, None


async def fetch_twitter(advertiser: str, country: str = "", handle: str = "", limit: int = 6) -> list[Ad]:
    s = get_settings()
    tkey = s.rapidapi_twitter_key or s.rapidapi_key   # X may use its own account key
    rid, screen = await _tw_resolve(advertiser, tkey, handle)
    if not rid:
        return []
    screen = screen or _slug(advertiser)
    # fetch that account's own recent posts
    data = await _req("GET", s.rapidapi_twitter_host, "/user-tweets",
                      params={"user": rid, "count": "20"}, key=tkey)
    found: list = []
    _tw_find_tweets(data, found)
    ads: list[Ad] = []
    for tw in found:
        lg = tw.get("legacy") or {}
        if lg.get("retweeted_status_result"):
            continue  # skip retweets — we want the brand's own content
        text = (lg.get("full_text") or "").strip()
        if not text:
            continue
        text = re.sub(r"\s*https://t\.co/\S+\s*$", "", text).strip()  # drop trailing t.co
        text = " ".join(ln.strip() for ln in text.splitlines() if ln.strip())  # collapse newlines
        head = text[:180]
        tid = lg.get("id_str") or tw.get("rest_id")
        media = (lg.get("extended_entities") or {}).get("media") or []
        is_video = any(m.get("type") in ("video", "animated_gif") for m in media)
        thumb = (media[0].get("media_url_https") if media else "") or ""
        media_url = ""
        if is_video and media:
            variants = (media[0].get("video_info") or {}).get("variants") or []
            mp4 = [v for v in variants if v.get("content_type") == "video/mp4" and v.get("bitrate") is not None]
            if mp4:
                media_url = max(mp4, key=lambda v: v.get("bitrate", 0)).get("url", "")
        arabic = _has_arabic(text)
        days = _tw_days(lg.get("created_at") or "")
        ads.append(Ad(
            id=str(tid or head[:20]), advertiser=advertiser, platform="twitter", country=country,
            format="video" if is_video else ("image" if media else "text"),
            language="arabic" if arabic else "english",
            headline_original=head, headline_translation="" if arabic else head,
            offer_type="Post", days_active=days,
            performance_score=min(100, 40 + days), first_seen="",
            url=f"https://x.com/{screen}/status/{tid}" if tid else f"https://x.com/{screen}",
            thumbnail_url=thumb, media_url=media_url,
            likes=_int(lg.get("favorite_count")), comments=_int(lg.get("reply_count")),
            views=_int((tw.get("views") or {}).get("count")), shares=_int(lg.get("retweet_count")),
        ))
        if len(ads) >= limit:
            break
    return ads


# ---------- Meta Ad Library (live: REAL paid Facebook + Instagram ads) ----------
# CTA type -> a human "objective" label for the "offers & objectives" signal
_CTA_OFFER = {
    "INSTALL_MOBILE_APP": "App install", "USE_APP": "App engagement",
    "LEARN_MORE": "Awareness", "SHOP_NOW": "Shop now", "GET_OFFER": "Offer",
    "SIGN_UP": "Sign up", "SUBSCRIBE": "Subscribe", "ORDER_NOW": "Order now",
    "GET_QUOTE": "Lead gen", "CONTACT_US": "Lead gen", "BOOK_TRAVEL": "Booking",
    "WHATSAPP_MESSAGE": "WhatsApp", "CALL_NOW": "Call", "DOWNLOAD": "Download",
    "GET_DIRECTIONS": "Footfall", "OPEN_LINK": "Traffic", "NO_BUTTON": "Awareness",
}


def _is_tmpl(s: str) -> bool:
    """Dynamic-creative (DCO) fields arrive as templates like '{{product.name}}'."""
    return "{{" in (s or "")


def _meta_text(item: dict) -> str:
    """Best real creative text: prefer literal ad copy, fall back through the
    card body/title, skipping any un-rendered DCO template placeholders."""
    cards = item.get("cards") or []
    c0 = cards[0] if cards else {}
    for cand in (item.get("adCopy"), item.get("headline"), c0.get("body"),
                 c0.get("title"), item.get("linkDescription"), item.get("caption")):
        c = (cand or "").strip()
        if c and not _is_tmpl(c):
            return " ".join(ln.strip() for ln in c.splitlines() if ln.strip())[:180]
    return ""


def _meta_media(item: dict) -> tuple[str, str]:
    """(thumbnail_url, video_url) from the ad's top-level media or its cards."""
    imgs = [u for u in (item.get("imageUrls") or []) if isinstance(u, str)]
    vids = [u for u in (item.get("videoUrls") or []) if isinstance(u, str)]
    for cd in (item.get("cards") or []):
        if cd.get("imageUrl"):
            imgs.append(cd["imageUrl"])
        if cd.get("videoUrl"):
            vids.append(cd["videoUrl"])
    return (imgs[0] if imgs else ""), (vids[0] if vids else "")


async def fetch_meta_ads(advertiser: str, country: str = "", handle: str = "", limit: int = 8) -> list[Ad]:
    """Real paid ads the brand is running on Facebook + Instagram, via Meta's
    public Ad Library. Rich strategy signal: run-duration & active status =
    which creatives are proven enough that they keep paying to run them.

    Keyword search is fuzzy/global, so results are filtered to the brand's own
    page, and the selected country scopes the ads to that market.
    """
    s = get_settings()
    # Meta needs one country; default to a big GCC market for "All regions".
    iso = _iso(country) or "AE"
    body = {"query": advertiser, "country": iso, "maxAds": limit * 3,
            "activeStatus": "all", "mediaType": "all", "sortMode": "newest"}
    # Meta's Ad Library scraper is actor-backed and slow/variable — give it room.
    data = await _req("POST", s.rapidapi_meta_host, "/v1/meta-ads/search",
                      json_body=body, timeout=60.0, key=(s.rapidapi_meta_key or s.rapidapi_key))
    items = (data or {}).get("items") or []
    target = _norm(advertiser)
    ads: list[Ad] = []
    for it in items:
        page = _norm(it.get("pageName") or "")
        # relevance: only keep the brand's own page (drops unrelated fuzzy hits)
        if not (page and (page == target or target in page or page in target)):
            continue
        text = _meta_text(it)
        if not text:
            continue
        thumb, media = _meta_media(it)
        run = _int(it.get("runDurationDays")) or 0
        arabic = _has_arabic(text)
        arch = it.get("adArchiveId") or it.get("id")
        cta = (it.get("ctaType") or "").upper()
        offer = _CTA_OFFER.get(cta) or (it.get("ctaText") or "Paid ad")
        surfaces = ", ".join(p.title() for p in (it.get("platforms") or []) if isinstance(p, str))
        ads.append(Ad(
            id=str(arch), advertiser=advertiser, platform="meta", country=country,
            format="video" if media else "image",
            language="arabic" if arabic else "english",
            headline_original=text, headline_translation="" if arabic else text,
            offer_type=offer, days_active=run,
            performance_score=min(100, 45 + run),           # longevity = proven winner
            first_seen=(it.get("startDate") or "")[:10],
            url=f"https://www.facebook.com/ads/library/?id={arch}" if arch else "",
            thumbnail_url=thumb, media_url=media,
            posted=surfaces,                                # e.g. "Facebook, Instagram"
            is_ad=True, ad_type=(offer or "paid").lower(),  # Ad Library = confirmed paid
            ad_signal="meta_ad_library",
        ))
        if len(ads) >= limit:
            break
    return ads


LIVE_FETCHERS = {
    "meta": fetch_meta_ads,          # real paid FB+IG ads (Ad Library)
    "instagram": fetch_instagram,
    "google": fetch_google,          # kept for reference; NOT gathered (3rd-party results)
    "youtube": fetch_youtube,
    "twitter": fetch_twitter,
}
# Only sources that are the competitor's OWN official page/account.
# Google is excluded: its results are third-party pages ABOUT the brand, not the
# brand's own account/ads. (Meta/Instagram/X/YouTube are all resolved to the
# official page/handle/channel.)
LIVE_PLATFORMS = ["meta", "instagram", "youtube", "twitter"]
