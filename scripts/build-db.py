#!/usr/bin/env python3
"""
ArtisTrack - Script d'ingestion du GTFS Artis vers SQLite.
Ingère le GTFS officiel 2026/2027 vers assets/data/artis.db.
Supporte une archive locale en paramètre CLI ou recherche automatique dans ~/Downloads.
"""

import os
import sys
import io
import csv
import json
import sqlite3
import zipfile
import glob
import urllib.request
import time

GTFS_DATASET_API = "https://transport.data.gouv.fr/api/datasets"
DEFAULT_GTFS_URL = "https://static.data.gouv.fr/resources/reseau-de-transport-artis/20250829-085009/gtfs-20250828-151217.zip"
OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "..", "assets", "data")
OUTPUT_DB = os.path.join(OUTPUT_DIR, "artis.db")

KNOWN_ROUTE_TITLES = {
    "1": "Arras Gare Urbaine ↔ Arras Centre Commercial",
    "2": "St-Nicolas Cruppes ↔ Arras Centre Commercial",
    "3": "Dainville Mairie ↔ Achicourt Collège Adam de la Halle",
    "4": "Arras Gare Brassart ↔ Beaurains Centre Commercial",
    "5": "Arras Gare Urbaine ↔ Arras Willy Brandt",
    "6": "Dainville ZA ↔ Tilloy-lès-Mofflaines Château d'eau",
    "7": "Agny Mairie ↔ Feuchy Les Étangs",
    "8": "St-Nicolas Cruppes ↔ ZI Est Fleming",
    "9": "Arras Gare Urbaine ↔ Anzin ZA des Filatiers",
    "10": "Anzin Cazin ↔ Beaurains Centre Commercial",
    "CIT1": "Citadine 1 • Aquarena ↔ Centre-Ville",
    "CIT2": "Citadine 2 • Citadelle ↔ Centre-Ville",
    "CIT3": "Citadine 3 • Parking Relais Huileries ↔ Gare",
    "ZA1": "Navette Actiparc • Gare ↔ Actiparc",
    "ZA2": "Navette Artoipôle • Gare ↔ Parking Relais Royal Variétés",
    "ZA3": "Navette Chemins Croisés • Gare ↔ Inserre",
    "D1": "Dimanche D1 • St-Nicolas Cruppes ↔ Arras C. Cial",
    "D2": "Dimanche D2 • Dainville Mairie ↔ Beaurains C. Cial",
}

def resolve_gtfs_source():
    """Détermine la source du fichier GTFS (CLI arg, ~/Downloads, ou URL)."""
    if len(sys.argv) > 1 and os.path.exists(sys.argv[1]):
        print(f"[+] Utilisation du fichier spécifié : {sys.argv[1]}")
        return sys.argv[1]

    # Vérifier si un zip GTFS est présent dans Downloads
    downloads_pattern = os.path.expanduser("~/Downloads/*gtfs*.zip")
    matches = glob.glob(downloads_pattern)
    if matches:
        # Prendre le plus récent
        matches.sort(key=os.path.getmtime, reverse=True)
        print(f"[+] Archive GTFS trouvée dans Downloads : {matches[0]}")
        return matches[0]

    return None

def categorize_route(short_name: str) -> str:
    s = short_name.upper().strip()
    if s.startswith("CIT") or s.startswith("ZA") or s in ("ACTI", "ARTOIS", "CHEM"):
        return "navette"
    if s.startswith("TAD") or s in ("TAC", "DIM"):
        return "tad"
    if s.startswith("S") or s.startswith("C"):
        return "scolaire"
    if s.isdigit():
        n = int(s)
        if 1 <= n <= 10:
            return "urbaine"
        else:
            return "periurbaine"
    if s.startswith("D") or s.startswith("LD"):
        return "periurbaine"
    return "urbaine"

def compute_route_sort_order(short_name: str, category: str) -> int:
    s = short_name.upper().strip()
    if s.isdigit():
        return int(s)
    if s.startswith("CIT"):
        num = "".join(filter(str.isdigit, s))
        return 100 + (int(num) if num else 0)
    if s.startswith("ZA") or category == "navette":
        num = "".join(filter(str.isdigit, s))
        return 150 + (int(num) if num else 0)
    if s.startswith("S") or category == "scolaire":
        num = "".join(filter(str.isdigit, s))
        return 200 + (int(num) if num else 0)
    if s.startswith("D"):
        num = "".join(filter(str.isdigit, s))
        return 300 + (int(num) if num else 0)
    return 400

def build_database():
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    if os.path.exists(OUTPUT_DB):
        os.remove(OUTPUT_DB)

    source = resolve_gtfs_source()
    if source and os.path.exists(source):
        print(f"[1/5] Ouverture de l'archive GTFS locale : {source}")
        zf = zipfile.ZipFile(source)
    else:
        print("[1/5] Téléchargement du GTFS distant...")
        gtfs_url = DEFAULT_GTFS_URL
        req = urllib.request.Request(gtfs_url, headers={"User-Agent": "ArtisTrack/1.0"})
        with urllib.request.urlopen(req) as resp:
            gtfs_bytes = resp.read()
        zf = zipfile.ZipFile(io.BytesIO(gtfs_bytes))

    print(f"[+] Archive ouverte ({len(zf.namelist())} fichiers : {', '.join(zf.namelist())})")

    print(f"[2/5] Création de la base SQLite {OUTPUT_DB}...")
    conn = sqlite3.connect(OUTPUT_DB)
    cur = conn.cursor()

    cur.execute("""
    CREATE TABLE IF NOT EXISTS feed_info (
        feed_publisher_name TEXT,
        feed_publisher_url TEXT,
        feed_lang TEXT,
        feed_start_date TEXT,
        feed_end_date TEXT,
        feed_version TEXT
    )""")

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
        block_id TEXT,
        shape_id TEXT,
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

    cur.execute("""
    CREATE TABLE IF NOT EXISTS shapes (
        shape_id TEXT,
        shape_pt_lat REAL,
        shape_pt_lon REAL,
        shape_pt_sequence INTEGER,
        shape_dist_traveled REAL
    )""")

    tables_to_load = [
        ("feed_info", "feed_info.txt"),
        ("agency", "agency.txt"),
        ("stops", "stops.txt"),
        ("routes", "routes.txt"),
        ("trips", "trips.txt"),
        ("calendar", "calendar.txt"),
        ("calendar_dates", "calendar_dates.txt"),
        ("stop_times", "stop_times.txt"),
        ("shapes", "shapes.txt"),
    ]

    print("[3/5] Insertion des données...")
    for tbl, filename in tables_to_load:
        if filename not in zf.namelist():
            print(f"  [-] {filename} absent de l'archive, ignoré.")
            continue
        with zf.open(filename) as f:
            reader = csv.DictReader(io.TextIOWrapper(f, encoding="utf-8-sig"))
            table_cols = [c[1] for c in cur.execute(f"PRAGMA table_info({tbl})").fetchall() if c[1] not in ('category', 'route_sort_order')]
            cols = [c for c in table_cols if c in (reader.fieldnames or [])]
            cols_str = ",".join(cols)
            placeholders = ",".join(["?"] * len(cols))
            rows = [[row.get(c, None) for c in cols] for row in reader]
            cur.executemany(f"INSERT INTO {tbl} ({cols_str}) VALUES ({placeholders})", rows)
            print(f"  [✓] {tbl} : {len(rows)} enregistrements insérés.")

    print("[4/5] Post-traitement et enrichissement des données...")

    # Remplacement des destinations génériques (Aller, Retour, 1, 2) par le vrai nom du terminus
    print("  [*] Résolution des terminus précis pour chaque trajet...")
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
    WHERE trip_headsign IS NULL
       OR trim(trip_headsign) = ''
       OR lower(trim(trip_headsign)) IN ('aller', 'retour', '1', '2')
    """)

    # Calcul des catégories de routes, ordres de tri et titres longs
    routes_rows = cur.execute("SELECT route_id, route_short_name, route_long_name FROM routes").fetchall()
    for r_id, s_name, l_name in routes_rows:
        cat = categorize_route(s_name)
        sort_order = compute_route_sort_order(s_name, cat)

        # Calcul ou enrichissement du titre long
        final_long_name = KNOWN_ROUTE_TITLES.get(s_name)
        if not final_long_name:
            if l_name and not l_name.lower().startswith(f"ligne {s_name.lower()}") and not l_name.lower() == f"ligne {s_name.lower()}":
                final_long_name = l_name
            else:
                # Chercher les deux terminus principaux des trips de cette ligne
                term_rows = cur.execute("""
                    SELECT trip_headsign, COUNT(*) as cnt
                    FROM trips
                    WHERE route_id = ? AND trip_headsign IS NOT NULL AND trip_headsign != ''
                    GROUP BY trip_headsign
                    ORDER BY cnt DESC
                    LIMIT 2
                """, (r_id,)).fetchall()
                if len(term_rows) >= 2:
                    final_long_name = f"{term_rows[0][0]} ↔ {term_rows[1][0]}"
                elif len(term_rows) == 1:
                    final_long_name = term_rows[0][0]
                else:
                    final_long_name = l_name or f"Ligne {s_name}"

        cur.execute(
            "UPDATE routes SET category = ?, route_sort_order = ?, route_long_name = ? WHERE route_id = ?",
            (cat, sort_order, final_long_name, r_id),
        )

    print("[5/5] Création des index et optimisation de la base SQLite...")
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
        "CREATE INDEX IF NOT EXISTS idx_shapes_id ON shapes(shape_id, shape_pt_sequence)",
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
    print(f"Temps total d'exécution : {time.time() - t0:.2f} s")
