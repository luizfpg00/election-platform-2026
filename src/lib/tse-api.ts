import { supabase } from './supabase';

/**
 * TSE API client — calls Edge Function proxy
 */

interface TSECandidate {
  id: number;
  nomeUrna: string;
  nomeCompleto: string;
  numero: number;
  descricaoTotalizacao: string;
  partido: { sigla: string; nome: string };
  eleicao: { id: number; ano: number };
  uf?: string;
}

interface SearchResult {
  total: number;
  candidatos: TSECandidate[];
  unidadeEleitoral?: { sigla: string; nome: string };
  cargo?: { codigo: number; nome: string };
}

async function callProxy<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('tse-proxy', { body });
  if (error) throw new Error(error.message || 'Erro na comunicação com TSE');
  return data as T;
}

export const tseApi = {
  /** Get available election years */
  async getElectionYears(): Promise<number[]> {
    const data = await callProxy<{ anos: number[] }>({ action: 'election-years' });
    return data.anos;
  },

  /** Get all ordinary elections with IDs */
  async getElectionsList() {
    return callProxy({ action: 'elections-list' });
  },

  /** Search candidates by name, cargo, UF */
  async searchCandidates(params: {
    ano: number;
    cargo: string;
    ue?: string;
    nome?: string;
    sqele?: string;
  }): Promise<SearchResult> {
    return callProxy<SearchResult>({
      action: 'search-candidates',
      ...params,
    });
  },

  /** Search candidates across all states */
  async searchAllStates(params: {
    ano: number;
    cargo: string;
    nome: string;
  }): Promise<SearchResult> {
    return callProxy<SearchResult>({
      action: 'search-all-states',
      ...params,
    });
  },

  /** Get candidate detail */
  async getCandidateDetail(params: {
    ano: number;
    municipio?: string;
    sqele: string;
    candidateId: number;
  }) {
    return callProxy({
      action: 'candidate-detail',
      ...params,
    });
  },

  /** Get candidate photo as base64 */
  async getCandidatePhoto(params: {
    sqele: string;
    candidateId: number;
    municipio?: string;
  }): Promise<string | null> {
    try {
      const data = await callProxy<{ photo: string }>({
        action: 'candidate-photo',
        ...params,
      });
      return data.photo;
    } catch {
      return null;
    }
  },

  /** Get election results by state */
  async getElectionResults(params: {
    ciclo: string;
    cdEleicao: string;
    uf: string;
    cargo: string;
  }) {
    return callProxy({
      action: 'election-results',
      ...params,
    });
  },

  /** Get municipality config (zones, codes) */
  async getMunicipalityConfig(params: {
    ciclo: string;
    cdEleicao: string;
  }) {
    return callProxy({
      action: 'municipality-config',
      ...params,
    });
  },

  /** Get abstention/turnout data */
  async getAbstentionData(params: {
    ciclo: string;
    cdEleicao: string;
    uf: string;
  }) {
    return callProxy({
      action: 'abstention-data',
      ...params,
    });
  },

  /** Get section-level config (ballot box mapping) */
  async getSectionConfig(params: {
    ciclo: string;
    cdPleito: string;
    uf: string;
  }) {
    return callProxy({
      action: 'section-config',
      ...params,
    });
  },

  /** Get CDN download URL for bulk data */
  async getCdnDownloadUrl(params: {
    ano: number;
    dataset: 'candidatos' | 'votacao_munzona' | 'votacao_secao' | 'votacao_partido' | 'eleitorado';
  }) {
    return callProxy<{ url: string; dataset: string; ano: number }>({
      action: 'cdn-download-url',
      ...params,
    });
  },

  /** Search datasets on TSE Open Data portal */
  async searchDatasets(query: string, rows = 10) {
    return callProxy({
      action: 'dataset-search',
      query,
      rows,
    });
  },
};

// Election ID mapping (for convenience)
export const ELECTION_IDS: Record<number, string> = {
  2024: '2045202024',
  2022: '2040602022',
  2020: '2030402020',
  2018: '2022802018',
  2016: '2',
};

export type { TSECandidate, SearchResult };
