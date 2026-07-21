"""Central configuration. Every credential is optional so the app runs on mock
data out of the box; fill .env to switch each piece to live."""
from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # OpenRouter (flash model)
    openrouter_api_key: str = ""
    openrouter_model: str = "google/gemini-2.5-flash"
    openrouter_base_url: str = "https://openrouter.ai/api/v1"

    # Database (to be provided)
    database_url: str = ""
    database_token: str = ""

    # Platform data APIs (legacy / optional)
    meta_adlib_token: str = ""
    linkedin_api_token: str = ""
    google_ads_token: str = ""
    youtube_api_token: str = ""

    # RapidAPI (one key, multiple hosts)
    rapidapi_key: str = ""
    rapidapi_facebook_host: str = "facebook-pages-scraper2.p.rapidapi.com"
    rapidapi_instagram_host: str = "instagram120.p.rapidapi.com"
    rapidapi_linkedin_host: str = "linkedin-data-api.p.rapidapi.com"
    rapidapi_google_host: str = "google-search74.p.rapidapi.com"
    rapidapi_youtube_host: str = "youtube138.p.rapidapi.com"   # legacy (quota-capped)
    # yt-api: much larger monthly quota + channel-aware search; primary YouTube source
    rapidapi_ytapi_host: str = "yt-api.p.rapidapi.com"
    rapidapi_ytapi_key: str = ""
    rapidapi_twitter_host: str = "twitter241.p.rapidapi.com"
    # Meta Ad Library — the authoritative source of real paid FB+IG ads
    rapidapi_meta_host: str = "meta-ad-library2.p.rapidapi.com"
    rapidapi_meta_key: str = ""   # its own key; falls back to shared rapidapi_key
    # Twitter/X may be subscribed under a different RapidAPI account, so it can
    # carry its own key; falls back to the shared rapidapi_key when unset.
    rapidapi_twitter_key: str = ""

    frontend_origin: str = "http://localhost:5173"

    @property
    def rapidapi_enabled(self) -> bool:
        return bool(self.rapidapi_key)

    @property
    def model_enabled(self) -> bool:
        return bool(self.openrouter_api_key)

    @property
    def db_enabled(self) -> bool:
        return bool(self.database_url)


@lru_cache
def get_settings() -> Settings:
    return Settings()
