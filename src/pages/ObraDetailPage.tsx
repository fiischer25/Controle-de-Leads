import { useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Camera, FileText, Pencil, Printer, Trash2 } from 'lucide-react';
import { useData } from '../context/DataContext';
import { useToast } from '../context/ToastContext';
import { FilesSection } from '../components/files/FilesSection';
import { ObraFormModal } from '../components/obras/ObraFormModal';
import { ObraApprovals } from '../components/obras/ObraApprovals';
import { ObraIssues } from '../components/obras/ObraIssues';
import { ObraOverview } from '../components/obras/ObraOverview';
import { ObraPayments } from '../components/obras/ObraPayments';
import { ObraSchedule } from '../components/obras/ObraSchedule';
import { ObraPhotos, ObraVisits, VisitModal } from '../components/obras/ObraVisits';
import { useObraActions } from '../components/obras/useObraActions';
import { useObraSummaries } from '../components/obras/useObraSummaries';
import { OBRA_STATUS, OBRA_STATUS_ORDER } from '../lib/obras';
import { TONE_BADGE, TONE_DOT } from '../lib/status';
import type { ObraStatus } from '../lib/types';
import { cn } from '../lib/utils';
import { BackLink, Button, ConfirmDialog, EmptyState, IconButton, Listbox, PageHeader, Tabs } from '../components/ui';

export type ObraTab = 'geral' | 'cronograma' | 'visitas' | 'fotos' | 'pagamentos' | 'aprovacoes' | 'pendencias' | 'documentos';
const TABS: ObraTab[] = ['geral', 'cronograma', 'visitas', 'fotos', 'pagamentos', 'aprovacoes', 'pendencias', 'documentos'];

export default function ObraDetailPage() {
  const { id } = useParams();
  const { maps, isAdmin, patch, can } = useData();
  const summary = useObraSummaries().find((s) => s.obra.id === id);
  const { updateObra, deleteObra } = useObraActions();
  const toast = useToast();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const tab: ObraTab = TABS.includes(params.get('aba') as ObraTab) ? (params.get('aba') as ObraTab) : 'geral';
  const setTab = (t: ObraTab) => setParams(t === 'geral' ? {} : { aba: t }, { replace: true });
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [visiting, setVisiting] = useState(false);

  if (!summary) {
    return (
      <div>
        <BackLink to="/obras">Obras</BackLink>
        <EmptyState title="Obra não encontrada" description="Ela pode ter sido excluída." className="py-20" />
      </div>
    );
  }
  const { obra } = summary;
  const st = OBRA_STATUS[obra.status];
  const manager = obra.manager_id ? maps.profiles[obra.manager_id] : null;
  const project = obra.project_id ? maps.projects[obra.project_id] : null;

  return (
    <div>
      <BackLink to="/obras">Obras</BackLink>
      <PageHeader
        className="md:pt-4"
        eyebrow={[obra.code, obra.city].filter(Boolean).join(' · ')}
        title={obra.name}
        description={
          <>
            {obra.client_name || 'Sem cliente'}
            {manager && <> · responsável {manager.name}</>}
            {project && can('projetos') && (
              <>
                {' · '}
                <Link to={`/projetos/${project.id}`} className="hover:text-ink hover:underline hover:underline-offset-4">
                  projeto {project.name}
                </Link>
              </>
            )}
          </>
        }
        actions={
          <>
            <div className="w-44">
              <Listbox
                value={obra.status}
                onChange={(v) => updateObra(obra, { status: v as ObraStatus }).catch(toast.error)}
                options={OBRA_STATUS_ORDER.map((s) => ({
                  value: s,
                  label: OBRA_STATUS[s].label,
                  icon: <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', TONE_DOT[OBRA_STATUS[s].tone])} />,
                }))}
                aria-label="Status da obra"
                className={cn('border-transparent font-medium', TONE_BADGE[st.tone])}
              />
            </div>
            <IconButton label="Editar obra" onClick={() => setEditing(true)}>
              <Pencil className="h-4 w-4" strokeWidth={1.6} />
            </IconButton>
            {isAdmin && (
              <IconButton label="Excluir obra" onClick={() => setDeleting(true)} className="hover:text-danger-fg">
                <Trash2 className="h-4 w-4" strokeWidth={1.6} />
              </IconButton>
            )}
            <Button icon={<Printer className="h-4 w-4" strokeWidth={1.6} />} onClick={() => navigate(`/obras/${obra.id}/relatorio`)}>
              Relatório
            </Button>
            <Button variant="primary" icon={<Camera className="h-4 w-4" strokeWidth={1.6} />} onClick={() => setVisiting(true)}>
              Registrar visita
            </Button>
          </>
        }
      />

      <Tabs<ObraTab>
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'geral', label: 'Visão geral' },
          { id: 'cronograma', label: 'Cronograma', count: summary.stages.length },
          { id: 'visitas', label: 'Visitas', count: summary.visits.length },
          { id: 'fotos', label: 'Fotos', count: summary.photos },
          { id: 'pagamentos', label: 'Pagamentos', count: summary.payments.length },
          { id: 'aprovacoes', label: 'Aprovações', count: summary.pendingApprovals || undefined },
          { id: 'pendencias', label: 'Pendências', count: summary.openIssues || undefined },
          { id: 'documentos', label: 'Documentos', count: obra.attachments.length || undefined },
        ]}
      />

      <div className="mt-8">
        {tab === 'geral' && <ObraOverview summary={summary} onTab={setTab} onVisit={() => setVisiting(true)} />}
        {tab === 'cronograma' && <ObraSchedule summary={summary} />}
        {tab === 'visitas' && <ObraVisits summary={summary} onNew={() => setVisiting(true)} />}
        {tab === 'fotos' && <ObraPhotos summary={summary} onNew={() => setVisiting(true)} />}
        {tab === 'pagamentos' && <ObraPayments summary={summary} />}
        {tab === 'aprovacoes' && <ObraApprovals summary={summary} />}
        {tab === 'pendencias' && <ObraIssues summary={summary} />}
        {tab === 'documentos' && (
          <FilesSection
            id="obra-docs"
            title="Documentos da obra"
            files={obra.attachments}
            folder={`obras/${obra.id}/docs`}
            onChange={(next) => patch('obras', obra.id, { attachments: next })}
            canRemove={() => true}
            empty="Contrato, ART/RRT, alvará, projetos aprovados, memoriais, notas…"
            inputLabel="Anexar documentos da obra"
            heading={(action) => (
              <div className="mb-4 flex items-center justify-between gap-3">
                <h2 className="flex items-center gap-2 font-display text-[16px] font-semibold text-ink">
                  <FileText className="h-4 w-4 text-faint" strokeWidth={1.6} />
                  Documentos da obra
                </h2>
                {action}
              </div>
            )}
          />
        )}
      </div>

      {editing && <ObraFormModal obra={obra} onClose={() => setEditing(false)} />}
      {visiting && <VisitModal summary={summary} onClose={() => setVisiting(false)} onSaved={() => tab !== 'visitas' && tab !== 'geral' && setTab('visitas')} />}
      {deleting && (
        <ConfirmDialog
          title="Excluir obra?"
          message={`${obra.code} · ${obra.name}. Saem também o cronograma, as visitas com fotos, os pagamentos, as aprovações e as pendências. Não dá para desfazer.`}
          confirmLabel="Excluir obra"
          danger
          onConfirm={async () => {
            try {
              await deleteObra(obra);
              toast.success('Obra excluída.');
              navigate('/obras');
            } catch (e) {
              toast.error(e);
            }
          }}
          onClose={() => setDeleting(false)}
        />
      )}
    </div>
  );
}
