"""Thin OpenRouter client for the flash model.

Used for (a) competitor discovery from a product and (b) understanding ad copy
(language/dialect detection, translation, classification). If no API key is set,
callers should fall back to mock data — see api.py.
"""
import json
import httpx
from ..config import get_settings


class OpenRouterClient:
    def __init__(self) -> None:
        self.s = get_settings()

    @property
    def enabled(self) -> bool:
        return self.s.model_enabled

    async def chat_json(self, system: str, user: str) -> dict:
        """Call the flash model and parse a JSON object from its reply."""
        if not self.enabled:
            raise RuntimeError("OPENROUTER_API_KEY not set")
        headers = {
            "Authorization": f"Bearer {self.s.openrouter_api_key}",
            "Content-Type": "application/json",
            # OpenRouter attribution headers (optional but recommended):
            "HTTP-Referer": self.s.frontend_origin,
            "X-Title": "Gulf Ad Intelligence",
        }
        payload = {
            "model": self.s.openrouter_model,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            "response_format": {"type": "json_object"},
            "temperature": 0.2,
        }
        async with httpx.AsyncClient(timeout=60) as client:
            resp = await client.post(
                f"{self.s.openrouter_base_url}/chat/completions",
                headers=headers, json=payload,
            )
            resp.raise_for_status()
            content = resp.json()["choices"][0]["message"]["content"]
        try:
            return json.loads(content)
        except json.JSONDecodeError:
            # some models wrap JSON in prose/fences — extract the first {...}
            start, end = content.find("{"), content.rfind("}")
            return json.loads(content[start:end + 1])


client = OpenRouterClient()


ENRICH_SYSTEM = (
    "You process competitor social/ad creatives. A TOPIC (the user's product area) may be given. "
    "For EACH item return JSON "
    '{"items":{"<i>":{"en":str,"is_ad":bool,"ad_type":str,"relevant":bool}}} where: '
    "en = concise natural English of the text (echo it back if already English); "
    "is_ad = true if the post is MARKETING/PROMOTIONAL content the company puts out to promote "
    "itself or its product — this INCLUDES product launches & announcements, new features, "
    "capabilities/model releases, offers/pricing, demos, free trials, CTAs, event/webinar promos, "
    "partnership & customer-win announcements, and brand/awareness campaigns. "
    "is_ad = false ONLY for clearly non-marketing posts: job/hiring posts, pure replies to users, "
    "condolences/holiday greetings with no product, and personal/community chatter. "
    "When in doubt for a company's own account, lean is_ad=true (a brand's own feed is mostly "
    "marketing). ad_type = one of launch|offer|demo|feature|pricing|awareness|event|partnership|other. "
    "relevant = judge at the SPECIFIC-PRODUCT level (not the broad industry). Many competitors "
    "sell MULTIPLE products from one account — we only want ads for the SAME product/service the "
    "user sells. Set relevant = true when the creative promotes or features the SAME "
    "product/service as TOPIC, or is general brand content for that same product line (or when "
    "TOPIC is empty/unknown). Set relevant = FALSE when the creative promotes a DIFFERENT product "
    "line the company also sells (e.g. TOPIC='potato chips' but the ad is for the brand's soft "
    "drinks, biscuits or nuts), or an unrelated subject. Example: TOPIC='AI voice agents' -> keep "
    "voice/speech-AI ads, drop that company's unrelated cloud-storage or gaming ads. "
    "If an item's native_paid is true, keep is_ad true."
)


async def enrich_ads(ads, topic: str = "", cap: int = 12) -> None:
    """One flash-model pass over gathered creatives: (a) translate Arabic/Arabizi to
    English, (b) classify PAID-ad vs organic, (c) judge topical relevance to `topic`.
    Mutates in place; native paid signals (is_ad already True) are preserved.
    Silent on any failure."""
    if not client.enabled or not ads:
        return
    batch = ads[:cap]
    items = [{"i": i, "platform": a.platform, "text": a.headline_original,
              "native_paid": a.is_ad} for i, a in enumerate(batch)]
    payload = {"topic": topic or "", "items": items}
    try:
        data = await client.chat_json(ENRICH_SYSTEM, json.dumps(payload, ensure_ascii=False))
        out = data.get("items") or {}
        for i, a in enumerate(batch):
            r = out.get(str(i)) or out.get(i) or {}
            en = r.get("en")
            if en and a.language in ("arabic", "arabizi", "bilingual") and not a.headline_translation:
                a.headline_translation = en
            if not a.is_ad and isinstance(r.get("is_ad"), bool):
                a.is_ad = r["is_ad"]
                if a.is_ad and not a.ad_signal:
                    a.ad_signal = "model"
            if not a.ad_type and r.get("ad_type"):
                a.ad_type = r["ad_type"]
            if isinstance(r.get("relevant"), bool):
                a.relevant = r["relevant"]
    except Exception:
        pass


# backwards-compatible alias (older call sites)
translate_ads = enrich_ads


DISCOVER_SYSTEM = (
    "You are a competitive-intelligence analyst. You are given a description of a company / "
    "product / service (and, when available, text scraped from its website) plus a target "
    "COUNTRY/REGION.\n"
    "STEP 1 — Infer PRECISELY what product or service this is: the specific category and offering "
    "(e.g. 'South-Indian restaurant', 'ride-hailing app', 'AI voice-agent platform', "
    "'orthodontic clinic', 'online grocery delivery').\n"
    "STEP 2 — List the real, well-known COMPETITORS that offer the SAME product/service AND that "
    "operate in / are prominent in the given COUNTRY/REGION.\n"
    "STRICT RULES:\n"
    "- SAME SERVICE ONLY: every competitor must offer essentially the same product/service — the "
    "direct alternatives a customer in that region would choose between. NEVER return tangential, "
    "loosely-related, or random companies, and NEVER default to tech/AI companies unless the "
    "product itself is a tech/AI product.\n"
    "- IN-REGION ONLY: they must actually operate in / serve the selected region (local businesses, "
    "regional chains, or international brands with a real presence there). Do NOT list global names "
    "that are not available in that region.\n"
    "- ANY INDUSTRY: works for restaurants, retail, clinics, gyms, telecom, banking, software, AI, "
    "etc. Examples: 'Indian restaurant' + Qatar -> well-known Indian restaurants IN QATAR (e.g. "
    "Saravanaa Bhavan, Chingari, Maharaja, Asha's); 'AI voice agents' + UAE -> voice-AI vendors "
    "serving the UAE (ElevenLabs, plus regional players like G42/Inception). Match the industry to "
    "the product — do not mix industries.\n"
    "- Prefer the most prominent/famous players in that region first.\n"
    "- COVERAGE: return the ~5 biggest players in that region PLUS as many genuine NATIVE/LOCAL "
    "same-service companies as exist (aim for several) — the local/regional brands matter most, "
    "so include them generously as long as they truly offer the same service.\n"
    "Return AT LEAST 6 (fewer only if the region genuinely has fewer). Strict JSON: "
    '{"competitors":[{"name":str,"handle":str,"kind":str,"origin":"global|regional",'
    '"tier":"leader|challenger|emerging","confidence":0..1,"reason":str}]} '
    "where handle = the company's official social @handle WITHOUT the @ (best known), "
    "kind = a SHORT label of the company type in this market (e.g. 'Indian restaurant', "
    "'Ride-hailing app', 'AI voice startup'), origin = 'regional' if the company is local/native to "
    "the region else 'global' (a global brand that operates there), tier = leader|challenger|emerging. "
    "Each reason must, in one line, state the SAME service they provide and their presence in the region."
)

VERIFY_SYSTEM = (
    "You are a strict competitor-verification checker. You are given a target PRODUCT/SERVICE "
    "description, a REGION, and a list of candidate competitor companies. For EACH candidate decide "
    "skeptically: does this company REALLY offer the SAME core product/service as the target, AND "
    "does it actually operate in / serve that region? Exclude anything tangential, from a different "
    "industry, or not present in the region. "
    'Return strict JSON {"verdicts":{"<exact candidate name>":{"same_service":bool,"in_region":bool,'
    '"confidence":0..1}}} using each candidate\'s EXACT name as the key.'
)


async def verify_competitors(description: str, region: str, names: list[str], cap: int = 16):
    """Second, adversarial pass: keep only candidates that truly offer the SAME
    service in-region. Returns a set of names to KEEP, or None to skip filtering
    (model off / error) so we never accidentally drop everything."""
    if not client.enabled or not names:
        return None
    payload = {"target": description or "", "region": region or "", "candidates": names[:cap]}
    try:
        data = await client.chat_json(VERIFY_SYSTEM, json.dumps(payload, ensure_ascii=False))
        v = data.get("verdicts") or {}
        keep = set()
        for n in names:
            r = v.get(n) or v.get(n.strip()) or {}
            if (r.get("same_service") and r.get("in_region", True)
                    and float(r.get("confidence", 0) or 0) >= 0.5):
                keep.add(n)
        return keep
    except Exception:
        return None


ANALYZE_SYSTEM = (
    "You analyse a single advertising creative's text. Detect language and dialect "
    "(Arabic MSA / Arabic Gulf / English / bilingual / Arabizi), translate to English, "
    "and classify. Return strict JSON: "
    '{"language":str,"headline_translation":str,"offer_type":str,'
    '"objective":str,"tone":str}.'
)
