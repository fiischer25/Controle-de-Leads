import React, { useState } from 'react';
import { Edit2, Trash2, Phone, Mail, Calendar, DollarSign, MapPin, Users, Briefcase, Home, CheckCircle, XCircle } from 'lucide-react';
import { Lead, LeadStatus } from '../types';
import EditLeadModal from './EditLeadModal';

interface LeadsTableProps {
  leads: Lead[];
  onUpdateLead: (lead: Lead) => void;
  onDeleteLead: (id: number) => void;
}

const LeadsTable: React.FC<LeadsTableProps> = ({ leads, onUpdateLead, onDeleteLead }) => {
  const [editingLead, setEditingLead] = useState<Lead | null>(null);

  const getStatusColor = (status: LeadStatus) => {
    switch (status) {
      case 'Fechado':
        return 'bg-green-50 border-green-200';
      case 'Perdido':
        return 'bg-red-50 border-red-200';
      default:
        return 'bg-blue-50 border-blue-200';
    }
  };

  const getStatusBadge = (status: LeadStatus) => {
    const colors = {
      'Fechado': 'bg-green-100 text-green-800',
      'Perdido': 'bg-red-100 text-red-800',
      'Em Andamento': 'bg-blue-100 text-blue-800'
    };

    return (
      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${colors[status]}`}>
        {status}
      </span>
    );
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(value);
  };

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('pt-BR');
  };

  if (leads.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow-sm p-8 text-center">
        <div className="text-gray-400 mb-4">
          <Calendar className="w-12 h-12 mx-auto mb-4" />
          <p className="text-lg font-medium">Nenhum lead encontrado</p>
          <p className="text-sm">Tente ajustar os filtros ou adicione um novo lead</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-sm overflow-hidden">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200 text-xs">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Cliente
              </th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Contato
              </th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Local
              </th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Perfil
              </th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Projeto
              </th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Valor
              </th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Status
              </th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Acompanhamento
              </th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Data
              </th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Ações
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {leads.map((lead) => (
              <tr 
                key={lead.id} 
                className={`hover:bg-gray-50 transition-colors border-l-4 ${getStatusColor(lead.status)}`}
              >
                <td className="px-3 py-2 whitespace-nowrap">
                  <div>
                    <div className="text-xs font-medium text-gray-900">{lead.name}</div>
                    <div className="text-xs text-gray-500">{lead.contactOrigin}</div>
                  </div>
                </td>
                <td className="px-3 py-2 whitespace-nowrap">
                  <div className="flex flex-col space-y-1">
                    <div className="flex items-center text-xs text-gray-900">
                      <Mail className="w-3 h-3 mr-1 text-gray-400" />
                      <span className="truncate max-w-24">{lead.email}</span>
                    </div>
                    <div className="flex items-center text-xs text-gray-900">
                      <Phone className="w-3 h-3 mr-1 text-gray-400" />
                      {lead.phone}
                    </div>
                  </div>
                </td>
                <td className="px-3 py-2 whitespace-nowrap">
                  <div className="flex items-center text-xs text-gray-900">
                    <MapPin className="w-3 h-3 mr-1 text-gray-400" />
                    {lead.city}
                  </div>
                </td>
                <td className="px-3 py-2 whitespace-nowrap">
                  <div className="text-xs text-gray-900">
                    <div className="flex items-center mb-1">
                      <Briefcase className="w-3 h-3 mr-1 text-gray-400" />
                      <span className="truncate max-w-20">{lead.profession}</span>
                    </div>
                    <div className="flex items-center mb-1">
                      <Users className="w-3 h-3 mr-1 text-gray-400" />
                      <span className="truncate max-w-20">{lead.familyStructure}</span>
                    </div>
                    <div className="text-xs text-gray-500">{lead.ageRange}</div>
                  </div>
                </td>
                <td className="px-3 py-2 whitespace-nowrap">
                  <div className="text-xs text-gray-900">
                    <div className="font-medium">{lead.projectType}</div>
                    <div className="flex items-center text-xs text-gray-500">
                      <Home className="w-3 h-3 mr-1" />
                      {lead.areaM2}m²
                    </div>
                  </div>
                </td>
                <td className="px-3 py-2 whitespace-nowrap">
                  <div className="flex items-center text-xs text-gray-900">
                    <DollarSign className="w-3 h-3 mr-1 text-gray-400" />
                    <span className="truncate max-w-20">{formatCurrency(lead.budgetValue)}</span>
                  </div>
                </td>
                <td className="px-3 py-2 whitespace-nowrap">
                  {getStatusBadge(lead.status)}
                </td>
                <td className="px-3 py-2 whitespace-nowrap">
                  <div className="flex flex-col space-y-1">
                    <div className="flex items-center text-xs">
                      {lead.meetingHeld ? (
                        <CheckCircle className="w-3 h-3 text-green-500 mr-1" />
                      ) : (
                        <XCircle className="w-3 h-3 text-red-500 mr-1" />
                      )}
                      <span className={`text-xs ${lead.meetingHeld ? 'text-green-700' : 'text-red-700'}`}>
                        {lead.meetingHeld ? 'Reunião OK' : 'Reunião Pend.'}
                      </span>
                    </div>
                    <div className="flex items-center text-xs">
                      {lead.proposalSent ? (
                        <CheckCircle className="w-3 h-3 text-green-500 mr-1" />
                      ) : (
                        <XCircle className="w-3 h-3 text-red-500 mr-1" />
                      )}
                      <span className={`text-xs ${lead.proposalSent ? 'text-green-700' : 'text-red-700'}`}>
                        {lead.proposalSent ? 'Proposta OK' : 'Proposta Pend.'}
                      </span>
                    </div>
                  </div>
                </td>
                <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-900">
                  {formatDate(lead.createdAt)}
                </td>
                <td className="px-3 py-2 whitespace-nowrap text-xs font-medium">
                  <div className="flex space-x-1">
                    <button
                      onClick={() => setEditingLead(lead)}
                      className="text-blue-600 hover:text-blue-900 p-1 rounded hover:bg-blue-50 transition-colors"
                    >
                      <Edit2 className="w-3 h-3" />
                    </button>
                    <button
                      onClick={() => onDeleteLead(lead.id)}
                      className="text-red-600 hover:text-red-900 p-1 rounded hover:bg-red-50 transition-colors"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editingLead && (
        <EditLeadModal
          lead={editingLead}
          onClose={() => setEditingLead(null)}
          onSubmit={(updatedLead) => {
            onUpdateLead(updatedLead);
            setEditingLead(null);
          }}
        />
      )}
    </div>
  );
};

export default LeadsTable;