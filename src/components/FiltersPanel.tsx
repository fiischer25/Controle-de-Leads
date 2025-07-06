import React from 'react';
import { X, Calendar, Filter } from 'lucide-react';

interface FiltersPanelProps {
  filters: {
    status: string;
    projectType: string;
    contactOrigin: string;
    city: string;
    familyStructure: string;
    ageRange: string;
    meetingHeld: string;
    proposalSent: string;
    dateRange: { start: string; end: string };
  };
  onFiltersChange: (filters: any) => void;
  onClose: () => void;
}

const FiltersPanel: React.FC<FiltersPanelProps> = ({ filters, onFiltersChange, onClose }) => {
  const handleFilterChange = (key: string, value: any) => {
    onFiltersChange({
      ...filters,
      [key]: value
    });
  };

  const handleDateRangeChange = (key: string, value: string) => {
    onFiltersChange({
      ...filters,
      dateRange: {
        ...filters.dateRange,
        [key]: value
      }
    });
  };

  const clearFilters = () => {
    onFiltersChange({
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
  };

  return (
    <div className="mt-4 p-4 bg-gray-50 rounded-lg border">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-gray-600" />
          <h3 className="text-sm font-medium text-gray-900">Filtros</h3>
        </div>
        <button
          onClick={onClose}
          className="p-1 hover:bg-gray-200 rounded transition-colors"
        >
          <X className="w-4 h-4 text-gray-500" />
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {/* Status */}
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">
            Status
          </label>
          <select
            value={filters.status}
            onChange={(e) => handleFilterChange('status', e.target.value)}
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="">Todos</option>
            <option value="Em Andamento">Em Andamento</option>
            <option value="Fechado">Fechado</option>
            <option value="Perdido">Perdido</option>
          </select>
        </div>

        {/* Tipo de Projeto */}
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">
            Tipo de Projeto
          </label>
          <select
            value={filters.projectType}
            onChange={(e) => handleFilterChange('projectType', e.target.value)}
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="">Todos</option>
            <option value="Residencial">Residencial</option>
            <option value="Comercial">Comercial</option>
            <option value="Reforma">Reforma</option>
            <option value="Paisagismo">Paisagismo</option>
          </select>
        </div>

        {/* Origem do Contato */}
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">
            Origem do Contato
          </label>
          <select
            value={filters.contactOrigin}
            onChange={(e) => handleFilterChange('contactOrigin', e.target.value)}
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="">Todas</option>
            <option value="Site">Site</option>
            <option value="Instagram">Instagram</option>
            <option value="Facebook">Facebook</option>
            <option value="Google Ads">Google Ads</option>
            <option value="Indicação">Indicação</option>
            <option value="WhatsApp">WhatsApp</option>
          </select>
        </div>

        {/* Cidade */}
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">
            Cidade
          </label>
          <select
            value={filters.city}
            onChange={(e) => handleFilterChange('city', e.target.value)}
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="">Todas</option>
            <option value="São Paulo">São Paulo</option>
            <option value="Campinas">Campinas</option>
            <option value="Santos">Santos</option>
            <option value="Guarulhos">Guarulhos</option>
            <option value="São Bernardo">São Bernardo</option>
          </select>
        </div>

        {/* Estrutura Familiar */}
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">
            Estrutura Familiar
          </label>
          <select
            value={filters.familyStructure}
            onChange={(e) => handleFilterChange('familyStructure', e.target.value)}
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="">Todas</option>
            <option value="Solteiro(a)">Solteiro(a)</option>
            <option value="Casal sem filhos">Casal sem filhos</option>
            <option value="Casal com filhos">Casal com filhos</option>
            <option value="Família monoparental">Família monoparental</option>
            <option value="Outros">Outros</option>
          </select>
        </div>

        {/* Faixa Etária */}
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">
            Faixa Etária
          </label>
          <select
            value={filters.ageRange}
            onChange={(e) => handleFilterChange('ageRange', e.target.value)}
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="">Todas</option>
            <option value="18-25">18-25 anos</option>
            <option value="26-35">26-35 anos</option>
            <option value="36-45">36-45 anos</option>
            <option value="46-55">46-55 anos</option>
            <option value="56-65">56-65 anos</option>
            <option value="65+">65+ anos</option>
          </select>
        </div>

        {/* Reunião Realizada */}
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">
            Reunião Realizada
          </label>
          <select
            value={filters.meetingHeld}
            onChange={(e) => handleFilterChange('meetingHeld', e.target.value)}
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="">Todas</option>
            <option value="true">Sim</option>
            <option value="false">Não</option>
          </select>
        </div>

        {/* Proposta Enviada */}
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">
            Proposta Enviada
          </label>
          <select
            value={filters.proposalSent}
            onChange={(e) => handleFilterChange('proposalSent', e.target.value)}
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="">Todas</option>
            <option value="true">Sim</option>
            <option value="false">Não</option>
          </select>
        </div>

        {/* Data Inicial */}
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">
            <Calendar className="w-3 h-3 inline mr-1" />
            Data Inicial
          </label>
          <input
            type="date"
            value={filters.dateRange.start}
            onChange={(e) => handleDateRangeChange('start', e.target.value)}
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>

        {/* Data Final */}
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">
            <Calendar className="w-3 h-3 inline mr-1" />
            Data Final
          </label>
          <input
            type="date"
            value={filters.dateRange.end}
            onChange={(e) => handleDateRangeChange('end', e.target.value)}
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
      </div>

      <div className="flex justify-end mt-4">
        <button
          onClick={clearFilters}
          className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
        >
          Limpar Filtros
        </button>
      </div>
    </div>
  );
};

export default FiltersPanel;