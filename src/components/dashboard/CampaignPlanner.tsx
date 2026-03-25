import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Brain, Sparkles, Target, DollarSign, Users, MapPin, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { CARGO_LABELS, type CargoType, type Candidate } from '@/types/election';
import { toast } from 'sonner';
import ReactMarkdown from 'react-markdown';

interface CampaignPlannerProps {
  candidate: Candidate;
}

export function CampaignPlanner({ candidate }: CampaignPlannerProps) {
  const { user } = useAuth();
  const [targetCargo, setTargetCargo] = useState<CargoType>(candidate.cargo);
  const [plan, setPlan] = useState<string>('');
  const [generating, setGenerating] = useState(false);

  const generatePlan = async () => {
    if (!user) return;
    setGenerating(true);
    setPlan('');

    try {
      const { data, error } = await supabase.functions.invoke('generate-campaign-plan', {
        body: {
          candidate_id: candidate.id,
          candidate_name: candidate.nome_urna || candidate.nome,
          partido: candidate.partido,
          cargo_atual: candidate.cargo,
          cargo_alvo: targetCargo,
          uf: candidate.uf,
          ano_historico: candidate.ano_eleicao,
        },
      });

      if (error) throw error;

      setPlan(data.plan || 'Erro ao gerar plano');

      // Save to database
      await supabase.from('campaign_plans').insert({
        candidate_id: candidate.id,
        cargo: targetCargo,
        content: data.plan,
        estrategia_geografica: data.estrategia_geografica,
        estimativa_custo: data.estimativa_custo,
        engajamento: data.engajamento,
        status: 'ready',
        user_id: user.id,
      });

      toast.success('Plano de campanha gerado com sucesso!');
    } catch (err: unknown) {
      console.error(err);
      toast.error('Erro ao gerar plano de campanha');
      setPlan('Erro ao gerar o plano. Tente novamente.');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <Card className="bg-slate-900/60 border-slate-700/50">
      <CardHeader>
        <CardTitle className="text-lg text-white flex items-center gap-2">
          <Brain className="h-5 w-5 text-purple-400" />
          Planejamento de Campanha com IA
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="bg-slate-800/50 rounded-lg p-4 space-y-3">
          <div className="flex flex-wrap gap-3 items-end">
            <div className="space-y-1.5">
              <label className="text-sm text-slate-400">Candidato</label>
              <p className="text-white font-semibold">{candidate.nome_urna || candidate.nome}</p>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm text-slate-400">Partido</label>
              <Badge className="bg-blue-500/20 text-blue-300">{candidate.partido}</Badge>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm text-slate-400">Cargo histórico</label>
              <Badge className="bg-green-500/20 text-green-300">
                {CARGO_LABELS[candidate.cargo]}
              </Badge>
            </div>
            <div className="space-y-1.5 min-w-[200px]">
              <label className="text-sm text-slate-400">Cargo alvo 2026</label>
              <Select value={targetCargo} onValueChange={(v) => setTargetCargo(v as CargoType)}>
                <SelectTrigger className="bg-slate-700/50 border-slate-600 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(CARGO_LABELS).map(([key, label]) => (
                    <SelectItem key={key} value={key}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <Separator className="bg-slate-700" />

          <div className="flex flex-wrap gap-2">
            <div className="flex items-center gap-1 text-xs text-slate-400">
              <Target className="h-3.5 w-3.5 text-purple-400" />
              Estratégia geográfica
            </div>
            <div className="flex items-center gap-1 text-xs text-slate-400">
              <DollarSign className="h-3.5 w-3.5 text-green-400" />
              Otimização de custos
            </div>
            <div className="flex items-center gap-1 text-xs text-slate-400">
              <Users className="h-3.5 w-3.5 text-blue-400" />
              Engajamento eleitoral
            </div>
            <div className="flex items-center gap-1 text-xs text-slate-400">
              <MapPin className="h-3.5 w-3.5 text-yellow-400" />
              Análise regional
            </div>
          </div>

          <Button
            onClick={generatePlan}
            disabled={generating}
            className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white"
          >
            {generating ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Gerando plano com IA...
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4 mr-2" />
                Gerar Plano de Campanha
              </>
            )}
          </Button>
        </div>

        {plan && (
          <ScrollArea className="h-[600px]">
            <div className="bg-slate-800/30 rounded-lg p-6 prose prose-invert prose-sm max-w-none">
              <ReactMarkdown>{plan}</ReactMarkdown>
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
