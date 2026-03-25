import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Search, User, MapPin, Trophy, Award } from 'lucide-react';
import { CARGO_LABELS, type CargoType, type Candidate } from '@/types/election';
import { tseApi, ELECTION_IDS, type TSECandidate } from '@/lib/tse-api';
import { toast } from 'sonner';

interface CandidateSearchProps {
  onSelectCandidate: (candidate: Candidate) => void;
}

const UF_LIST = [
  'AC','AL','AM','AP','BA','CE','DF','ES','GO','MA','MG','MS','MT',
  'PA','PB','PE','PI','PR','RJ','RN','RO','RR','RS','SC','SE','SP','TO'
];

// Map TSE cargo code → our cargo type
const TSE_CARGO_REVERSE: Record<number, CargoType> = {
  1: 'presidente',
  3: 'governador',
  5: 'senador',
  6: 'deputado_federal',
  7: 'deputado_estadual',
  11: 'prefeito',
  13: 'vereador',
};

function tseCandidateToLocal(c: TSECandidate, cargoCode: number, ano: number): Candidate {
  return {
    id: String(c.id),
    nome: c.nomeCompleto || c.nomeUrna,
    nome_urna: c.nomeUrna,
    numero: c.numero,
    partido: c.partido?.sigla || '',
    cargo: TSE_CARGO_REVERSE[cargoCode] || 'deputado_federal',
    uf: c.uf || '',
    ano_eleicao: ano,
    situacao: c.descricaoTotalizacao || '',
    foto_url: undefined,
  };
}

export function CandidateSearch({ onSelectCandidate }: CandidateSearchProps) {
  const [searchName, setSearchName] = useState('');
  const [cargo, setCargo] = useState<string>('deputado_federal');
  const [uf, setUf] = useState<string>('');
  const [anoEleicao, setAnoEleicao] = useState<string>('2022');
  const [results, setResults] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchMode, setSearchMode] = useState<'tse' | 'local'>('tse');

  const CARGO_TO_TSE: Record<string, number> = {
    presidente: 1, governador: 3, senador: 5,
    deputado_federal: 6, deputado_estadual: 7,
    prefeito: 11, vereador: 13,
  };

  const handleSearch = async () => {
    if (!searchName.trim()) {
      toast.error('Informe o nome do candidato');
      return;
    }
    if (!cargo) {
      toast.error('Selecione um cargo');
      return;
    }

    setLoading(true);
    setResults([]);

    try {
      const ano = parseInt(anoEleicao);
      const cargoCode = CARGO_TO_TSE[cargo] || 6;

      // For national/state cargos with name search, use search-all-states
      // For municipal cargos or with UF filter, use search-candidates
      let data;

      if (uf || cargoCode >= 11) {
        // Direct search on specific UF or municipal cargos
        data = await tseApi.searchCandidates({
          ano,
          cargo,
          ue: uf || 'BR',
          nome: searchName.trim(),
        });
      } else {
        // Search across all states
        data = await tseApi.searchAllStates({
          ano,
          cargo,
          nome: searchName.trim(),
        });
      }

      const candidates = (data.candidatos || []).map((c: TSECandidate) =>
        tseCandidateToLocal(c, cargoCode, ano)
      );

      setResults(candidates);

      if (!candidates.length) {
        toast.info('Nenhum candidato encontrado no TSE com esses filtros');
      } else {
        toast.success(`${candidates.length} candidato(s) encontrado(s) no TSE`);
      }
    } catch (err: unknown) {
      console.error(err);
      const msg = err instanceof Error ? err.message : 'Erro ao buscar candidatos';
      toast.error('Erro na busca', { description: msg });
    } finally {
      setLoading(false);
    }
  };

  const getSituacaoColor = (situacao: string) => {
    const s = (situacao || '').toLowerCase();
    if (s.includes('eleito')) return 'bg-green-500/20 text-green-300';
    if (s.includes('não eleito') || s.includes('nao eleito')) return 'bg-red-500/20 text-red-300';
    if (s.includes('suplente')) return 'bg-yellow-500/20 text-yellow-300';
    if (s.includes('2º turno') || s.includes('2o turno')) return 'bg-blue-500/20 text-blue-300';
    return 'bg-slate-500/20 text-slate-300';
  };

  return (
    <div className="space-y-4">
      <Card className="bg-slate-900/60 border-slate-700/50">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg text-white flex items-center gap-2">
              <Search className="h-5 w-5 text-blue-400" />
              Buscar Candidato — API TSE
            </CardTitle>
            <Badge variant="outline" className="text-green-400 border-green-500/30">
              Dados em tempo real do TSE
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
            <Input
              placeholder="Nome do candidato..."
              value={searchName}
              onChange={(e) => setSearchName(e.target.value)}
              className="bg-slate-800/50 border-slate-600 text-white placeholder:text-slate-500 lg:col-span-2"
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            />
            <Select value={cargo} onValueChange={(v) => setCargo(v ?? 'deputado_federal')}>
              <SelectTrigger className="bg-slate-800/50 border-slate-600 text-white">
                <SelectValue placeholder="Cargo" />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(CARGO_LABELS).map(([key, label]) => (
                  <SelectItem key={key} value={key}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={uf} onValueChange={(v) => setUf(v ?? '')}>
              <SelectTrigger className="bg-slate-800/50 border-slate-600 text-white">
                <SelectValue placeholder="UF (todos)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value=" ">Todos os estados</SelectItem>
                {UF_LIST.map((u) => (
                  <SelectItem key={u} value={u}>{u}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={anoEleicao} onValueChange={(v) => setAnoEleicao(v ?? '2022')}>
              <SelectTrigger className="bg-slate-800/50 border-slate-600 text-white">
                <SelectValue placeholder="Ano" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="2024">2024</SelectItem>
                <SelectItem value="2022">2022</SelectItem>
                <SelectItem value="2020">2020</SelectItem>
                <SelectItem value="2018">2018</SelectItem>
                <SelectItem value="2016">2016</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button
            onClick={handleSearch}
            disabled={loading}
            className="mt-3 bg-blue-600 hover:bg-blue-700 text-white"
          >
            {loading ? 'Buscando no TSE...' : 'Buscar no TSE'}
          </Button>
        </CardContent>
      </Card>

      {results.length > 0 && (
        <>
          <p className="text-sm text-slate-400">
            {results.length} resultado(s) — clique para selecionar
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {results.map((candidate) => (
              <Card
                key={candidate.id}
                className="bg-slate-900/60 border-slate-700/50 hover:border-blue-500/50 transition-colors cursor-pointer group"
                onClick={() => onSelectCandidate(candidate)}
              >
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <div className="bg-slate-800 rounded-full p-2 group-hover:bg-blue-900/50 transition-colors">
                      <User className="h-6 w-6 text-blue-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-white font-semibold truncate">
                        {candidate.nome_urna || candidate.nome}
                      </h3>
                      <p className="text-slate-400 text-sm truncate">{candidate.nome}</p>
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        <Badge variant="secondary" className="bg-blue-500/20 text-blue-300 text-xs">
                          {candidate.partido}
                        </Badge>
                        <Badge variant="secondary" className="bg-green-500/20 text-green-300 text-xs">
                          {CARGO_LABELS[candidate.cargo] || candidate.cargo}
                        </Badge>
                        {candidate.uf && (
                          <Badge variant="secondary" className="bg-yellow-500/20 text-yellow-300 text-xs">
                            <MapPin className="h-3 w-3 mr-1" />
                            {candidate.uf}
                          </Badge>
                        )}
                        <Badge variant="outline" className="text-slate-400 text-xs">
                          #{candidate.numero}
                        </Badge>
                        {candidate.situacao && (
                          <Badge className={`text-xs ${getSituacaoColor(candidate.situacao)}`}>
                            {candidate.situacao.includes('Eleito') && <Trophy className="h-3 w-3 mr-1" />}
                            {candidate.situacao}
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
