import { useEffect, useState, useMemo } from 'react';
import { MapContainer, TileLayer, CircleMarker, Popup, useMap } from 'react-leaflet';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Map, ZoomIn } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { Candidate, VotingSummary } from '@/types/election';
import 'leaflet/dist/leaflet.css';

// Brazilian state coordinates for initial view
const BRAZIL_CENTER: [number, number] = [-14.235, -51.925];

// State capitals coordinates
const STATE_COORDS: Record<string, [number, number]> = {
  AC: [-9.975, -67.81], AL: [-9.666, -35.735], AM: [-3.119, -60.022],
  AP: [0.034, -51.066], BA: [-12.971, -38.511], CE: [-3.717, -38.543],
  DF: [-15.794, -47.882], ES: [-20.319, -40.338], GO: [-16.679, -49.254],
  MA: [-2.530, -44.282], MG: [-19.917, -43.934], MS: [-20.449, -54.614],
  MT: [-15.596, -56.097], PA: [-1.456, -48.502], PB: [-7.115, -34.861],
  PE: [-8.054, -34.871], PI: [-5.089, -42.802], PR: [-25.429, -49.271],
  RJ: [-22.907, -43.173], RN: [-5.795, -35.209], RO: [-8.762, -63.904],
  RR: [2.820, -60.674], RS: [-30.033, -51.230], SC: [-27.595, -48.548],
  SE: [-10.911, -37.072], SP: [-23.550, -46.634], TO: [-10.184, -48.334],
};

interface VotingMapProps {
  candidate: Candidate;
}

function MapUpdater({ center, zoom }: { center: [number, number]; zoom: number }) {
  const map = useMap();
  useEffect(() => {
    map.setView(center, zoom);
  }, [map, center, zoom]);
  return null;
}

export function VotingMap({ candidate }: VotingMapProps) {
  const [stateData, setStateData] = useState<VotingSummary[]>([]);
  const [cityData, setCityData] = useState<VotingSummary[]>([]);
  const [selectedState, setSelectedState] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStateData();
  }, [candidate.id]);

  const loadStateData = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('voting_results_by_state')
        .select('*')
        .eq('candidate_id', candidate.id);

      if (error) throw error;
      setStateData(data || []);
    } catch (err) {
      console.error('Error loading state data:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadCityData = async (uf: string) => {
    try {
      const { data, error } = await supabase
        .from('voting_results_by_city')
        .select('*')
        .eq('candidate_id', candidate.id)
        .eq('uf', uf)
        .order('total_votos', { ascending: false });

      if (error) throw error;
      setCityData(data || []);
      setSelectedState(uf);
    } catch (err) {
      console.error('Error loading city data:', err);
    }
  };

  const maxVotes = useMemo(() => {
    const data = selectedState ? cityData : stateData;
    return Math.max(...data.map(d => d.total_votos), 1);
  }, [stateData, cityData, selectedState]);

  const getColor = (percentage: number) => {
    if (percentage >= 60) return '#22c55e';
    if (percentage >= 40) return '#3b82f6';
    if (percentage >= 20) return '#eab308';
    return '#ef4444';
  };

  const getRadius = (votes: number) => {
    const ratio = votes / maxVotes;
    return Math.max(6, Math.min(40, ratio * 40));
  };

  const mapCenter = selectedState
    ? STATE_COORDS[selectedState] || BRAZIL_CENTER
    : BRAZIL_CENTER;
  const mapZoom = selectedState ? 7 : 4;

  return (
    <Card className="bg-slate-900/60 border-slate-700/50">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg text-white flex items-center gap-2">
            <Map className="h-5 w-5 text-green-400" />
            Mapa de Votação — {candidate.nome_urna || candidate.nome}
          </CardTitle>
          <div className="flex items-center gap-2">
            {selectedState && (
              <Badge
                className="bg-blue-500/20 text-blue-300 cursor-pointer hover:bg-blue-500/30"
                onClick={() => { setSelectedState(null); setCityData([]); }}
              >
                ← Voltar ao Brasil
              </Badge>
            )}
            <Badge variant="outline" className="text-slate-400">
              <ZoomIn className="h-3 w-3 mr-1" />
              {selectedState ? `Municípios — ${selectedState}` : 'Estados'}
            </Badge>
          </div>
        </div>
        <div className="flex gap-3 mt-2">
          <span className="text-xs text-slate-400 flex items-center gap-1">
            <span className="w-3 h-3 rounded-full bg-green-500 inline-block" /> {'>'} 60%
          </span>
          <span className="text-xs text-slate-400 flex items-center gap-1">
            <span className="w-3 h-3 rounded-full bg-blue-500 inline-block" /> 40-60%
          </span>
          <span className="text-xs text-slate-400 flex items-center gap-1">
            <span className="w-3 h-3 rounded-full bg-yellow-500 inline-block" /> 20-40%
          </span>
          <span className="text-xs text-slate-400 flex items-center gap-1">
            <span className="w-3 h-3 rounded-full bg-red-500 inline-block" /> {'<'} 20%
          </span>
        </div>
      </CardHeader>
      <CardContent>
        <div className="rounded-lg overflow-hidden border border-slate-700/50" style={{ height: '500px' }}>
          {loading ? (
            <div className="h-full flex items-center justify-center bg-slate-800/50">
              <p className="text-slate-400">Carregando mapa...</p>
            </div>
          ) : (
            <MapContainer
              center={mapCenter}
              zoom={mapZoom}
              style={{ height: '100%', width: '100%', background: '#1e293b' }}
              scrollWheelZoom={true}
            >
              <MapUpdater center={mapCenter} zoom={mapZoom} />
              <TileLayer
                attribution='&copy; <a href="https://carto.com/">CARTO</a>'
                url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
              />

              {!selectedState && stateData.map((state) => {
                const coords = STATE_COORDS[state.uf];
                if (!coords) return null;
                return (
                  <CircleMarker
                    key={state.uf}
                    center={coords}
                    radius={getRadius(state.total_votos)}
                    fillColor={getColor(state.percentual_medio)}
                    fillOpacity={0.7}
                    color={getColor(state.percentual_medio)}
                    weight={2}
                    eventHandlers={{
                      click: () => loadCityData(state.uf),
                    }}
                  >
                    <Popup>
                      <div className="text-sm">
                        <strong>{state.uf}</strong><br />
                        Votos: {state.total_votos.toLocaleString('pt-BR')}<br />
                        Percentual: {state.percentual_medio.toFixed(1)}%<br />
                        Seções: {state.total_secoes}<br />
                        <em className="text-blue-600">Clique para ver municípios</em>
                      </div>
                    </Popup>
                  </CircleMarker>
                );
              })}

              {selectedState && cityData.map((city, i) => {
                const stateCoords = STATE_COORDS[city.uf!] || BRAZIL_CENTER;
                // Distribute cities around the state center
                const angle = (i / cityData.length) * Math.PI * 2;
                const spread = Math.min(3, cityData.length * 0.05);
                const lat = stateCoords[0] + Math.cos(angle) * spread * (0.3 + Math.random() * 0.7);
                const lng = stateCoords[1] + Math.sin(angle) * spread * (0.3 + Math.random() * 0.7);

                return (
                  <CircleMarker
                    key={`${city.municipio}-${i}`}
                    center={[lat, lng]}
                    radius={getRadius(city.total_votos)}
                    fillColor={getColor(city.percentual_medio)}
                    fillOpacity={0.6}
                    color={getColor(city.percentual_medio)}
                    weight={1}
                  >
                    <Popup>
                      <div className="text-sm">
                        <strong>{city.municipio}</strong><br />
                        Votos: {city.total_votos.toLocaleString('pt-BR')}<br />
                        Percentual: {city.percentual_medio.toFixed(1)}%<br />
                        Seções: {city.total_secoes}
                      </div>
                    </Popup>
                  </CircleMarker>
                );
              })}
            </MapContainer>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
