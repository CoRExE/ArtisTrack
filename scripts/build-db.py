#!/usr/bin/env python3
"""
ArtisTrack - Script d'ingestion du GTFS Artis vers SQLite.
Télécharge le GTFS officiel depuis data.gouv.fr et génère assets/data/artis.db.
"""

import os
import io
import csv
import json
import sqlite3
import zipfile
import urllib.request
import time

GTFS_DATASET_API = "https://transport.data.gouv.fr/api/datasets"
DEFAULT_GTFS_URL = "https://static.data.gouv.fr/resources/reseau-de-transport-artis/20250829-085009/gtfs-20250828-151217.zip"
OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "..", "assets", "data")
OUTPUT_DB = os.path.join(OUTPUT_DIR, "artis.db")

def get_latest_gtfs_url():
    """Tente de trouver dynamiquement l'URL du dernier GTFS Artis sur transport.data.gouv.fr."""
    try:
        req = urllib.request.Request(GTFS_DATASET_API, headers={"User-Agent": "ArtisTrack/1.0"})
        with urllib.request.urlopen(req, timeout=10) as resp:
            datasets = json.loads(resp.read().decode("utf-8"))
            for d in datasets:
                if d.get("slug") == "reseau-de-transport-artis":
                    for res in d.get("resources", []):
                        if res.get("format") == "GTFS" and res.get("url"):
                            print(f"[+] URL trouvée sur transport.data.gouv.fr: {res.get('url')}")
                            return res.get("url")
    except Exception as e:
        print(f"[!] Erreur API ({e}), utilisation de l'URL par défaut.")
    return DEFAULT_GTFS_URL

def categorize_route(short_name: str) -> str:
    s = short_name.upper().strip()
    if s.startswith("CIT") or s in ("ACTI", "ARTOIS"):
        return "navette"
    if s.startswith("TAD") or s in ("TAC", "DIM"):
        return "tad"
    if s.startswith("C"):
        return "scolaire"
    if s.startswith("L"):
        num_part = s[1:]
        if num_part.isdigit():
            n = int(num_part)
            if 1 <= n <= 10:
                return "urbaine"
            else:
                return "periurbaine"
    if s.startswith("LD"):
        return "periurbaine"
    return "urbaine"

def build_database():
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    if os.path.exists(OUTPUT_DB):
        os.remove(OUTPUT_DB)

    gtfs_url = get_latest_gtfs_url()
    print(f"[1/5] Téléchargement du GTFS ({gtfs_url})...")
    req = urllib.request.Request(gtfs_url, headers={"User-Agent": "ArtisTrack/1.0"})
    with urllib.request.urlopen(req) as resp:
        gtfs_bytes = resp.read()

    zf = zipfile.ZipFile(io.BytesIO(gtfs_bytes))
    print(f"[+] Archive reçue ({len(gtfs_bytes) / 1024:.1f} Ko). Fichiers : {zf.namelist()}")

    print(f"[2/5] Création de la base SQLite {OUTPUT_DB}...")
    conn = sqlite3.connect(OUTPUT_DB)
    cur = conn.cursor()

    cur.execute("""
    CREATE TABLE IF NOT EXISTS agency (
        agency_id TEXT PRIMARY KEY,
        agency_name TEXT,
        agency_url TEXT,
        agency_timezone TEXT,
        agency_lang TEXT,
        agency_phone TEXT
    )""")

    cur.execute("""
    CREATE TABLE IF NOT EXISTS stops (
        stop_id TEXT PRIMARY KEY,
        stop_code TEXT,
        stop_name TEXT,
        stop_desc TEXT,
        stop_lat REAL,
        stop_lon REAL,
        location_type INTEGER DEFAULT 0,
        parent_station TEXT,
        wheelchair_boarding INTEGER DEFAULT 0
    )""")

    cur.execute("""
    CREATE TABLE IF NOT EXISTS routes (
        route_id TEXT PRIMARY KEY,
        agency_id TEXT,
        route_short_name TEXT,
        route_long_name TEXT,
        route_desc TEXT,
        route_type INTEGER,
        route_color TEXT,
        route_text_color TEXT,
        route_sort_order INTEGER DEFAULT 0,
        category TEXT DEFAULT 'urbaine'
    )""")

    cur.execute("""
    CREATE TABLE IF NOT EXISTS trips (
        trip_id TEXT PRIMARY KEY,
        route_id TEXT,
        service_id TEXT,
        trip_headsign TEXT,
        trip_short_name TEXT,
        direction_id INTEGER DEFAULT 0,
        wheelchair_accessible INTEGER DEFAULT 0
    )""")

    cur.execute("""
    CREATE TABLE IF NOT EXISTS calendar (
        service_id TEXT PRIMARY KEY,
        monday INTEGER,
        tuesday INTEGER,
        wednesday INTEGER,
        thursday INTEGER,
        friday INTEGER,
        saturday INTEGER,
        sunday INTEGER,
        start_date TEXT,
        end_date TEXT
    )""")

    cur.execute("""
    CREATE TABLE IF NOT EXISTS calendar_dates (
        service_id TEXT,
        date TEXT,
        exception_type INTEGER
    )""")

    cur.execute("""
    CREATE TABLE IF NOT EXISTS stop_times (
        trip_id TEXT,
        arrival_time TEXT,
        departure_time TEXT,
        stop_id TEXT,
        stop_sequence INTEGER,
        pickup_type INTEGER DEFAULT 0,
        drop_off_type INTEGER DEFAULT 0
    )""")

    tables_to_load = [
        ("agency", "agency.txt"),
        ("stops", "stops.txt"),
        ("routes", "routes.txt"),
        ("trips", "trips.txt"),
        ("calendar", "calendar.txt"),
        ("calendar_dates", "calendar_dates.txt"),
        ("stop_times", "stop_times.txt"),
    ]

    print("[3/5] Insertion des données...")
    for tbl, filename in tables_to_load:
        if filename not in zf.namelist():
            print(f"  [-] {filename} absent du zip, ignoré.")
            continue
        with zf.open(filename) as f:
            reader = csv.DictReader(io.TextIOWrapper(f, encoding="utf-8-sig"))
            cols = [c[1] for c in cur.execute(f"PRAGMA table_info({tbl})").fetchall() if c[1] != 'category']
            cols_str = ",".join(cols)
            placeholders = ",".join(["?"] * len(cols))
            rows = [[row.get(c, None) for c in cols] for row in reader]
            cur.executemany(f"INSERT INTO {tbl} ({cols_str}) VALUES ({placeholders})", rows)
            print(f"  [✓] {tbl} : {len(rows)} enregistrements insérés.")

    print("[4/5] Post-traitement et enrichissement des données...")
    # Calcul des catégories de routes
    routes_rows = cur.execute("SELECT route_id, route_short_name FROM routes").fetchall()
    for r_id, s_name in routes_rows:
        cat = categorize_route(s_name)
        cur.execute("UPDATE routes SET category = ? WHERE route_id = ?", (cat, r_id))

    # Calcul automatique des destinations (trip_headsign) à partir du terminus de chaque trajet
    print("  [*] Calcul des terminus (trip_headsign) pour chaque trajet...")
    cur.execute("""
    UPDATE trips
    SET trip_headsign = (
        SELECT s.stop_name
        FROM stop_times st
        JOIN stops s ON st.stop_id = s.stop_id
        WHERE st.trip_id = trips.trip_id
        ORDER BY st.stop_sequence DESC
        LIMIT 1
    )
    WHERE trip_headsign IS NULL OR trip_headsign = ''
    """)

    print("[5/5] Création des index et optimisation...")
    indices = [
        "CREATE INDEX IF NOT EXISTS idx_stop_times_stop ON stop_times(stop_id, departure_time)",
        "CREATE INDEX IF NOT EXISTS idx_stop_times_trip ON stop_times(trip_id, stop_sequence)",
        "CREATE INDEX IF NOT EXISTS idx_trips_route ON trips(route_id, direction_id)",
        "CREATE INDEX IF NOT EXISTS idx_trips_service ON trips(service_id)",
        "CREATE INDEX IF NOT EXISTS idx_cal_dates ON calendar_dates(service_id, date)",
        "CREATE INDEX IF NOT EXISTS idx_cal_active ON calendar(start_date, end_date)",
        "CREATE INDEX IF NOT EXISTS idx_stops_name ON stops(stop_name COLLATE NOCASE)",
        "CREATE INDEX IF NOT EXISTS idx_stops_parent ON stops(parent_station)",
        "CREATE INDEX IF NOT EXISTS idx_stops_location_type ON stops(location_type)",
        "CREATE INDEX IF NOT EXISTS idx_routes_sort ON routes(route_sort_order, route_short_name)",
        "CREATE INDEX IF NOT EXISTS idx_routes_cat ON routes(category)",
    ]
    for idx_sql in indices:
        cur.execute(idx_sql)

    conn.commit()
    cur.execute("PRAGMA optimize")
    cur.execute("VACUUM")
    conn.commit()
    conn.close()

    size_mb = os.path.getsize(OUTPUT_DB) / (1024 * 1024)
    print(f"\n✅ Base de données générée avec succès : {OUTPUT_DB} ({size_mb:.2f} Mo)")

if __name__ == "__main__":
    t0 = time.time()
    build_database()
    print(f"Temps total : {time.time() - t0:.2f} s")
