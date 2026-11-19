import { useEffect } from 'react';
import { Link } from 'react-router';
import Markdown from '../markdown/Markdown';
import { usePortal, type Reference } from '../PortalContext';
import { ErrorBox, Loading } from '../components/States';
import CodeView from './CodeView';
import type { SecurityScheme } from './openapi';

/** The API reference's start page: the API's description, base URL, authentication and its parts (tags). */
export default function ReferencePage() {
  const { reference } = usePortal();
  if (!reference || reference.status === 'loading') return <Loading />;
  if (reference.status === 'error') return <ErrorBox title="The API reference could not be loaded" error={reference.error} />;
  return <Overview reference={reference.value} />;
}

function Overview({ reference }: { reference: Reference }) {
  const { config } = usePortal();
  const api = config.api!;
  const { doc, tags, serverUrl } = reference;
  const title = doc.info?.title || api.title;
  const schemes = Object.entries(doc.components?.securitySchemes ?? {});

  useEffect(() => {
    document.title = `${api.title} · ${config.name}`;
  }, [api.title, config.name]);

  return (
    <div className="max-w-3xl">
      <p className="text-sm font-medium text-primary">{api.title}</p>
      <h1 className="mt-1 text-3xl sm:text-4xl font-bold tracking-tight text-heading break-words">{title}</h1>
      {doc.info?.version && <p className="mt-2 text-sm text-subtle">Version <span className="font-mono">{doc.info.version}</span></p>}
      {doc.info?.description && <Markdown markdown={doc.info.description} className="mt-6" />}

      <h2 className="mt-12 text-xl font-semibold text-heading">Base URL</h2>
      <p className="mt-2 text-sm text-muted">Every path below is relative to:</p>
      <div className="mt-3 rounded-lg border border-border bg-surface px-4 py-3 overflow-x-auto">
        <code className="font-mono text-sm text-heading">{serverUrl}</code>
      </div>

      <h2 className="mt-12 text-xl font-semibold text-heading">Authentication</h2>
      {schemes.length === 0 ? (
        <p className="mt-2 text-sm text-muted">This API does not describe an authentication scheme.</p>
      ) : (
        <div className="mt-3 space-y-5">
          {schemes.map(([name, scheme]) => <SchemeView key={name} name={name} scheme={scheme} />)}
        </div>
      )}

      <h2 className="mt-12 text-xl font-semibold text-heading">Endpoints</h2>
      <ul className="mt-4 grid gap-3 sm:grid-cols-2">
        {tags.map(group => (
          <li key={group.tag}>
            <Link
              to={`/reference/${encodeURIComponent(group.tag)}`}
              className="group block h-full rounded-xl border border-border bg-surface px-4 py-3 hover:border-primary/60 transition-colors"
            >
              <span className="block font-semibold text-heading group-hover:text-primary">{group.tag}</span>
              {group.description && <span className="mt-1 block text-sm text-muted line-clamp-2">{group.description}</span>}
              <span className="mt-2 block text-xs text-subtle">
                {group.operations.length} {group.operations.length === 1 ? 'operation' : 'operations'}
              </span>
            </Link>
          </li>
        ))}
      </ul>

      <h2 className="mt-12 text-xl font-semibold text-heading">OpenAPI</h2>
      <p className="mt-2 text-sm text-muted">
        The machine-readable description of this API, for client generators and tools:{' '}
        <a href={api.openapi} className="text-primary hover:underline">OpenAPI document</a>
        {api.swagger && (
          <>
            {', or explore it in '}
            <a href={api.swagger} className="text-primary hover:underline">Swagger UI</a>
          </>
        )}
        .
      </p>
    </div>
  );
}

function SchemeView({ name, scheme }: { name: string; scheme: SecurityScheme }) {
  const bearer = scheme.type === 'http' && scheme.scheme?.toLowerCase() === 'bearer';
  const tokenHint = scheme.bearerFormat === 'qcli_pat' ? 'qcli_pat_…' : 'YOUR_TOKEN';
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <p className="text-sm font-semibold text-heading">
        {bearer ? 'Bearer token' : scheme.type ?? 'Scheme'} <span className="ml-1 font-mono text-xs font-normal text-subtle">{name}</span>
      </p>
      {scheme.description && <Markdown markdown={scheme.description} className="mt-1 text-sm text-muted" />}
      {bearer && (
        <>
          <p className="mt-3 text-sm text-muted">Send the token in the <code className="font-mono text-xs">Authorization</code> header of every request:</p>
          <div className="mt-2 qp-samples rounded-lg overflow-hidden border border-border">
            <CodeView code={`Authorization: Bearer ${tokenHint}`} language="http" />
          </div>
        </>
      )}
      {scheme.type === 'apiKey' && scheme.name && (
        <p className="mt-3 text-sm text-muted">
          Send the key in the <code className="font-mono text-xs">{scheme.name}</code> {scheme.in ?? 'header'}.
        </p>
      )}
    </div>
  );
}
