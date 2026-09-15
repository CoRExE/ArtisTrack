export type RouteCategory = 'urbaine' | 'navette' | 'periurbaine' | 'scolaire' | 'tad';

export interface Route {
  route_id: string;
  agency_id: string;
  route_short_name: string;
  route_long_name: string;
  route_desc?: string;
  route_type: number;
  route_color: string;
  route_text_color: string;
  route_sort_order: number;
  category: RouteCategory;
}

export interface Stop {
  stop_id: string;
  stop_code?: string;
  stop_name: string;
  stop_desc?: string;
  stop_lat: number;
  stop_lon: number;
  location_type: number;
  parent_station?: string;
  wheelchair_boarding: number;
  distance_meters?: number;
}

export interface StopGroup {
  stop_name: string;
  stop_lat: number;
  stop_lon: number;
  child_stop_ids: string[];
  distance_meters?: number;
}

export interface Departure {
  trip_id: string;
  route_id: string;
  route_short_name: string;
  route_long_name: string;
  route_color: string;
  route_text_color: string;
  trip_headsign: string;
  departure_time: string; // "HH:MM" ou "HH:MM:SS"
  minutes_remaining: number;
  stop_id: string;
  stop_name: string;
  is_realtime?: boolean;
  countdown_seconds?: number;
  status?: string; // "on_time" | "delayed" | "early" | "cancelled"
  theoretical_time?: string;
}

export interface RouteStop {
  stop_id: string;
  stop_name: string;
  stop_lat: number;
  stop_lon: number;
  stop_sequence: number;
}

export interface RouteDirection {
  direction_id: number;
  destination: string;
  stops: RouteStop[];
}

export interface TimetableSlot {
  departure_time: string;
  trip_headsign: string;
  trip_id: string;
}

export interface FavoriteItem {
  type: 'stop' | 'route';
  id: string;
  title: string;
  subtitle?: string;
  color?: string;
  textColor?: string;
  childStopIds?: string[];
  latitude?: number;
  longitude?: number;
}
