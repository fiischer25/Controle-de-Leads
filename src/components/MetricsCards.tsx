import React from 'react';
import { Users, CheckCircle, XCircle, Clock, DollarSign, TrendingUp, Calendar, FileText } from 'lucide-react';
import { Metrics } from '../types';

interface MetricsCardsProps {
  metrics: Metrics;
}

const MetricsCards: React.FC<MetricsCardsProps> = ({ metrics }) => {
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(value);
  };

  const cards = [
    {
      title: 'Total de Leads',
      value: metrics.totalLeads,
      icon: Users,
      color: 'bg-blue-500',
      bgColor: 'bg-blue-50',
      textColor: 'text-blue-700'
    },
    {
      title: 'Leads Fechados',
      value: metrics.closedLeads,
      icon: CheckCircle,
      color: 'bg-green-500',
      bgColor: 'bg-green-50',
      textColor: 'text-green-700'
    },
    {
      title: 'Em Andamento',
      value: metrics.inProgressLeads,
      icon: Clock,
      color: 'bg-yellow-500',
      bgColor: 'bg-yellow-50',
      textColor: 'text-yellow-700'
    },
    {
      title: 'Leads Perdidos',
      value: metrics.lostLeads,
      icon: XCircle,
      color: 'bg-red-500',
      bgColor: 'bg-red-50',
      textColor: 'text-red-700'
    },
    {
      title: 'Valor Fechado',
      value: formatCurrency(metrics.closedValue),
      icon: DollarSign,
      color: 'bg-green-500',
      bgColor: 'bg-green-50',
      textColor: 'text-green-700'
    },
    {
      title: 'Taxa de Conversão',
      value: `${metrics.conversionRate.toFixed(1)}%`,
      icon: TrendingUp,
      color: 'bg-purple-500',
      bgColor: 'bg-purple-50',
      textColor: 'text-purple-700'
    },
    {
      title: 'Reuniões Realizadas',
      value: `${metrics.meetingStats.held}/${metrics.totalLeads}`,
      icon: Calendar,
      color: 'bg-indigo-500',
      bgColor: 'bg-indigo-50',
      textColor: 'text-indigo-700'
    },
    {
      title: 'Propostas Enviadas',
      value: `${metrics.proposalStats.sent}/${metrics.totalLeads}`,
      icon: FileText,
      color: 'bg-cyan-500',
      bgColor: 'bg-cyan-50',
      textColor: 'text-cyan-700'
    }
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8 gap-6 mb-8">
      {cards.map((card, index) => (
        <div key={index} className={`${card.bgColor} rounded-lg p-6 shadow-sm hover:shadow-md transition-shadow`}>
          <div className="flex items-center justify-between">
            <div>
              <p className={`text-sm font-medium ${card.textColor}`}>
                {card.title}
              </p>
              <p className={`text-2xl font-bold ${card.textColor} mt-1`}>
                {card.value}
              </p>
            </div>
            <div className={`${card.color} rounded-full p-3`}>
              <card.icon className="w-5 h-5 text-white" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

export default MetricsCards