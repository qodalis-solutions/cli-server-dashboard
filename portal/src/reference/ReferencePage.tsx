import { usePortal } from '../PortalContext';

/** The API reference's start page. */
export default function ReferencePage() {
  const { config } = usePortal();
  const api = config.api!;
  return (
    <div className="max-w-3xl">
      <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-heading">{api.title}</h1>
      {api.swagger && (
        <p className="mt-4">
          <a href={api.swagger} className="text-primary hover:underline">Open in Swagger UI</a>
        </p>
      )}
    </div>
  );
}
