import { useState, useEffect, useRef } from 'react';
import { 
  APIProvider, 
  Map, 
  AdvancedMarker, 
  Pin, 
  InfoWindow, 
  useAdvancedMarkerRef 
} from '@vis.gl/react-google-maps';
import ReactMarkdown from 'react-markdown';
import { 
  Send, 
  Compass, 
  Navigation, 
  Layers, 
  RotateCcw, 
  MapPin, 
  Sparkles, 
  Navigation2, 
  Search, 
  ListFilter, 
  X, 
  ArrowRight,
  Route,
  Activity,
  User,
  ExternalLink
} from 'lucide-react';
import { Message, MapMarker, RouteData, MapData } from './types';
import RouteDisplay from './components/RouteDisplay';

const DEFAULT_CENTER = { lat: 37.7749, lng: -122.4194 }; // San Francisco
const DEFAULT_ZOOM = 12;

// Load API key following Google Maps Platform Skill constraints
const API_KEY =
  process.env.GOOGLE_MAPS_PLATFORM_KEY ||
  (import.meta as any).env?.VITE_GOOGLE_MAPS_PLATFORM_KEY ||
  (globalThis as any).GOOGLE_MAPS_PLATFORM_KEY ||
  '';

const hasValidKey = Boolean(API_KEY) && API_KEY !== 'YOUR_API_KEY';

export default function App() {
  if (!hasValidKey) {
    return (
      <div className="flex items-center justify-center min-h-screen font-sans bg-slate-950 text-slate-100 p-6">
        <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-2xl p-8 shadow-2xl space-y-6">
          <div className="flex items-center space-x-3 text-sky-400">
            <Compass className="w-8 h-8 animate-spin" style={{ animationDuration: '3s' }} />
            <h1 className="text-2xl font-semibold tracking-tight">Google Maps API Key Required</h1>
          </div>
          <div className="space-y-4 text-slate-300 leading-relaxed text-sm">
            <p>
              To run the interactive map-based chatbot, please configure your Google Maps API key using the Secrets panel in Google AI Studio.
            </p>
            <div className="bg-slate-950 p-4 rounded-xl space-y-3 text-xs border border-slate-800">
              <p className="font-semibold text-slate-200">Set-up Instructions:</p>
              <ol className="list-decimal pl-4 space-y-2 text-slate-400">
                <li>
                  Get an API Key: <a href="https://console.cloud.google.com/google/maps-apis/start?utm_campaign=gmp-code-assist-ais" target="_blank" rel="noopener noreferrer" className="text-sky-400 hover:underline">Launch Google Cloud Console</a>
                </li>
                <li>
                  Open the <strong>Settings</strong> (⚙️ gear icon, top-right corner) in the AI Studio side navigation.
                </li>
                <li>
                  Go to <strong>Secrets</strong>.
                </li>
                <li>
                  Create a new secret named <code className="bg-slate-800 text-sky-300 px-1 py-0.5 rounded">GOOGLE_MAPS_PLATFORM_KEY</code> and paste your API key as the value.
                </li>
                <li>
                  Click <strong>Save</strong>. The app will automatically rebuild (no need to refresh).
                </li>
              </ol>
            </div>
            <p className="text-xs text-slate-500 text-center">
              The Google Maps Platform is a pay-as-you-go service with generous free tiers for local development.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <APIProvider apiKey={API_KEY} version="weekly">
      <MainAppLayout />
    </APIProvider>
  );
}

function MainAppLayout() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content: "Hello! I am your **Google Maps AI Assistant**. 🌍\n\nI combine conversational intelligence with live Google Maps grounding to answer location queries, suggest the best spots, and design detailed travel routes. \n\n**Try asking me things like:**\n* \"Suggest some top-rated bakeries in the North Beach area\"\n* \"Plan a scenic point-to-point hiking route in Yosemite\"\n* \"Show me some interesting museums around Central SF\"",
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    }
  ]);

  const [inputText, setInputText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [currentCenter, setCurrentCenter] = useState(DEFAULT_CENTER);
  const [currentZoom, setCurrentZoom] = useState(DEFAULT_ZOOM);
  const [mapMarkers, setMapMarkers] = useState<MapMarker[]>([]);
  const [activeRoute, setActiveRoute] = useState<RouteData | undefined>(undefined);
  const [routeStats, setRouteStats] = useState<{ distance: string; duration: string } | null>(null);
  
  // Custom interactive search bar inside map
  const [searchQuery, setSearchQuery] = useState('');
  const [searchingMap, setSearchingMap] = useState(false);

  // Info Window states
  const [selectedMarker, setSelectedMarker] = useState<MapMarker | null>(null);
  const [selectedMarkerAnchor, setSelectedMarkerAnchor] = useState<any | null>(null);

  const [mapType, setMapType] = useState<'roadmap' | 'satellite' | 'terrain' | 'hybrid'>('roadmap');
  
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll chat to bottom
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isSending]);

  // Sync state when markers change to ensure we clear stale selections
  useEffect(() => {
    if (mapMarkers.length === 0) {
      setSelectedMarker(null);
    }
  }, [mapMarkers]);

  // Extract JSON configuration blocks from AI responses
  const extractMapData = (text: string): { cleanText: string; mapData: MapData | null } => {
    const regex = /```map-data\s*([\s\S]*?)\s*```/;
    const match = text.match(regex);
    if (match) {
      try {
        const jsonStr = match[1].trim();
        const mapData = JSON.parse(jsonStr) as MapData;
        const cleanText = text.replace(regex, '').trim();
        return { cleanText, mapData };
      } catch (e) {
        console.error("Error parsing map-data JSON block:", e);
      }
    }
    return { cleanText: text, mapData: null };
  };

  // Submit direct message to endpoint
  const handleChatSubmit = async (e?: React.FormEvent, promptOverride?: string) => {
    if (e) e.preventDefault();
    const queryText = promptOverride || inputText;
    if (!queryText.trim() || isSending) return;

    const userMsg: Message = {
      id: Math.random().toString(36).substring(7),
      role: 'user',
      content: queryText,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages(prev => [...prev, userMsg]);
    setInputText('');
    setIsSending(true);

    try {
      const chatHistory = [...messages, userMsg].map(({ role, content }) => ({ role, content }));
      
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: chatHistory,
          currentCenter,
        })
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || 'Server request failed');
      }

      const data = await response.json();
      const rawText = data.text;
      const { cleanText, mapData } = extractMapData(rawText);

      const botMsg: Message = {
        id: Math.random().toString(36).substring(7),
        role: 'assistant',
        content: cleanText,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        mapData: mapData || undefined,
      };

      setMessages(prev => [...prev, botMsg]);

      // Apply map update commands
      if (mapData) {
        if (mapData.center) {
          setCurrentCenter(mapData.center);
        }
        if (mapData.zoom) {
          setCurrentZoom(mapData.zoom);
        }
        if (mapData.markers) {
          setMapMarkers(mapData.markers);
        } else {
          setMapMarkers([]);
        }
        if (mapData.route) {
          setActiveRoute(mapData.route);
        } else {
          setActiveRoute(undefined);
          setRouteStats(null);
        }
      }
    } catch (err: any) {
      console.error(err);
      const errorMsg: Message = {
        id: Math.random().toString(36).substring(7),
        role: 'assistant',
        content: `⚠️ **Request Error:** ${err.message || 'Unable to connect to the Gemini backend server. Ensure your API key is correctly setup.'}`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      setIsSending(false);
    }
  };

  // Quick suggestions click handler
  const handleSuggestionClick = (prompt: string) => {
    handleChatSubmit(undefined, prompt);
  };

  // Perform quick browser-based location panning
  const handleGetCurrentLocation = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const coords = {
            lat: position.coords.latitude,
            lng: position.coords.longitude
          };
          setCurrentCenter(coords);
          setCurrentZoom(14);
          
          // Introduce current location marker
          setMapMarkers([
            {
              id: 'my-location',
              title: "My Location",
              lat: coords.lat,
              lng: coords.lng,
              description: "You are currently here. Ask me about nearby places!"
            }
          ]);
        },
        (error) => {
          console.error("Geolocation retrieval error:", error);
          alert("Could not retrieve current GPS position. Make sure permission is allowed.");
        }
      );
    } else {
      alert("Browser does not support native geolocation lookup.");
    }
  };

  // Reset core map overlays
  const handleResetMap = () => {
    setMapMarkers([]);
    setActiveRoute(undefined);
    setRouteStats(null);
    setCurrentCenter(DEFAULT_CENTER);
    setCurrentZoom(DEFAULT_ZOOM);
    setSelectedMarker(null);
  };

  // Sync internal viewport camera shifts with backend state variables
  const handleCameraChange = (ev: any) => {
    setCurrentCenter(ev.detail.center);
    setCurrentZoom(ev.detail.zoom);
  };

  return (
    <div id="root-container" className="flex flex-col md:flex-row h-screen w-screen overflow-hidden font-sans bg-slate-50 text-slate-900">
      
      {/* LEFT SIDE PANEL: Conversational Area */}
      <div id="chatbot-sidebar" className="w-full md:w-[450px] lg:w-[480px] flex flex-col h-[50vh] md:h-full bg-white border-b md:border-b-0 md:border-r border-slate-200 shrink-0 shadow-sm relative z-20">
        
        {/* Header Widget */}
        <div className="px-6 py-4 border-b border-slate-100 bg-white flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 bg-blue-600 rounded flex items-center justify-center text-white font-bold shrink-0">
              <Compass className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <h1 className="font-semibold text-base tracking-tight text-slate-900 leading-tight">
                GeoBot AI
              </h1>
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                <span className="text-[10px] uppercase tracking-wider font-bold text-slate-500">Live Maps Data</span>
              </div>
            </div>
          </div>
          <button 
            id="reset-state-button"
            onClick={handleResetMap}
            title="Reset Map State"
            className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>

        {/* Conversation Streams */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6 bg-slate-50/50">
          {messages.map((msg) => (
            <div 
              key={msg.id} 
              className={`flex flex-col space-y-1.5 max-w-[88%] ${
                msg.role === 'user' ? 'ml-auto items-end' : 'mr-auto items-start'
              }`}
            >
              {/* Sender Tag */}
              <div className="flex items-center space-x-2 text-[10px] text-slate-400 uppercase tracking-wider font-semibold px-1">
                <span>{msg.role === 'user' ? 'You' : 'GeoBot Assistant'}</span>
                <span>•</span>
                <span>{msg.timestamp}</span>
              </div>

              {/* Chat Bubble Body */}
              <div 
                className={`px-4 py-3 text-sm shadow-xs border transition-all ${
                  msg.role === 'user' 
                    ? 'bg-blue-600 text-white border-blue-700 rounded-tl-xl rounded-br-xl rounded-bl-xl shadow-md' 
                    : 'bg-white border-slate-200 text-slate-800 rounded-tr-xl rounded-br-xl rounded-bl-xl shadow-sm'
                }`}
              >
                <div className={`prose max-w-none text-sm leading-relaxed ${
                  msg.role === 'user' 
                    ? 'prose-invert text-white prose-p:text-white prose-a:text-sky-100' 
                    : 'prose-slate text-slate-700 prose-headings:text-slate-900 prose-headings:font-bold prose-a:text-blue-600'
                }`}>
                  <ReactMarkdown>{msg.content}</ReactMarkdown>
                </div>

                {/* Local Recommended Pins Checklist */}
                {msg.mapData?.markers && msg.mapData.markers.length > 0 && (
                  <div className="mt-4 pt-3.5 border-t border-slate-100 space-y-2">
                    <p className="text-[11px] font-bold tracking-widest text-slate-400 uppercase flex items-center gap-1.5">
                      <MapPin className="w-3.5 h-3.5 text-blue-600" /> RECOMMENDED SPOTS:
                    </p>
                    <div className="grid grid-cols-1 gap-2">
                      {msg.mapData.markers.map((pin) => (
                        <button
                          key={pin.id}
                          onClick={() => {
                            setCurrentCenter({ lat: pin.lat, lng: pin.lng });
                            setCurrentZoom(15);
                            setSelectedMarker(pin);
                          }}
                          className="flex items-start text-left bg-slate-50 hover:bg-blue-50/50 p-2.5 rounded-xl border border-slate-200 hover:border-blue-400 transition-all shadow-xs group cursor-pointer"
                        >
                          <div className="p-1 text-[10px] bg-blue-50 text-blue-600 border border-blue-100 font-bold rounded mt-0.5 mr-2 shrink-0">
                            POI
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-xs font-semibold text-slate-900 group-hover:text-blue-600 transition-colors truncate">{pin.title}</div>
                            {pin.description && (
                              <div className="text-[10px] text-slate-500 mt-0.5 line-clamp-1">
                                {pin.description}
                              </div>
                            )}
                          </div>
                          <ArrowRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-blue-600 group-hover:translate-x-0.5 transition-all ml-2 shrink-0 self-center" />
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Integrated Directions Route display */}
                {msg.mapData?.route && routeStats && (
                  <div className="mt-3 bg-blue-50/65 border border-blue-100/80 rounded-xl p-3 flex items-center justify-between shadow-xs">
                    <div className="flex items-center space-x-2">
                      <div className="p-2 bg-blue-600 text-white rounded-lg">
                        <Route className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="text-[10px] text-slate-500 uppercase font-black tracking-wider">Computed Route</div>
                        <div className="text-xs text-slate-700 font-medium capitalize">
                          {activeRoute?.travelMode.toLowerCase()} • {routeStats.distance}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-bold text-emerald-600">{routeStats.duration}</div>
                      <div className="text-[9px] text-slate-400 uppercase font-bold tracking-wider">Live ETA</div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}

          {/* Sparkles Loading State */}
          {isSending && (
            <div className="flex flex-col space-y-1.5 max-w-[85%] mr-auto items-start">
              <div className="flex items-center space-x-2 text-[10px] text-slate-400 uppercase tracking-wider font-semibold px-1">
                <span>GeoBot Assistant</span>
                <span>•</span>
                <span>Scanning...</span>
              </div>
              <div className="bg-white border border-slate-250 p-4 rounded-tr-xl rounded-br-xl rounded-bl-xl shadow-sm flex items-center space-x-3 w-56">
                <Sparkles className="w-4 h-4 text-blue-500 animate-pulse shrink-0" />
                <div className="space-y-2 flex-1">
                  <div className="h-2 w-28 bg-slate-100 rounded animate-pulse"></div>
                  <div className="h-2 w-36 bg-slate-100 rounded animate-pulse"></div>
                </div>
              </div>
            </div>
          )}

          <div ref={chatEndRef} />
        </div>

        {/* Bottom Selection suggestions bar */}
        <div className="px-6 py-2.5 border-t border-slate-100 bg-slate-50 overflow-x-auto whitespace-nowrap scrollbar-none flex gap-2 shrink-0">
          <button 
            onClick={() => handleSuggestionClick("Find highest rated sushi hotspots in San Francisco North Beach")}
            className="whitespace-nowrap px-3 py-1.5 bg-white border border-slate-200 rounded-full text-[11px] font-semibold text-slate-600 hover:text-blue-600 hover:border-blue-400 transition-all shrink-0 shadow-xs cursor-pointer"
          >
            🍣 Sushi SF
          </button>
          <button 
            onClick={() => handleSuggestionClick("Give directions from Times Square to Central Park Zoo")}
            className="whitespace-nowrap px-3 py-1.5 bg-white border border-slate-200 rounded-full text-[11px] font-semibold text-slate-600 hover:text-blue-600 hover:border-blue-400 transition-all shrink-0 shadow-xs cursor-pointer"
          >
            🗽 NY Directions
          </button>
          <button 
            onClick={() => handleSuggestionClick("What are the best parks to visit around London with great views?")}
            className="whitespace-nowrap px-3 py-1.5 bg-white border border-slate-200 rounded-full text-[11px] font-semibold text-slate-600 hover:text-blue-600 hover:border-blue-400 transition-all shrink-0 shadow-xs cursor-pointer"
          >
            🌳 London Parks
          </button>
          <button 
            onClick={() => handleSuggestionClick("Show coffee shops around Paris Eiffel Tower")}
            className="whitespace-nowrap px-3 py-1.5 bg-white border border-slate-200 rounded-full text-[11px] font-semibold text-slate-600 hover:text-blue-600 hover:border-blue-400 transition-all shrink-0 shadow-xs cursor-pointer"
          >
            ☕ Paris Cafes
          </button>
        </div>

        {/* Input box */}
        <form onSubmit={handleChatSubmit} className="p-4 bg-white border-t border-slate-200 flex items-center space-x-2 shrink-0">
          <input
            id="chat-input-text"
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            disabled={isSending}
            placeholder="Ask about restaurants, reviews, routes..."
            className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white disabled:opacity-50 text-slate-800 placeholder:text-slate-400 transition-all"
          />
          <button
            id="submit-chat-button"
            type="submit"
            disabled={!inputText.trim() || isSending}
            className="p-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl disabled:opacity-40 disabled:hover:bg-blue-600 transition-colors flex items-center justify-center shrink-0 shadow-md cursor-pointer"
          >
            <Send className="w-4.5 h-4.5" />
          </button>
        </form>

      </div>

      {/* RIGHT SIDE PANEL: Full-screen Interactive map */}
      <div id="map-area" className="flex-1 relative h-[50vh] md:h-full bg-slate-200">
        
        {/* Floating Custom Map HUD */}
        <div className="absolute top-4 left-4 right-4 z-10 flex flex-col md:flex-row gap-2 pointer-events-none">
          
          {/* Virtual Camera center coordinate reader */}
          <div className="bg-white/95 backdrop-blur-md border border-slate-200 px-4 py-2.5 rounded-xl shadow-lg flex items-center space-x-3 pointer-events-auto self-start mr-auto">
            <Compass className="w-4 h-4 text-blue-600 animate-spin" style={{ animationDuration: '6s' }} />
            <div className="text-left">
              <div className="text-[10px] text-slate-400 uppercase tracking-wider font-bold">Map Center Location</div>
              <div className="text-xs font-mono text-slate-950 font-medium">
                {currentCenter.lat.toFixed(5)}, {currentCenter.lng.toFixed(5)}
              </div>
            </div>
          </div>

          <div className="flex gap-2 self-start pointer-events-auto">
            {/* Geolocation Button */}
            <button
              onClick={handleGetCurrentLocation}
              title="Locate my position via browser GPS"
              className="bg-white/95 shadow-md border border-slate-200 text-slate-700 hover:text-slate-950 py-2.5 px-3.5 rounded-xl transition hover:bg-slate-50 flex items-center space-x-1.5 cursor-pointer text-xs font-semibold"
            >
              <Navigation className="w-4 h-4 text-blue-600" />
              <span>Gps Locator</span>
            </button>

            {/* Clear button */}
            {mapMarkers.length > 0 && (
              <button
                onClick={() => setMapMarkers([])}
                className="bg-rose-50 border border-rose-100 shadow-md text-rose-600 hover:bg-rose-100/50 px-3.5 py-2.5 rounded-xl transition text-xs shrink-0 flex items-center space-x-1.5 cursor-pointer font-semibold"
              >
                <X className="w-4 h-4" />
                <span>Clear Markers</span>
              </button>
            )}
          </div>
        </div>

        {/* Map Type toggle widgets (Roadmap vs Satellite) */}
        <div className="absolute bottom-4 right-4 z-10 bg-white/95 backdrop-blur-md border border-slate-200/90 p-1.5 rounded-xl shadow-lg flex space-x-1">
          {(['roadmap', 'satellite', 'terrain', 'hybrid'] as const).map((style) => (
            <button
              key={style}
              onClick={() => setMapType(style)}
              className={`px-3 py-1.5 text-[11px] rounded-lg font-bold capitalize transition-all cursor-pointer ${
                mapType === style
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100'
              }`}
            >
              {style}
            </button>
          ))}
        </div>

        {/* RENDER THE ACTUAL MAP */}
        <div className="w-full h-full">
          <Map
            center={currentCenter}
            zoom={currentZoom}
            mapId="DEMO_MAP_ID"
            mapTypeId={mapType}
            onCameraChanged={handleCameraChange}
            internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
            style={{ width: '100%', height: '100%' }}
            disableDefaultUI={false}
          >
            {/* Compute and draw active polylines routes */}
            {activeRoute && (
              <RouteDisplay 
                route={activeRoute} 
                onRouteComputed={(stats) => setRouteStats(stats)} 
              />
            )}

            {/* Populate interactive POI makers */}
            {mapMarkers.map((marker) => (
              <MarkerInstance 
                key={marker.id} 
                marker={marker} 
                isSelected={selectedMarker?.id === marker.id}
                onSelect={(ref) => {
                  setSelectedMarker(marker);
                  setSelectedMarkerAnchor(ref);
                }}
              />
            ))}

            {/* RENDER INFO WINDOW POPUP FOR CURRENTLY SELECTED MARKER */}
            {selectedMarker && (
              <InfoWindow
                anchor={selectedMarkerAnchor}
                onCloseClick={() => {
                  setSelectedMarker(null);
                  setSelectedMarkerAnchor(null);
                }}
              >
                <div className="p-1.5 max-w-xs text-slate-900 bg-white">
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="font-semibold text-sm text-slate-900 mb-0.5">{selectedMarker.title}</h3>
                      {selectedMarker.rating && (
                        <div className="flex items-center space-x-1 text-amber-500 text-[11px] mb-1">
                          <span>★ {selectedMarker.rating}</span>
                        </div>
                      )}
                    </div>
                  </div>
                  {selectedMarker.address && (
                    <p className="text-[11px] text-slate-600 font-medium leading-relaxed mb-2 flex items-start gap-1">
                      <MapPin className="w-3 h-3 block shrink-0 mt-0.5 text-slate-400" />
                      {selectedMarker.address}
                    </p>
                  )}
                  {selectedMarker.description && (
                    <p className="text-xs text-slate-800 leading-relaxed italic bg-slate-50 border border-slate-100 rounded p-1.5 font-sans mb-3">
                      "{selectedMarker.description}"
                    </p>
                  )}
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => {
                        const targetPrompt = `Set as route destination: ${selectedMarker.title} at ${selectedMarker.address || `${selectedMarker.lat},${selectedMarker.lng}`}`;
                        handleChatSubmit(undefined, targetPrompt);
                      }}
                      className="flex-1 bg-sky-600 hover:bg-sky-500 text-white rounded text-[10px] py-1.5 px-3.5 transition font-semibold"
                    >
                      Retrieve Directions
                    </button>
                    <button
                      onClick={() => {
                        const targetPrompt = `Tell me more details about ${selectedMarker.title}`;
                        handleChatSubmit(undefined, targetPrompt);
                      }}
                      className="bg-slate-100 hover:bg-slate-200 text-slate-850 rounded text-[10px] py-1.5 px-3 transition font-semibold shrink-0"
                    >
                      Ask Details
                    </button>
                  </div>
                </div>
              </InfoWindow>
            )}
          </Map>
        </div>

      </div>

    </div>
  );
}

// Subcomponent to safely manage the useAdvancedMarkerRef anchor reference
function MarkerInstance({ 
  marker, 
  onSelect,
  isSelected
}: { 
  marker: MapMarker; 
  onSelect: (ref: any) => void;
  isSelected: boolean;
}) {
  const [markerRef, markerInstance] = useAdvancedMarkerRef();

  // Pick suitable colors based on title signatures to catalog marker kinds
  const getMarkerColor = (title: string) => {
    const norm = title.toLowerCase();
    if (norm.includes("sushi") || norm.includes("pizza") || norm.includes("restaurant") || norm.includes("cafe") || norm.includes("bakery") || norm.includes("food")) {
      return "#f97316"; // Food style: Orange
    }
    if (norm.includes("park") || norm.includes("trail") || norm.includes("lake") || norm.includes("garden") || norm.includes("forest")) {
      return "#22c55e"; // Nature style: Green
    }
    if (norm.includes("museum") || norm.includes("landmark") || norm.includes("palace") || norm.includes("tower") || norm.includes("cathedral")) {
      return "#a855f7"; // Culture: Purple
    }
    if (norm.includes("my location")) {
      return "#0EA5E9"; // Current Position: Sky Blue
    }
    return "#3b82f6"; // Default Blue
  };

  const color = getMarkerColor(marker.title);

  return (
    <AdvancedMarker
      ref={markerRef}
      position={{ lat: marker.lat, lng: marker.lng }}
      title={marker.title}
      onClick={() => onSelect(markerInstance)}
    >
      <Pin 
        background={color} 
        glyphColor="#ffffff"
        borderColor="#ffffff"
        scale={isSelected ? 1.25 : 1.0}
      />
    </AdvancedMarker>
  );
}
