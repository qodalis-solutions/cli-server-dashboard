import { useEffect } from 'react';
import { Link, useLocation, useParams } from 'react-router';
import Badge from '@dashboard/components/Badge';
import Markdown from '../markdown/Markdown';
import { usePortal, type Reference } from '../PortalContext';
import { ErrorBox, Loading } from '../components/States';
import NotFoundPage from '../pages/NotFoundPage';
import SampleTabs from './SampleTabs';
import CodeView from './CodeView';
import MethodBadge from './MethodBadge';
import SchemaView from './SchemaView';
import TryIt from './TryIt';
import { pickMediaType, operationId, type Operation, type OpenApiDocument, type ResponseObject } from './openapi';
import { typeLabel } from './typeLabel';

/** The operations of one tag: what each does, its parameters and schemas, code samples and "try it". */
export default function TagPage() {
  const { reference } = usePortal();
  if (!reference || reference.status === 'loading') return <Loading />;
  if (reference.status === 'error') return <ErrorBox title="The API reference could not be loaded" error={reference.error} />;
  return <TagView reference={reference.value} />;
}

function TagView({ reference }: { reference: Reference }) {
  const { tag = '' } = useParams();
  const { hash } = useLocation();
  const { config } = usePortal();
  const group = reference.tags.find(g => g.tag === tag);

  useEffect(() => {
    if (!group) return;
    document.title = `${group.tag} · ${config.api?.title ?? 'API reference'} · ${config.name}`;
    if (hash) document.getElementById(decodeURIComponent(hash.slice(1)))?.scrollIntoView?.({ block: 'start' });
  }, [group, hash, config]);

  if (!group) return <NotFoundPage what="part of the API reference" />;
  return (
    <div className="max-w-[88rem]">
      <p className="text-sm font-medium text-primary">
        <Link to="/reference" className="hover:underline">{config.api?.title ?? 'API reference'}</Link>
      </p>
      <h1 className="mt-1 text-3xl sm:text-4xl font-bold tracking-tight text-heading break-words">{group.tag}</h1>
      {group.description && <Markdown markdown={group.description} className="mt-4 max-w-3xl text-muted" />}
      <div className="mt-6">
        {group.operations.map(op => (
          <OperationView key={`${op.method} ${op.path}`} op={op} reference={reference} />
        ))}
      </div>
    </div>
  );
}

function isPublic(op: Operation, doc: OpenApiDocument): boolean {
  return Array.isArray(op.security) ? op.security.length === 0 : !doc.security?.length;
}

function OperationView({ op, reference }: { op: Operation; reference: Reference }) {
  const id = operationId(op);
  const { doc, serverUrl } = reference;
  const title = op.summary ?? `${op.method.toUpperCase()} ${op.path}`;
  return (
    <section id={id} data-testid={`operation-${id}`} className="scroll-mt-20 py-10 border-t border-border first:border-t-0 first:pt-4">
      <div className="flex flex-wrap items-center gap-2">
        <MethodBadge method={op.method} />
        <code className="font-mono text-sm text-heading break-all">{op.path}</code>
        {op.deprecated && <Badge variant="warning">Deprecated</Badge>}
      </div>
      <h2 className="mt-3 text-2xl font-semibold tracking-tight text-heading">
        <Link to={`#${id}`} className="hover:underline decoration-subtle underline-offset-4">{title}</Link>
      </h2>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {op.permission && (
          <Badge variant="info">
            <span>Permission</span>
            <code className="font-mono">{op.permission}</code>
          </Badge>
        )}
        {op.hostTokenOnly && <Badge variant="neutral">Host token</Badge>}
        {isPublic(op, doc) && <Badge variant="success">No token needed</Badge>}
      </div>
      {op.description && <Markdown markdown={op.description} className="mt-4 max-w-3xl" />}

      <div className="mt-8 grid gap-10 min-[1400px]:grid-cols-2">
        <div className="min-w-0 space-y-8">
          <ParametersTable op={op} doc={doc} />
          {op.requestBody && (
            <div>
              <h3 className="text-base font-semibold text-heading">Request body</h3>
              <p className="mt-1 text-xs text-subtle font-mono">
                {op.bodyMediaType}
                {op.requestBody.required && <span className="ml-2 font-sans font-medium text-warning">required</span>}
              </p>
              {op.requestBody.description && <Markdown markdown={op.requestBody.description} className="mt-2 text-sm" />}
              <div className="mt-3">
                <SchemaView doc={doc} schema={op.bodyMediaType ? op.requestBody.content[op.bodyMediaType]?.schema : undefined} />
              </div>
            </div>
          )}
          <Responses op={op} doc={doc} />
        </div>
        <div className="min-w-0 space-y-6 min-[1400px]:sticky min-[1400px]:top-20 self-start">
          <SampleTabs operation={op} serverUrl={serverUrl} />
          {op.responseExample && (
            <div className="rounded-xl border border-border overflow-hidden bg-surface">
              <p className="px-4 py-2 text-xs font-medium text-muted border-b border-border">Response example</p>
              <div className="qp-samples">
                <CodeView code={op.responseExample} language="json" />
              </div>
            </div>
          )}
          <TryIt operation={op} serverUrl={serverUrl} />
        </div>
      </div>
    </section>
  );
}

function ParametersTable({ op, doc }: { op: Operation; doc: OpenApiDocument }) {
  if (op.parameters.length === 0) return null;
  return (
    <div>
      <h3 className="text-base font-semibold text-heading">Parameters</h3>
      <div className="qp-table mt-3">
        <table aria-label="Parameters">
          <thead>
            <tr>
              <th scope="col">Name</th>
              <th scope="col">In</th>
              <th scope="col">Type</th>
              <th scope="col">Description</th>
            </tr>
          </thead>
          <tbody>
            {op.parameters.map(p => (
              <tr key={`${p.in}:${p.name}`}>
                <td>
                  <code className="font-mono text-sm font-semibold text-heading break-words">{p.name}</code>
                  {p.required && <span className="block text-[11px] font-medium text-warning">required</span>}
                  {p.deprecated && <span className="block text-[11px] font-medium text-error">deprecated</span>}
                </td>
                <td className="text-muted">{p.in}</td>
                <td className="font-mono text-xs text-muted whitespace-nowrap">{typeLabel(doc, p.schema)}</td>
                <td>
                  {p.description && <Markdown markdown={p.description} className="text-sm" />}
                  {p.example !== undefined && (
                    <span className="block mt-1 text-xs text-subtle">
                      Example: <code className="font-mono">{typeof p.example === 'string' ? p.example : JSON.stringify(p.example)}</code>
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function statusColor(status: string): string {
  if (status.startsWith('2')) return 'text-success';
  if (status.startsWith('3')) return 'text-info';
  if (status.startsWith('4')) return 'text-warning';
  if (status.startsWith('5')) return 'text-error';
  return 'text-muted';
}

function Responses({ op, doc }: { op: Operation; doc: OpenApiDocument }) {
  const entries = Object.entries(op.responses);
  if (entries.length === 0) return null;
  return (
    <div>
      <h3 className="text-base font-semibold text-heading">Responses</h3>
      <ul className="mt-3 rounded-lg border border-border divide-y divide-border">
        {entries.map(([status, response]) => (
          <ResponseRow key={status} status={status} response={response} doc={doc} />
        ))}
      </ul>
    </div>
  );
}

function ResponseRow({ status, response, doc }: { status: string; response: ResponseObject; doc: OpenApiDocument }) {
  const type = pickMediaType(response.content);
  const schema = type ? response.content![type]?.schema : undefined;
  const head = (
    <span className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
      <span className={`font-mono text-sm font-semibold ${statusColor(status)}`}>{status}</span>
      {response.description && <Markdown markdown={response.description} className="text-sm [&_p]:my-0" />}
      {type && <span className="font-mono text-[11px] text-subtle">{type}</span>}
    </span>
  );
  if (!schema) return <li className="px-4 py-3">{head}</li>;
  return (
    <li>
      <details className="group" open={status.startsWith('2')}>
        <summary className="flex cursor-pointer select-none list-none items-start gap-2 px-4 py-3 hover:bg-control">
          <span aria-hidden className="mt-0.5 text-muted transition-transform group-open:rotate-90">›</span>
          {head}
        </summary>
        <div className="px-4 pb-4">
          <SchemaView doc={doc} schema={schema} />
        </div>
      </details>
    </li>
  );
}
