import sqlite3
import os
import builtins
from datetime import datetime
import json

DB_FILE = 'companion.db'

def safe_print(*args, **kwargs):
    try:
        builtins.print(*args, **kwargs)
    except UnicodeEncodeError:
        new_args = []
        for arg in args:
            if isinstance(arg, str):
                new_args.append(arg.encode('ascii', errors='backslashreplace').decode('ascii'))
            elif isinstance(arg, (dict, list)):
                try:
                    s = json.dumps(arg, indent=2)
                    new_args.append(s.encode('ascii', errors='backslashreplace').decode('ascii'))
                except Exception:
                    new_args.append(repr(arg))
            else:
                new_args.append(arg)
        try:
            builtins.print(*new_args, **kwargs)
        except Exception:
            pass

# Local module print override
print = safe_print

def get_db_connection():
    """
    Returns a new SQLite database connection with row factory configured.
    """
    conn = sqlite3.connect(DB_FILE, timeout=15.0)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    """
    Initializes the database schema if tables do not exist.
    """
    print(f"[Database] Initializing SQLite database at {DB_FILE}...")
    try:
        with get_db_connection() as conn:
            conn.execute('''
                CREATE TABLE IF NOT EXISTS settings (
                    key TEXT PRIMARY KEY,
                    value TEXT,
                    updated_at TEXT
                )
            ''')
            conn.execute('''
                CREATE TABLE IF NOT EXISTS feed_cache (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    xml_data TEXT,
                    last_fetched TEXT
                )
            ''')
            conn.execute('''
                CREATE TABLE IF NOT EXISTS known_entries (
                    entry_id TEXT PRIMARY KEY,
                    discovered_at TEXT
                )
            ''')
            conn.commit()
        print("[Database] Schema initialized successfully.")
    except Exception as e:
        print(f"[Database] Initialization error: {e}")

def db_get_setting(key, default=""):
    """
    Retrieves a setting value from the settings table.
    """
    try:
        with get_db_connection() as conn:
            row = conn.execute('SELECT value FROM settings WHERE key = ?', (key,)).fetchone()
            return row['value'] if row else default
    except Exception as e:
        print(f"[Database Error] db_get_setting failed: {e}")
        return default

def db_set_setting(key, value):
    """
    Inserts or updates a setting value in the settings table.
    """
    try:
        now = datetime.utcnow().isoformat()
        with get_db_connection() as conn:
            conn.execute('''
                INSERT INTO settings (key, value, updated_at)
                VALUES (?, ?, ?)
                ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at
            ''', (key, value, now))
            conn.commit()
        return True
    except Exception as e:
        print(f"[Database Error] db_set_setting failed: {e}")
        return False

def db_get_cache():
    """
    Retrieves the cached feed XML data and last fetched timestamp.
    """
    try:
        with get_db_connection() as conn:
            row = conn.execute('SELECT xml_data, last_fetched FROM feed_cache ORDER BY id DESC LIMIT 1').fetchone()
            if row:
                return row['xml_data'], row['last_fetched']
    except Exception as e:
        print(f"[Database Error] db_get_cache failed: {e}")
    return None, None

def db_set_cache(xml_data):
    """
    Saves the feed XML data in the cache and returns the timestamp.
    """
    try:
        now = datetime.now().strftime("%I:%M:%S %p")
        with get_db_connection() as conn:
            # Delete old cached items to keep DB size minimal
            conn.execute('DELETE FROM feed_cache')
            conn.execute('INSERT INTO feed_cache (xml_data, last_fetched) VALUES (?, ?)', (xml_data, now))
            conn.commit()
        return now
    except Exception as e:
        print(f"[Database Error] db_set_cache failed: {e}")
        return None

def db_add_known_entry(entry_id):
    """
    Marks a release note entry ID as known to prevent repeat alerts.
    """
    try:
        now = datetime.utcnow().isoformat()
        with get_db_connection() as conn:
            conn.execute('INSERT OR IGNORE INTO known_entries (entry_id, discovered_at) VALUES (?, ?)', (entry_id, now))
            conn.commit()
        return True
    except Exception as e:
        print(f"[Database Error] db_add_known_entry failed: {e}")
        return False

def db_load_all_known_entries():
    """
    Returns a set of all previously discovered feed entry IDs.
    """
    try:
        with get_db_connection() as conn:
            rows = conn.execute('SELECT entry_id FROM known_entries').fetchall()
            return {row['entry_id'] for row in rows}
    except Exception as e:
        print(f"[Database Error] db_load_all_known_entries failed: {e}")
        return set()
