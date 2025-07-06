import React from 'react';
import { BarChart3, PieChart, TrendingUp, Users, MapPin, Calendar } from 'lucide-react';
import { Lead, Metrics } from '../types';

interface LeadsChartProps {
  leads: Lead[];
  metrics: Metrics;
}

const LeadsChart: React.FC<LeadsChartProps> = ({ leads, metrics }) => {
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(value);
  };

  // Agrupar por status
  const statusData = leads.reduce((acc, lead) => {
    if (!acc[lead.status]) {
      acc[lead.status] = { count: 0, value: 0 };
    }
    acc[lead.status].count++;
    acc[lead.status].value += lead.budgetValue;
    return acc;
  }, {} as Record<string, { count: number; value: number }>);

  // Agrupar por tipo de projeto
  const projectTypeData = leads.reduce((acc, lead) => {
    if (!acc[lead.projectType]) {
      acc[lead.projectType] = { count: 0, value: 0 };
    }
    acc[lead.projectType].count++;
    acc[lead.projectType].value += lead.budgetValue;
    return acc;
  }, {} as Record<string, { count: number; value: number }>);

  const statusColors = {
    'Fechado': 'bg-green-500',
    'Em Andamento': 'bg-blue-500',
    'Perdido': 'bg-red-500'
  };

  const originColors = [
    'bg-purple-500',
    'bg-indigo-500',
    'bg-pink-500',
    'bg-cyan-500',
    'bg-orange-500',
    'bg-yellow-500'
  ];

  const projectColors = [
    'bg-emerald-500',
    'bg-teal-500',
    'bg-sky-500',
    'bg-violet-500'
  ];

  const cityColors = [
    'bg-rose-500',
    'bg-amber-500',
    'bg-lime-500',
    'bg-blue-600',
    'bg-purple-600'
  ];

  const ageColors = [
    'bg-red-400',
    'bg-orange-400',
    'bg-yellow-400',
    'bg-green-400',
    'bg-blue-400',
    'bg-purple-400'
  ];

  const maxValue = Math.max(...Object.values(statusData).map(d => d.value));

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
      {/* Gráfico de Status */}
      <div className="bg-white rounded-lg shadow-sm p-6">
        <div className="flex items-center gap-2 mb-4">
          <BarChart3 className="w-5 h-5 text-gray-600" />
          <h3 className="text-lg font-semibold text-gray-900">Status dos Leads</h3>
        </div>
        <div className="space-y-4">
          {Object.entries(statusData).map(([status, data]) => (
            <div key={status} className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium text-gray-700">{status}</span>
                <div className="text-right">
                  <div className="text-sm font-semibold text-gray-900">
                    {data.count} leads
                  </div>
                  <div className="text-xs text-gray-500">
                    {formatCurrency(data.value)}
                  </div>
                </div>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className={`h-2 rounded-full transition-all duration-300 ${statusColors[status as keyof typeof statusColors]}`}
                  style={{ width: `${maxValue > 0 ? (data.value / maxValue) * 100 : 0}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Gráfico de Origem do Contato */}
      <div className="bg-white rounded-lg shadow-sm p-6">
        <div className="flex items-center gap-2 mb-4">
          <PieChart className="w-5 h-5 text-gray-600" />
          <h3 className="text-lg font-semibold text-gray-900">Origem do Contato</h3>
        </div>
        <div className="space-y-3">
          {Object.entries(metrics.originStats).map(([origin, data], index) => {
            const percentage = leads.length > 0 ? (data.count / leads.length) * 100 : 0;
            return (
              <div key={origin} className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`w-3 h-3 rounded-full ${originColors[index % originColors.length]}`} />
                  <span className="text-sm font-medium text-gray-700">{origin}</span>
                </div>
                <div className="text-right">
                  <div className="text-sm font-semibold text-gray-900">
                    {percentage.toFixed(1)}%
                  </div>
                  <div className="text-xs text-gray-500">
                    {formatCurrency(data.value)}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Gráfico de Tipos de Projeto */}
      <div className="bg-white rounded-lg shadow-sm p-6">
        <div className="flex items-center gap-2 mb-4">
          <TrendingUp className="w-5 h-5 text-gray-600" />
          <h3 className="text-lg font-semibold text-gray-900">Tipos de Projeto</h3>
        </div>
        <div className="space-y-4">
          {Object.entries(projectTypeData).map(([type, data], index) => {
            const maxProjectValue = Math.max(...Object.values(projectTypeData).map(d => d.value));
            return (
              <div key={type} className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-sm font-medium text-gray-700">{type}</span>
                  <div className="text-right">
                    <div className="text-sm font-semibold text-gray-900">
                      {data.count} leads
                    </div>
                    <div className="text-xs text-gray-500">
                      {formatCurrency(data.value)}
                    </div>
                  </div>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className={`h-2 rounded-full transition-all duration-300 ${projectColors[index % projectColors.length]}`}
                    style={{ width: `${maxProjectValue > 0 ? (data.value / maxProjectValue) * 100 : 0}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Gráfico de Cidades */}
      <div className="bg-white rounded-lg shadow-sm p-6">
        <div className="flex items-center gap-2 mb-4">
          <MapPin className="w-5 h-5 text-gray-600" />
          <h3 className="text-lg font-semibold text-gray-900">Distribuição por Cidade</h3>
        </div>
        <div className="space-y-3">
          {Object.entries(metrics.cityStats).map(([city, data], index) => {
            const percentage = leads.length > 0 ? (data.count / leads.length) * 100 : 0;
            return (
              <div key={city} className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`w-3 h-3 rounded-full ${cityColors[index % cityColors.length]}`} />
                  <span className="text-sm font-medium text-gray-700">{city}</span>
                </div>
                <div className="text-right">
                  <div className="text-sm font-semibold text-gray-900">
                    {percentage.toFixed(1)}%
                  </div>
                  <div className="text-xs text-gray-500">
                    {formatCurrency(data.value)}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Gráfico de Faixa Etária */}
      <div className="bg-white rounded-lg shadow-sm p-6">
        <div className="flex items-center gap-2 mb-4">
          <Users className="w-5 h-5 text-gray-600" />
          <h3 className="text-lg font-semibold text-gray-900">Faixa Etária</h3>
        </div>
        <div className="space-y-3">
          {Object.entries(metrics.ageStats).map(([age, data], index) => {
            const percentage = leads.length > 0 ? (data.count / leads.length) * 100 : 0;
            return (
              <div key={age} className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`w-3 h-3 rounded-full ${ageColors[index % ageColors.length]}`} />
                  <span className="text-sm font-medium text-gray-700">{age} anos</span>
                </div>
                <div className="text-right">
                  <div className="text-sm font-semibold text-gray-900">
                    {percentage.toFixed(1)}%
                  </div>
                  <div className="text-xs text-gray-500">
                    {formatCurrency(data.value)}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Gráfico de Acompanhamento */}
      <div className="bg-white rounded-lg shadow-sm p-6">
        <div className="flex items-center gap-2 mb-4">
          <Calendar className="w-5 h-5 text-gray-600" />
          <h3 className="text-lg font-semibold text-gray-900">Acompanhamento</h3>
        </div>
        <div className="space-y-4">
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-sm font-medium text-gray-700">Reuniões Realizadas</span>
              <div className="text-right">
                <div className="text-sm font-semibold text-gray-900">
                  {metrics.meetingStats.held} de {leads.length}
                </div>
                <div className="text-xs text-gray-500">
                  {leads.length > 0 ? ((metrics.meetingStats.held / leads.length) * 100).toFixed(1) : 0}%
                </div>
              </div>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className="h-2 rounded-full transition-all duration-300 bg-green-500"
                style={{ width: `${leads.length > 0 ? (metrics.meetingStats.held / leads.length) * 100 : 0}%` }}
              />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-sm font-medium text-gray-700">Propostas Enviadas</span>
              <div className="text-right">
                <div className="text-sm font-semibold text-gray-900">
                  {metrics.proposalStats.sent} de {leads.length}
                </div>
                <div className="text-xs text-gray-500">
                  {leads.length > 0 ? ((metrics.proposalStats.sent / leads.length) * 100).toFixed(1) : 0}%
                </div>
              </div>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className="h-2 rounded-full transition-all duration-300 bg-blue-500"
                style={{ width: `${leads.length > 0 ? (metrics.proposalStats.sent / leads.length) * 100 : 0}%` }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LeadsChart;