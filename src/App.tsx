import React, { useState, useMemo } from 'react';
import { Plus, Search, Filter, TrendingUp, Target, BarChart3, Users, Calendar, DollarSign } from 'lucide-react';
import LeadsTable from './components/LeadsTable';
import LeadsChart from './components/LeadsChart';
import MetricsCards from './components/MetricsCards';
import AddLeadModal from './components/AddLeadModal';
import FiltersPanel from './components/FiltersPanel';
import { Lead, LeadStatus, ProjectType, ContactOrigin } from './types';

// Dados mock para demonstração
const mockLeads: Lead[] = [
  {
    id: 1,
    name: "João Silva",
    email: "joao.silva@email.com",
    phone: "(11) 99999-9999",
    city: "São Paulo",
    familyStructure: "Casal com filhos",
    ageRange: "36-45",
    profession: "Engenheiro",
    projectType: "Residencial",
    budgetValue: 250000,
    areaM2: 150,
    status: "Fechado",
    contactOrigin: "Instagram",
    meetingHeld: true,
    proposalSent: true,
    createdAt: "2025-01-15",
    notes: "Projeto de casa térrea 150m² com 3 quartos"
  },
  {
    id: 2,
    name: "Maria Santos",
    email: "maria.santos@email.com",
    phone: "(11) 88888-8888",
    city: "Campinas",
    familyStructure: "Solteiro(a)",
    ageRange: "26-35",
    profession: "Advogada",
    projectType: "Comercial",
    budgetValue: 450000,
    areaM2: 80,
    status: "Em Andamento",
    contactOrigin: "Site",
    meetingHeld: true,
    proposalSent: false,
    createdAt: "2025-01-20",
    notes: "Loja de roupas no centro da cidade"
  },
  {
    id: 3,
    name: "Pedro Oliveira",
    email: "pedro.oliveira@email.com",
    phone: "(11) 77777-7777",
    city: "Santos",
    familyStructure: "Casal sem filhos",
    ageRange: "46-55",
    profession: "Médico",
    projectType: "Residencial",
    budgetValue: 180000,
    areaM2: 70,
    status: "Perdido",
    contactOrigin: "Indicação",
    meetingHeld: false,
    proposalSent: false,
    createdAt: "2025-01-10",
    notes: "Apartamento compacto, orçamento limitado"
  },
  {
    id: 4,
    name: "Ana Costa",
    email: "ana.costa@email.com",
    phone: "(11) 66666-6666",
    city: "São Paulo",
    familyStructure: "Família monoparental",
    ageRange: "36-45",
    profession: "Professora",
    projectType: "Reforma",
    budgetValue: 80000,
    areaM2: 45,
    status: "Fechado",
    contactOrigin: "Facebook",
    meetingHeld: true,
    proposalSent: true,
    createdAt: "2025-01-25",
    notes: "Reforma completa de cozinha e banheiro"
  },
  {
    id: 5,
    name: "Carlos Mendes",
    email: "carlos.mendes@email.com",
    phone: "(11) 55555-5555",
    city: "Guarulhos",
    familyStructure: "Casal com filhos",
    ageRange: "46-55",
    profession: "Empresário",
    projectType: "Comercial",
    budgetValue: 320000,
    areaM2: 120,
    status: "Em Andamento",
    contactOrigin: "Google Ads",
    meetingHeld: true,
    proposalSent: true,
    createdAt: "2025-01-18",
    notes: "Consultório médico com sala de espera ampla"
  },
  {
    id: 6,
    name: "Lucia Ferreira",
    email: "lucia.ferreira@email.com",
    phone: "(11) 44444-4444",
    city: "São Bernardo",
    familyStructure: "Casal sem filhos",
    ageRange: "26-35",
    profession: "Designer",
    projectType: "Residencial",
    budgetValue: 380000,
    areaM2: 200,
    status: "Em Andamento",
    contactOrigin: "Site",
    meetingHeld: false,
    proposalSent: false,
    createdAt: "2025-01-12",
    notes: "Casa moderna com piscina e área gourmet"
  }
];

function App() {
  const [leads, setLeads] = useState<Lead[]>(mockLeads);
  const [filteredLeads, setFilteredLeads] = useState<Lead[]>(mockLeads);
  const [searchTerm, setSearchTerm] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [annualGoal, setAnnualGoal] = useState(12000000); // Meta anual padrão de R$ 12 milhões
  const [goalInput, setGoalInput] = useState('12.000.000'); // Input formatado
  const [filters, setFilters] = useState({
    status: '',
    projectType: '',
    contactOrigin: '',
    city: '',
    familyStructure: '',
    ageRange: '',
    meetingHeld: '',
    proposalSent: '',
    dateRange: { start: '', end: '' }
  });

  // Aplicar filtros
  const applyFilters = (newFilters: typeof filters) => {
    let filtered = leads;

    // Filtro por termo de busca
    if (searchTerm) {
      filtered = filtered.filter(lead => 
        lead.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        lead.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
        lead.phone.includes(searchTerm) ||
        lead.city.toLowerCase().includes(searchTerm.toLowerCase()) ||
        lead.profession.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    // Aplicar todos os filtros
    Object.entries(newFilters).forEach(([key, value]) => {
      if (value && key !== 'dateRange') {
        if (key === 'meetingHeld' || key === 'proposalSent') {
          filtered = filtered.filter(lead => lead[key as keyof Lead] === (value === 'true'));
        } else {
          filtered = filtered.filter(lead => lead[key as keyof Lead] === value);
        }
      }
    });

    // Filtro por data
    if (newFilters.dateRange.start) {
      filtered = filtered.filter(lead => lead.createdAt >= newFilters.dateRange.start);
    }
    if (newFilters.dateRange.end) {
      filtered = filtered.filter(lead => lead.createdAt <= newFilters.dateRange.end);
    }

    setFilteredLeads(filtered);
  };

  // Atualizar filtros quando searchTerm ou filters mudam
  React.useEffect(() => {
    applyFilters(filters);
  }, [searchTerm, filters, leads]);

  // Calcular métricas
  const metrics = useMemo(() => {
    const closedLeads = leads.filter(lead => lead.status === 'Fechado');
    const lostLeads = leads.filter(lead => lead.status === 'Perdido');
    const inProgressLeads = leads.filter(lead => lead.status === 'Em Andamento');

    const closedValue = closedLeads.reduce((sum, lead) => sum + lead.budgetValue, 0);
    const totalValue = leads.reduce((sum, lead) => sum + lead.budgetValue, 0);
    const conversionRate = leads.length > 0 ? (closedLeads.length / leads.length) * 100 : 0;
    
    // Corrigir cálculo da porcentagem da meta
    const goalProgress = annualGoal > 0 ? (closedValue / annualGoal) * 100 : 0;

    // Estatísticas por origem do contato
    const originStats = leads.reduce((acc, lead) => {
      if (!acc[lead.contactOrigin]) {
        acc[lead.contactOrigin] = { count: 0, value: 0 };
      }
      acc[lead.contactOrigin].count++;
      acc[lead.contactOrigin].value += lead.budgetValue;
      return acc;
    }, {} as Record<string, { count: number; value: number }>);

    // Estatísticas de reuniões
    const meetingStats = {
      held: leads.filter(lead => lead.meetingHeld).length,
      pending: leads.filter(lead => !lead.meetingHeld).length
    };

    // Estatísticas de propostas
    const proposalStats = {
      sent: leads.filter(lead => lead.proposalSent).length,
      pending: leads.filter(lead => !lead.proposalSent).length
    };

    // Estatísticas por cidade
    const cityStats = leads.reduce((acc, lead) => {
      if (!acc[lead.city]) {
        acc[lead.city] = { count: 0, value: 0 };
      }
      acc[lead.city].count++;
      acc[lead.city].value += lead.budgetValue;
      return acc;
    }, {} as Record<string, { count: number; value: number }>);

    // Estatísticas por faixa etária
    const ageStats = leads.reduce((acc, lead) => {
      if (!acc[lead.ageRange]) {
        acc[lead.ageRange] = { count: 0, value: 0 };
      }
      acc[lead.ageRange].count++;
      acc[lead.ageRange].value += lead.budgetValue;
      return acc;
    }, {} as Record<string, { count: number; value: number }>);

    // Estatísticas por estrutura familiar
    const familyStats = leads.reduce((acc, lead) => {
      if (!acc[lead.familyStructure]) {
        acc[lead.familyStructure] = { count: 0, value: 0 };
      }
      acc[lead.familyStructure].count++;
      acc[lead.familyStructure].value += lead.budgetValue;
      return acc;
    }, {} as Record<string, { count: number; value: number }>);

    return {
      totalLeads: leads.length,
      closedLeads: closedLeads.length,
      lostLeads: lostLeads.length,
      inProgressLeads: inProgressLeads.length,
      closedValue,
      totalValue,
      conversionRate,
      goalProgress,
      originStats,
      meetingStats,
      proposalStats,
      cityStats,
      ageStats,
      familyStats
    };
  }, [leads, annualGoal]);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(value);
  };

  // Formatar número para input (sem R$, com pontos para milhares)
  const formatNumberInput = (value: number) => {
    return value.toLocaleString('pt-BR');
  };

  // Converter input formatado para número
  const parseFormattedNumber = (value: string) => {
    return Number(value.replace(/\./g, '').replace(/,/g, '.'));
  };

  // Manipular mudança na meta anual
  const handleGoalChange = (value: string) => {
    // Remove caracteres não numéricos exceto pontos e vírgulas
    const cleanValue = value.replace(/[^\d.,]/g, '');
    setGoalInput(cleanValue);
    
    // Converte para número e atualiza a meta
    const numericValue = parseFormattedNumber(cleanValue);
    if (!isNaN(numericValue)) {
      setAnnualGoal(numericValue);
    }
  };

  const handleAddLead = (leadData: Omit<Lead, 'id'>) => {
    const newLead = {
      ...leadData,
      id: Math.max(...leads.map(l => l.id), 0) + 1
    };
    setLeads([...leads, newLead]);
    setShowAddModal(false);
  };

  const handleUpdateLead = (updatedLead: Lead) => {
    setLeads(leads.map(lead => lead.id === updatedLead.id ? updatedLead : lead));
  };

  const handleDeleteLead = (id: number) => {
    setLeads(leads.filter(lead => lead.id !== id));
  };

  // Calcular valores para exibição na meta
  const remainingValue = Math.max(0, annualGoal - metrics.closedValue);
  const remainingPercentage = annualGoal > 0 ? (remainingValue / annualGoal) * 100 : 100;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900 mb-1">
            Controle de Leads - Arquitetura
          </h1>
          <p className="text-sm text-gray-600">
            Gerencie seus leads e acompanhe o desempenho do seu negócio
          </p>
        </div>

        {/* Resumo Executivo Compacto */}
        <div className="bg-white rounded-lg shadow-sm p-4 mb-6">
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
            <div className="text-center">
              <div className="flex items-center justify-center mb-1">
                <Users className="w-3 h-3 text-blue-600 mr-1" />
                <span className="text-xs font-medium text-gray-600">Total</span>
              </div>
              <p className="text-xl font-bold text-gray-900">{metrics.totalLeads}</p>
            </div>
            
            <div className="text-center">
              <div className="flex items-center justify-center mb-1">
                <TrendingUp className="w-3 h-3 text-green-600 mr-1" />
                <span className="text-xs font-medium text-gray-600">Conversão</span>
              </div>
              <p className="text-xl font-bold text-green-600">{metrics.conversionRate.toFixed(1)}%</p>
            </div>
            
            <div className="text-center">
              <div className="flex items-center justify-center mb-1">
                <DollarSign className="w-3 h-3 text-purple-600 mr-1" />
                <span className="text-xs font-medium text-gray-600">Fechado</span>
              </div>
              <p className="text-lg font-bold text-purple-600">{formatCurrency(metrics.closedValue)}</p>
            </div>
            
            <div className="text-center">
              <div className="flex items-center justify-center mb-1">
                <Target className="w-3 h-3 text-orange-600 mr-1" />
                <span className="text-xs font-medium text-gray-600">Meta Anual</span>
              </div>
              <p className="text-lg font-bold text-orange-600">{metrics.goalProgress.toFixed(1)}%</p>
            </div>

            <div className="text-center">
              <div className="flex items-center justify-center mb-1">
                <Calendar className="w-3 h-3 text-indigo-600 mr-1" />
                <span className="text-xs font-medium text-gray-600">Reuniões</span>
              </div>
              <p className="text-lg font-bold text-indigo-600">{metrics.meetingStats.held}/{metrics.totalLeads}</p>
            </div>

            <div className="text-center">
              <div className="flex items-center justify-center mb-1">
                <BarChart3 className="w-3 h-3 text-cyan-600 mr-1" />
                <span className="text-xs font-medium text-gray-600">Propostas</span>
              </div>
              <p className="text-lg font-bold text-cyan-600">{metrics.proposalStats.sent}/{metrics.totalLeads}</p>
            </div>
          </div>
        </div>

        {/* Meta Anual */}
        <div className="bg-white rounded-lg shadow-sm p-4 mb-6">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Target className="w-4 h-4 text-blue-600" />
              <h3 className="text-base font-semibold text-gray-900">Meta Anual</h3>
            </div>
            <div className="flex items-center gap-6">
              <div className="text-right">
                <p className="text-xs text-gray-600 mb-1">Meta</p>
                <div className="flex items-center">
                  <span className="text-sm text-gray-500 mr-2">R$</span>
                  <input
                    type="text"
                    value={goalInput}
                    onChange={(e) => handleGoalChange(e.target.value)}
                    className="text-sm font-semibold text-gray-900 border border-gray-300 bg-white text-right focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 rounded px-3 py-1 w-32"
                    placeholder="0"
                  />
                </div>
              </div>
              <div className="text-right">
                <p className="text-xs text-gray-600 mb-1">Alcançado</p>
                <p className="text-sm font-semibold text-green-600">
                  {formatCurrency(metrics.closedValue)}
                </p>
                <p className="text-xs text-green-500">
                  {metrics.goalProgress.toFixed(1)}% da meta
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs text-gray-600 mb-1">Restante</p>
                <p className="text-sm font-semibold text-orange-600">
                  {formatCurrency(remainingValue)}
                </p>
                <p className="text-xs text-orange-500">
                  {remainingPercentage.toFixed(1)}% restante
                </p>
              </div>
            </div>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-3">
            <div 
              className="bg-gradient-to-r from-blue-500 to-green-500 h-3 rounded-full transition-all duration-500 relative"
              style={{ width: `${Math.min(metrics.goalProgress, 100)}%` }}
            >
              {metrics.goalProgress > 10 && (
                <span className="absolute right-2 top-0 text-xs text-white font-medium leading-3">
                  {metrics.goalProgress.toFixed(1)}%
                </span>
              )}
            </div>
          </div>
          {metrics.goalProgress >= 100 && (
            <div className="mt-2 text-center">
              <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-green-100 text-green-800">
                🎉 Meta anual atingida! Parabéns!
              </span>
            </div>
          )}
        </div>

        {/* Gráficos */}
        <div className="mb-6">
          <LeadsChart leads={leads} metrics={metrics} />
        </div>

        {/* Controles */}
        <div className="bg-white rounded-lg shadow-sm p-4 mb-4">
          <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
            <div className="flex-1 flex gap-3">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                <input
                  type="text"
                  placeholder="Buscar leads..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <button
                onClick={() => setShowFilters(!showFilters)}
                className="flex items-center gap-2 px-3 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                <Filter className="w-4 h-4" />
                Filtros
              </button>
            </div>
            <button
              onClick={() => setShowAddModal(true)}
              className="flex items-center gap-2 px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Novo Lead
            </button>
          </div>

          {showFilters && (
            <FiltersPanel
              filters={filters}
              onFiltersChange={setFilters}
              onClose={() => setShowFilters(false)}
            />
          )}
        </div>

        {/* Tabela de Leads */}
        <LeadsTable
          leads={filteredLeads}
          onUpdateLead={handleUpdateLead}
          onDeleteLead={handleDeleteLead}
        />

        {/* Modal para adicionar lead */}
        {showAddModal && (
          <AddLeadModal
            onClose={() => setShowAddModal(false)}
            onSubmit={handleAddLead}
          />
        )}
      </div>
    </div>
  );
}

export default App;