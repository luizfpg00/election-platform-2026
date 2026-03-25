import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { CandidateSearch } from '@/components/dashboard/CandidateSearch';
import { VotingMap } from '@/components/dashboard/VotingMap';
import { VotingStats } from '@/components/dashboard/VotingStats';
import { CampaignPlanner } from '@/components/dashboard/CampaignPlanner';
import { Vote, LogOut, Map, BarChart3, Brain, User, Loader2, Download } from 'lucide-react';
import type { Candidate } from '@/types/election';
import { CARGO_LABELS } from '@/types/election';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';

export default function Dashboard() {
  const { user, signOut } = useAuth();
  const [selectedCandidate, setSelectedCandidate] = useState<Candidate | null>(null);
  const [importing, setImporting] = useState(false);
  const [importStatus, setImportStatus] = useState<string>('');
  const [dataReady, setDataReady] = useState(false);

  const handleSelectCandidate = async (candidate: Candidate) => {
    setSelectedCandidate(candidate);
    setDataReady(false);
    setImporting(true);
    setImportStatus('Importando dados de votação do TSE...');

    try {
      const { data, error } = await supabase.functions.invoke('import-voting-data', {
        body: {
          numero: candidate.numero,
          ano: candidate.ano_eleicao,
          uf: candidate.uf,
          cargo: candidate.cargo,
          nome: candidate.nome,
          partido: candidate.partido,
        },
      });

      if (error) throw error;

      if (data.status === 'already_imported') {
        toast.success(`Dados já importados: ${data.records} registros`);
      } else if (data.status === 'imported') {
        toast.success(data.message);
      } else if (data.status === 'no_data') {
        toast.warning('Nenhum dado de votação encontrado no TSE para este candidato');
      }

      // Update candidate_id from import response
      if (data.candidate_id && candidate.id !== data.candidate_id) {
        setSelectedCandidate({ ...candidate, id: data.candidate_id });
      }

      setDataReady(true);
    } catch (err) {
      console.error('Import error:', err);
      toast.error('Erro ao importar dados de votação', {
        description: 'Os dados do TSE podem demorar para baixar. Tente novamente.',
      });
      setDataReady(true); // Show tabs anyway
    } finally {
      setImporting(false);
      setImportStatus('');
    }
  };

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
        <CandidateSearch onSelectCandidate={handleSelectCandidate} />

        {/* Import Status */}
        {importing && (
          <div className="flex items-center justify-center gap-3 py-8">
            <Loader2 className="h-6 w-6 text-blue-400 animate-spin" />
            <div>
              <p className="text-white font-medium">{importStatus}</p>
              <p className="text-sm text-slate-400">
                Baixando CSV do TSE e processando dados de votação...
              </p>
            </div>
          </div>
        )}

        {/* Dashboard Tabs — shown when candidate selected and data ready */}
        {selectedCandidate && dataReady && !importing && (
          <Tabs defaultValue="stats" className="space-y-4">
            <TabsList className="bg-slate-800/50 border border-slate-700/50">
              <TabsTrigger value="stats" className="data-[state=active]:bg-green-600 data-[state=active]:text-white text-slate-400">
                <BarChart3 className="h-4 w-4 mr-2" />
                Estatísticas
              </TabsTrigger>
              <TabsTrigger value="map" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white text-slate-400">
                <Map className="h-4 w-4 mr-2" />
                Mapa de Votos
              </TabsTrigger>
              <TabsTrigger value="plan" className="data-[state=active]:bg-purple-600 data-[state=active]:text-white text-slate-400">
                <Brain className="h-4 w-4 mr-2" />
                Plano de Campanha
              </TabsTrigger>
            </TabsList>

            <TabsContent value="stats">
              <VotingStats candidate={selectedCandidate} />
            </TabsContent>

            <TabsContent value="map">
              <VotingMap candidate={selectedCandidate} />
            </TabsContent>

            <TabsContent value="plan">
              <CampaignPlanner candidate={selectedCandidate} />
            </TabsContent>
          </Tabs>
        )}

        {!selectedCandidate && !importing && (
          <div className="text-center py-20">
            <div className="bg-slate-800/30 rounded-full p-6 inline-block mb-4">
              <Vote className="h-12 w-12 text-slate-600" />
            </div>
            <h2 className="text-xl font-semibold text-slate-400">
              Selecione um candidato para começar
            </h2>
            <p className="text-slate-500 mt-2">
              Ao selecionar, os dados de votação serão importados automaticamente do TSE
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
