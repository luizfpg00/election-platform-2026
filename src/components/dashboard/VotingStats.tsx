import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { TrendingUp, Users, MapPin, BarChart3 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { Candidate, VotingSummary } from '@/types/election';

interface VotingStatsProps {
  candidate: Candidate;
}

const COLORS = ['#3b82f6', '#22c55e', '#eab308', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#f97316'];

export function VotingStats({ candidate }: VotingStatsProps) {
  const [stateData, setStateData] = useState<VotingSummary[]>([]);
  const [topCities, setTopCities] = useState<VotingSummary[]>([]);
  const [totalVotes, setTotalVotes] = useState(0);
  const [totalSections, setTotalSections] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStats();
  }, [candidate.id]);

  const loadStats = async () => {
    setLoading(true);
    try {
      // State-level data
      const { data: states } = await supabase
        .from('voting_results_by_state')
        .select('*')
        .eq('candidate_id', candidate.id)
        .order('total_votos', { ascending: false });

      if (states) {
        setStateData(states);
        setTotalVotes(states.reduce((sum, s) => sum + s.total_votos, 0));
        setTotalSections(states.reduce((sum, s) => sum + s.total_secoes, 0));
      }

      // Top cities
      const { data: cities } = await supabase
        .from('voting_results_by_city')
        .select('*')
        .eq('candidate_id', candidate.id)
        .order('total_votos', { ascending: false })
        .limit(10);

      if (cities) setTopCities(cities);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <Card key={i} className="bg-slate-900/60 border-slate-700/50 animate-pulse">
            <CardContent className="p-6 h-24" />
          </Card>
        ))}
      </div>
    );
  }

  const avgPercentage = stateData.length
    ? (stateData.reduce((sum, s) => sum + s.percentual_medio, 0) / stateData.length)
    : 0;

  const stateChartData = stateData.slice(0, 10).map(s => ({
    name: s.uf,
    votos: s.total_votos,
    percentual: s.percentual_medio,
  }));

  const cityChartData = topCities.map(c => ({
    name: c.municipio ? (c.municipio.length > 15 ? c.municipio.slice(0, 15) + '...' : c.municipio) : '',
    votos: c.total_votos,
    percentual: c.percentual_medio,
  }));

  return (
    <div className="space-y-4">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="bg-gradient-to-br from-blue-500/20 to-blue-600/10 border-blue-500/30">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="bg-blue-500/20 p-2 rounded-lg">
                <Users className="h-5 w-5 text-blue-400" />
              </div>
              <div>
                <p className="text-sm text-blue-300">Total de Votos</p>
                <p className="text-2xl font-bold text-white">{totalVotes.toLocaleString('pt-BR')}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-green-500/20 to-green-600/10 border-green-500/30">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="bg-green-500/20 p-2 rounded-lg">
                <TrendingUp className="h-5 w-5 text-green-400" />
              </div>
              <div>
                <p className="text-sm text-green-300">Percentual Médio</p>
                <p className="text-2xl font-bold text-white">{avgPercentage.toFixed(1)}%</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-yellow-500/20 to-yellow-600/10 border-yellow-500/30">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="bg-yellow-500/20 p-2 rounded-lg">
                <MapPin className="h-5 w-5 text-yellow-400" />
              </div>
              <div>
                <p className="text-sm text-yellow-300">Estados</p>
                <p className="text-2xl font-bold text-white">{stateData.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-purple-500/20 to-purple-600/10 border-purple-500/30">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="bg-purple-500/20 p-2 rounded-lg">
                <BarChart3 className="h-5 w-5 text-purple-400" />
              </div>
              <div>
                <p className="text-sm text-purple-300">Seções Eleitorais</p>
                <p className="text-2xl font-bold text-white">{totalSections.toLocaleString('pt-BR')}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Top States */}
        <Card className="bg-slate-900/60 border-slate-700/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-base text-white">Top 10 Estados por Votos</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={stateChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="name" stroke="#94a3b8" fontSize={12} />
                <YAxis stroke="#94a3b8" fontSize={12} tickFormatter={(v) => v.toLocaleString()} />
                <Tooltip
                  contentStyle={{ background: '#1e293b', border: '1px solid #475569', borderRadius: '8px' }}
                  labelStyle={{ color: '#e2e8f0' }}
                  formatter={(value) => [Number(value).toLocaleString('pt-BR'), 'Votos']}
                />
                <Bar dataKey="votos" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Top Cities */}
        <Card className="bg-slate-900/60 border-slate-700/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-base text-white">Top 10 Municípios por Votos</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={cityChartData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis type="number" stroke="#94a3b8" fontSize={12} tickFormatter={(v) => v.toLocaleString()} />
                <YAxis dataKey="name" type="category" stroke="#94a3b8" fontSize={11} width={120} />
                <Tooltip
                  contentStyle={{ background: '#1e293b', border: '1px solid #475569', borderRadius: '8px' }}
                  labelStyle={{ color: '#e2e8f0' }}
                  formatter={(value) => [Number(value).toLocaleString('pt-BR'), 'Votos']}
                />
                <Bar dataKey="votos" fill="#22c55e" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* State Distribution Pie */}
      <Card className="bg-slate-900/60 border-slate-700/50">
        <CardHeader className="pb-2">
          <CardTitle className="text-base text-white">Distribuição por Estado</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col lg:flex-row items-center gap-4">
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={stateChartData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={120}
                  paddingAngle={2}
                  dataKey="votos"
                  label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`}
                >
                  {stateChartData.map((_, index) => (
                    <Cell key={index} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ background: '#1e293b', border: '1px solid #475569', borderRadius: '8px' }}
                  formatter={(value) => [Number(value).toLocaleString('pt-BR'), 'Votos']}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex flex-wrap gap-2 lg:max-w-xs">
              {stateData.map((s, i) => (
                <Badge
                  key={s.uf}
                  className="text-xs"
                  style={{ backgroundColor: `${COLORS[i % COLORS.length]}30`, color: COLORS[i % COLORS.length] }}
                >
                  {s.uf}: {s.total_votos.toLocaleString('pt-BR')}
                </Badge>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
