import { useEffect, useRef, useState } from 'react';
import { EXTENSION_SCOPE, type ConfigEditorHandle, type ConfigEditorMount, type ConfigEditorProps, type DashboardExtensionInfo } from '@qodalis/cli-server-dashboard-kit';
import { useExtensionHost } from '../extension/useExtensionHost';
import type { ConfigEditor } from './configEditors';

/** A plugin module's editor in its own element, with the module's context; follows the page's props through `update`. */
function ModuleEditor({ extension, mount, props }: { extension: DashboardExtensionInfo; mount: ConfigEditorMount; props: ConfigEditorProps }) {
  const { context } = useExtensionHost(extension, '/');
  const element = useRef<HTMLDivElement>(null);
  const handle = useRef<ConfigEditorHandle | void>(undefined);
  const latest = useRef(props);
  const [failed, setFailed] = useState<string | null>(null);

  useEffect(() => {
    latest.current = props;
    handle.current?.update(props);
  });

  useEffect(() => {
    const host = element.current;
    if (!host) return;
    let cancelled = false;
    const target = document.createElement('div');
    target.className = EXTENSION_SCOPE;
    host.appendChild(target);
    (async () => {
      try {
        const mounted = await mount(target, latest.current, context);
        if (cancelled) mounted?.unmount?.();
        else handle.current = mounted;
      } catch (err) {
        if (!cancelled) setFailed(err instanceof Error ? err.message : String(err));
      }
    })();
    return () => {
      cancelled = true;
      try {
        handle.current?.unmount?.();
      } catch {
        // a failing editor must not keep the page from leaving
      }
      handle.current = undefined;
      target.remove();
    };
  }, [mount, context]);

  if (failed) return <div role="alert" className="text-xs text-error">{failed}</div>;
  return <div ref={element} data-config-editor={`${extension.id}:${props.entry.editor ?? ''}`} />;
}

/** Renders a custom editor of the Config page, whichever way it was registered. */
export default function ConfigEditorHost({ editor, props }: { editor: ConfigEditor; props: ConfigEditorProps }) {
  if (editor.kind === 'component') {
    const { Component } = editor;
    return <Component {...props} />;
  }
  return <ModuleEditor extension={editor.extension} mount={editor.mount} props={props} />;
}
