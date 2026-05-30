export interface MapMarker {
  id: string;
  title: string;
  lat: number;
  lng: number;
  address?: string;
  description?: string;
  rating?: number;
}

export interface RouteData {
  origin: string | { lat: number; lng: number };
  destination: string | { lat: number; lng: number };
  travelMode: 'DRIVING' | 'WALKING' | 'BICYCLING' | 'TRANSIT';
  distance?: string;
  duration?: string;
}

export interface MapData {
  center?: { lat: number; lng: number };
  zoom?: number;
  markers?: MapMarker[];
  route?: RouteData;
}

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  mapData?: MapData;
  isLoading?: boolean;
}

export interface ChatSession {
  id: string;
  title: string;
  messages: Message[];
  created_at: string;
}
