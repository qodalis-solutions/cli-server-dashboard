import type { CommandDescriptor } from '../../types';

/** The command's module: the descriptor's own field, or `metadata.module` (servers before command metadata). */
export function commandModule(cmd: CommandDescriptor): string | undefined {
  if (cmd.module) return cmd.module;
  const legacy = cmd.metadata?.module;
  return typeof legacy === 'string' && legacy ? legacy : undefined;
}

/** Whether a row has anything to expand: documentation, examples, parameters or sub-commands. */
export function hasCommandDetails(cmd: CommandDescriptor): boolean {
  return !!(
    cmd.documentation?.trim() ||
    cmd.examples?.length ||
    cmd.parameters?.length ||
    cmd.processors?.length
  );
}

/** Whether the search text (any case) is in the command's name, aliases, description or module. */
export function matchesCommandSearch(cmd: CommandDescriptor, search: string): boolean {
  const text = search.trim().toLowerCase();
  if (!text) return true;
  return [cmd.command, cmd.description, commandModule(cmd), ...(cmd.aliases ?? [])]
    .some(value => value?.toLowerCase().includes(text));
}

/** Documentation split into paragraphs (blank lines between them), empty ones left out. */
export function documentationParagraphs(documentation: string | undefined): string[] {
  if (!documentation) return [];
  return documentation
    .split(/\r?\n\s*\r?\n/)
    .map(p => p.trim())
    .filter(Boolean);
}

/** A default value as shown in the parameters table (`—` when there is none). */
export function formatDefaultValue(value: unknown): string {
  if (value === undefined || value === null || value === '') return '—';
  return typeof value === 'object' ? JSON.stringify(value) : String(value);
}
