"""Mock data so the whole app is explorable before real APIs/DB are connected.
Scenario: a telecom brand in Qatar benchmarking Ooredoo & Vodafone."""
from .schemas import Competitor, Ad, CompetitorSummary


def mock_competitors(product) -> list[Competitor]:
    """Fallback list — CORE AI companies that BUILD the product (not adopters)."""
    cat = product.category.lower()
    return [
        Competitor(id="openai", name="OpenAI", tier="leader", confidence=0.95,
                   share_of_voice=30.0, kind="Foundation model", handle="openai", origin="global",
                   reason=f"Builds the foundation models that power {cat} products"),
        Competitor(id="google-deepmind", name="Google DeepMind", tier="leader", confidence=0.9,
                   share_of_voice=20.0, kind="Big-tech AI", handle="googledeepmind", origin="global",
                   reason=f"Big-tech AI division shipping {cat} models and APIs"),
        Competitor(id="elevenlabs", name="ElevenLabs", tier="challenger", confidence=0.84,
                   share_of_voice=12.0, kind="AI startup", handle="elevenlabsio", origin="global",
                   reason=f"Specialist AI vendor for {cat}"),
        # regional / native AI builders (GCC / Arab region)
        Competitor(id="g42", name="G42", tier="leader", confidence=0.8,
                   share_of_voice=14.0, kind="Big-tech AI", handle="g42ai", origin="regional",
                   reason=f"UAE AI group (Inception / Jais Arabic LLM) building {cat}"),
        Competitor(id="tii", name="TII (Falcon)", tier="challenger", confidence=0.74,
                   share_of_voice=10.0, kind="Foundation model", handle="tiiuae", origin="regional",
                   reason="Abu Dhabi lab behind the Falcon open models"),
        Competitor(id="humain", name="HUMAIN (ALLAM)", tier="challenger", confidence=0.7,
                   share_of_voice=None, kind="Foundation model", handle="humain", origin="regional",
                   reason="Saudi (PIF) AI company behind the ALLAM Arabic LLM"),
    ]


# Illustrative ONLY — used when no API keys are set at all. On-brand (core AI
# companies) so it can never leak unrelated telecom brands into a live session.
MOCK_ADS: list[Ad] = [
    Ad(id="a1", advertiser="OpenAI", platform="instagram", country="", format="image",
       language="english", headline_original="Introducing GPT voice — natural, real-time speech for every app.",
       headline_translation="Introducing GPT voice — natural, real-time speech for every app.",
       offer_type="Launch", days_active=12, performance_score=72, first_seen="",
       url="https://www.instagram.com/openai/", likes=9901, comments=342,
       is_ad=True, ad_type="launch", ad_signal="mock"),
    Ad(id="a2", advertiser="ElevenLabs", platform="twitter", country="", format="video",
       language="english", headline_original="Introducing ElevenAgents — the fastest way to build a voice agent.",
       headline_translation="Introducing ElevenAgents — the fastest way to build a voice agent.",
       offer_type="Launch", days_active=6, performance_score=66, first_seen="",
       url="https://x.com/elevenlabsio", likes=579, comments=112, views=133733, shares=109,
       is_ad=True, ad_type="launch", ad_signal="mock"),
    Ad(id="a3", advertiser="Deepgram", platform="meta", country="", format="image",
       language="english", headline_original="Ship voice AI with the lowest-latency speech-to-text API. Start free.",
       headline_translation="Ship voice AI with the lowest-latency speech-to-text API. Start free.",
       offer_type="Free trial", days_active=23, performance_score=68, first_seen="",
       url="https://www.facebook.com/ads/library/?q=Deepgram",
       is_ad=True, ad_type="offer", ad_signal="meta_ad_library"),
]


def mock_ads(advertiser: str | None = None, platform: str | None = None) -> list[Ad]:
    ads = MOCK_ADS
    if advertiser:
        ads = [a for a in ads if a.advertiser.lower() == advertiser.lower()]
    if platform:
        ads = [a for a in ads if a.platform == platform]
    return sorted(ads, key=lambda a: a.performance_score, reverse=True)


def mock_summaries() -> list[CompetitorSummary]:
    return [
        CompetitorSummary(competitor="OpenAI", active_ads=54, share_of_voice=44.0,
                          top_platform="meta", longest_running_days=31,
                          platform_mix={"meta": 34, "instagram": 26, "youtube": 24, "twitter": 16}),
        CompetitorSummary(competitor="ElevenLabs", active_ads=38, share_of_voice=30.0,
                          top_platform="instagram", longest_running_days=22,
                          platform_mix={"instagram": 40, "meta": 22, "twitter": 24, "youtube": 14}),
    ]
