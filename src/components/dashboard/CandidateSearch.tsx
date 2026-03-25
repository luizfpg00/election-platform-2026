import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Search, User, MapPin } from 'lucide-react';
import { CARGO_LABELS, type CargoType, type Candidate } from '@/types/election';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';

interface CandidateSearchProps {
  onSelectCandidate: (candidate: Candidate) => void;
}

const UF_LIST = [
  'AC','AL','AM','AP','BA','CE','DF','ES','GO','MA','MG','MS','MT',
  'PA','PB','PE','PI','PR','RJ','RN','RO','RR','RS','SC','SE','SP','TO'
];

export function CandidateSearch({ onSelectCandidate }: CandidateSearchProps) {
  const [searchName, setSearchName] = useState('');
  const [cargo, setCargo] = useState<string>('');
  const [uf, setUf] = useState<string>('');
  const [anoEleicao, setAnoEleicao] = useState<string>('2022');
  const [results, setResults] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(false);

  const handleSearch = async () => {
    if (!searchName.trim() && !cargo) {
      toast.error('Informe o nome do candidato ou selecione um cargo');
      return;
    }

    setLoading(true);
    try {
      let query = supabase
        .from('candidates')
        .select('*')
        .eq('ano_eleicao', parseInt(anoEleicao));

      if (searchName.trim()) {
        query = query.ilike('nome', `%${searchName.trim()}%`);
      }
      if (cargo) {
        query = query.eq('cargo', cargo);
      }
      if (uf) {
        query = query.eq('uf', uf);
      }

      const { data, error } = await query.limit(50).order('nome');

      if (error) throw error;
      setResults(data || []);
      if (!data?.length) {
        toast.info('Nenhum candidato encontrado com esses filtros');
      }
    } catch (err: unknown) {
      console.error(err);
      toast.error('Erro ao buscar candidatos');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card className="bg-slate-900/60 border-slate-700/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg text-white flex items-center gap-2">
            <Search className="h-5 w-5 text-blue-400" />
            Buscar Candidato
          </CardTitle>
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
            <Select value={cargo} onValueChange={(v) => setCargo(v ?? '')}>
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
                <SelectValue placeholder="UF" />
              </SelectTrigger>
              <SelectContent>
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
              </SelectContent>
            </Select>
          </div>
          <Button
            onClick={handleSearch}
            disabled={loading}
            className="mt-3 bg-blue-600 hover:bg-blue-700 text-white"
          >
            {loading ? 'Buscando...' : 'Buscar'}
          </Button>
        </CardContent>
      </Card>

      {results.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {results.map((candidate) => (
            <Card
              key={candidate.id}
              className="bg-slate-900/60 border-slate-700/50 hover:border-blue-500/50 transition-colors cursor-pointer"
              onClick={() => onSelectCandidate(candidate)}
            >
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <div className="bg-slate-800 rounded-full p-2">
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
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
