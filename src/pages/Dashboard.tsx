import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { CandidateSearch } from '@/components/dashboard/CandidateSearch';
import { VotingMap } from '@/components/dashboard/VotingMap';
import { VotingStats } from '@/components/dashboard/VotingStats';
import { CampaignPlanner } from '@/components/dashboard/CampaignPlanner';
import { Vote, LogOut, Map, BarChart3, Brain, User } from 'lucide-react';
import type { Candidate } from '@/types/election';
import { CARGO_LABELS } from '@/types/election';

export default function Dashboard() {
  const { user, signOut } = useAuth();
  const [selectedCandidate, setSelectedCandidate] = useState<Candidate | null>(null);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-950/80 backdrop-blur-xl sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-gradient-to-r from-blue-500 to-green-500 p-1.5 rounded-lg">
              <Vote className="h-5 w-5 text-white" />
            </div>
            <h1 className="text-lg font-bold text-white">EleiçãoPlan 2026</h1>
          </div>

          <div className="flex items-center gap-3">
            {selectedCandidate && (
              <Badge className="bg-blue-500/20 text-blue-300 hidden sm:flex">
                <User className="h-3 w-3 mr-1" />
                {selectedCandidate.nome_urna} — {CARGO_LABELS[selectedCandidate.cargo]}
              </Badge>
            )}
            <span className="text-sm text-slate-400 hidden md:block">{user?.email}</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={signOut}
              className="text-slate-400 hover:text-white"
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        {/* Candidate Search */}
        <CandidateSearch onSelectCandidate={setSelectedCandidate} />

        {/* Dashboard Tabs — only shown when a candidate is selected */}
        {selectedCandidate && (
          <Tabs defaultValue="map" className="space-y-4">
            <TabsList className="bg-slate-800/50 border border-slate-700/50">
              <TabsTrigger value="map" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white text-slate-400">
                <Map className="h-4 w-4 mr-2" />
                Mapa de Votos
              </TabsTrigger>
              <TabsTrigger value="stats" className="data-[state=active]:bg-green-600 data-[state=active]:text-white text-slate-400">
                <BarChart3 className="h-4 w-4 mr-2" />
                Estatísticas
              </TabsTrigger>
              <TabsTrigger value="plan" className="data-[state=active]:bg-purple-600 data-[state=active]:text-white text-slate-400">
                <Brain className="h-4 w-4 mr-2" />
                Plano de Campanha
              </TabsTrigger>
            </TabsList>

            <TabsContent value="map">
              <VotingMap candidate={selectedCandidate} />
            </TabsContent>

            <TabsContent value="stats">
              <VotingStats candidate={selectedCandidate} />
            </TabsContent>

            <TabsContent value="plan">
              <CampaignPlanner candidate={selectedCandidate} />
            </TabsContent>
          </Tabs>
        )}

        {!selectedCandidate && (
          <div className="text-center py-20">
            <div className="bg-slate-800/30 rounded-full p-6 inline-block mb-4">
              <Vote className="h-12 w-12 text-slate-600" />
            </div>
            <h2 className="text-xl font-semibold text-slate-400">
              Selecione um candidato para começar
            </h2>
            <p className="text-slate-500 mt-2">
              Use a busca acima para encontrar o candidato e visualizar dados de votação
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
