"""Request/response models shared across the API."""
from typing import Optional
from pydantic import BaseModel

Platform = str   # "facebook" | "instagram" | "twitter" | "google" | "youtube"


class Product(BaseModel):
    name: str = ""
    category: str = ""
    description: str = ""       # free-text paragraph about the company/product/service
    website: str = ""           # optional company site URL — model analyses it
    country: str = "Qatar"
    known_competitors: list[str] = []
    platforms: list[Platform] = ["meta", "instagram", "twitter", "google", "youtube"]


class DiscoverRequest(BaseModel):
    product: Product


class Competitor(BaseModel):
    id: str
    name: str
    reason: str            # why it was flagged (transparency)
    tier: str              # leader | challenger | emerging
    confidence: float      # 0..1
    share_of_voice: Optional[float] = None
    kind: str = ""         # Foundation model | AI API/platform | AI startup | Big-tech AI | AI infra
    handle: str = ""       # official social handle (e.g. "elevenlabsio") for reliable gathering
    origin: str = ""       # "global" | "regional" (native to the selected region)


class Ad(BaseModel):
    id: str
    advertiser: str
    platform: Platform
    country: str
    format: str            # image | video | carousel | search
    language: str          # arabic | english | bilingual | arabizi
    headline_original: str
    headline_translation: str
    offer_type: str
    days_active: int
    performance_score: int
    first_seen: str
    url: str = ""              # link to view the original ad / post
    # --- ad classification ("looks paid") ---
    is_ad: bool = False        # confirmed-paid OR classified as promotional/ad-style
    ad_type: str = ""          # launch | offer | demo | feature | awareness | ...
    ad_signal: str = ""        # where the paid/ad signal came from (transparency)
    # --- media (for in-card preview / play) ---
    thumbnail_url: str = ""    # poster / preview image
    media_url: str = ""        # direct video file (e.g. Instagram clip)
    embed_url: str = ""        # iframe embed (e.g. YouTube player)
    duration: Optional[int] = None   # video length in seconds
    posted: str = ""           # human "posted" text, e.g. "3 years ago"
    # --- engagement (real "attraction" from the platform) ---
    likes: Optional[int] = None
    comments: Optional[int] = None
    views: Optional[int] = None
    shares: Optional[int] = None


class CompetitorSummary(BaseModel):
    competitor: str
    active_ads: int
    share_of_voice: float
    top_platform: str
    platform_mix: dict[str, float]
    longest_running_days: int


class AnalyzeRequest(BaseModel):
    text: str
    platform: Platform = "meta"
