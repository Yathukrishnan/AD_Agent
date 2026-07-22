"""Turso / libSQL persistence + cache.

Design principles:
- The DB is an accelerator + store, never a hard dependency. Every function is
  wrapped so a DB error returns a safe default (None / no-op) and the caller
  falls back to live gathering or mock — the app never breaks on a DB issue.
- Credentials come from settings (env), never hardcoded or logged.
- `libsql://` is upgraded to `https://` (the websocket transport fails on Turso
  from some hosts; HTTP is reliable).
"""
import json
import time
import libsql_client
from .config import get_settings
from .schemas import Competitor

_client = None
ADS_TTL = 6 * 3600          # cache gathered ads for 6 hours
COMPETITOR_TTL = 24 * 3600  # cache discovered competitors for 24 hours


def _http_url(url: str) -> str:
    # normalise the Turso scheme to https; tolerate a common paste typo where the
    # leading char is dropped (e.g. "ibsql://") so a bad value degrades gracefully.
    u = (url or "").strip()
    if u.startswith("libsql://"):
        return "https://" + u[len("libsql://"):]
    if u.startswith("ibsql://"):
        return "https://" + u[len("ibsql://"):]
    return u


def get_db():
    global _client
    s = get_settings()
    if not s.db_enabled:
        return None
    if _client is None:
        try:
            _client = libsql_client.create_client(url=_http_url(s.database_url),
                                                  auth_token=s.database_token)
        except Exception as e:
            # DB is an accelerator, never a hard dependency — a bad/misconfigured
            # DATABASE_URL disables caching instead of crashing app startup.
            print(f"[db] disabled — could not init client: {e}")
            _client = None
            return None
    return _client


async def close_db() -> None:
    global _client
    if _client is not None:
        try:
            await _client.close()
        except Exception:
            pass
        _client = None


async def init_db() -> None:
    db = get_db()
    if not db:
        return
    try:
        await db.batch([
            "CREATE TABLE IF NOT EXISTS ads_cache (cache_key TEXT PRIMARY KEY, payload TEXT NOT NULL, fetched_at INTEGER NOT NULL)",
            "CREATE TABLE IF NOT EXISTS competitors3 (id TEXT, name TEXT, tier TEXT, confidence REAL, reason TEXT, kind TEXT, handle TEXT, origin TEXT, product TEXT, country TEXT, updated_at INTEGER, PRIMARY KEY (id, product, country))",
            "CREATE TABLE IF NOT EXISTS products (id TEXT PRIMARY KEY, name TEXT, category TEXT, country TEXT, created_at INTEGER)",
        ])
    except Exception:
        pass


# ---------- ads cache ----------
async def cache_get_ads(key: str):
    db = get_db()
    if not db:
        return None
    try:
        rs = await db.execute("SELECT payload, fetched_at FROM ads_cache WHERE cache_key = ?", [key])
        if not rs.rows:
            return None
        payload, fetched_at = rs.rows[0][0], rs.rows[0][1]
        if time.time() - int(fetched_at) > ADS_TTL:
            return None
        return json.loads(payload)
    except Exception:
        return None


async def cache_put_ads(key: str, data: list) -> None:
    db = get_db()
    if not db:
        return
    try:
        await db.execute(
            "INSERT OR REPLACE INTO ads_cache (cache_key, payload, fetched_at) VALUES (?, ?, ?)",
            [key, json.dumps(data), int(time.time())],
        )
    except Exception:
        pass


# ---------- competitors (persist + read-through cache) ----------
async def get_competitors(product) -> list[Competitor] | None:
    db = get_db()
    if not db:
        return None
    try:
        rs = await db.execute(
            "SELECT id,name,tier,confidence,reason,kind,handle,origin FROM competitors3 WHERE product = ? AND country = ? AND updated_at > ?",
            [product.name, product.country, int(time.time()) - COMPETITOR_TTL],
        )
        if not rs.rows:
            return None
        return [Competitor(id=r[0], name=r[1], tier=r[2], confidence=r[3], reason=r[4],
                           kind=r[5] or "", handle=r[6] or "", origin=r[7] or "") for r in rs.rows]
    except Exception:
        return None


async def save_competitors(product, comps: list[Competitor]) -> None:
    db = get_db()
    if not db or not comps:
        return
    now = int(time.time())
    try:
        stmts = [libsql_client.Statement(
            "INSERT OR REPLACE INTO competitors3 (id,name,tier,confidence,reason,kind,handle,origin,product,country,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
            [c.id, c.name, c.tier, c.confidence, c.reason, c.kind, c.handle, c.origin, product.name, product.country, now],
        ) for c in comps]
        await db.batch(stmts)
    except Exception:
        pass


async def save_product(product) -> None:
    db = get_db()
    if not db:
        return
    try:
        pid = f"{product.name}|{product.country}".lower()
        await db.execute(
            "INSERT OR REPLACE INTO products (id,name,category,country,created_at) VALUES (?,?,?,?,?)",
            [pid, product.name, product.category, product.country, int(time.time())],
        )
    except Exception:
        pass
