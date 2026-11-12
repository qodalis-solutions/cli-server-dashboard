/**
 * The SQL editor of the data explorer (CodeMirror 6). Loaded on demand (`React.lazy`) so CodeMirror stays out of the
 * main bundle; colors come from the dashboard's theme variables, so it follows the light/dark scheme by itself.
 */
import { useEffect, useLayoutEffect, useRef } from 'react';
import { Compartment, EditorState, Prec } from '@codemirror/state';
import {
  EditorView, drawSelection, highlightActiveLine, highlightActiveLineGutter, highlightSpecialChars, keymap, lineNumbers,
  placeholder as placeholderExt,
} from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { HighlightStyle, bracketMatching, indentOnInput, syntaxHighlighting } from '@codemirror/language';
import { autocompletion, closeBrackets, closeBracketsKeymap, completionKeymap } from '@codemirror/autocomplete';
import { MSSQL, MySQL, PostgreSQL, SQLite, StandardSQL, sql, type SQLDialect, type SQLNamespace } from '@codemirror/lang-sql';
import { tags } from '@lezer/highlight';
import type { SqlDialectName, SqlNamespace } from './sqlDialect';

export interface SqlEditorProps {
  value: string;
  onChange: (value: string) => void;
  /** Ctrl+Enter / ⌘+Enter. */
  onRun: () => void;
  dialect: SqlDialectName;
  /** Tables and columns for completion ({@link toCompletionSchema}). */
  schema?: Record<string, SqlNamespace>;
  placeholder?: string;
  ariaLabel: string;
}

const DIALECTS: Record<SqlDialectName, SQLDialect> = {
  postgresql: PostgreSQL, mysql: MySQL, sqlite: SQLite, mssql: MSSQL, standard: StandardSQL,
};

const v = (token: string) => `var(--qcli-${token})`;

const theme = EditorView.theme({
  '&': { color: v('text'), backgroundColor: v('control'), borderRadius: '0.5rem', border: `1px solid ${v('border')}`, fontSize: '0.75rem' },
  '&.cm-focused': { outline: 'none', borderColor: `color-mix(in srgb, ${v('primary')} 50%, transparent)` },
  '.cm-scroller': { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace', lineHeight: '1.6', minHeight: '9rem', maxHeight: '50vh' },
  '.cm-content': { padding: '0.5rem 0', caretColor: v('heading') },
  '.cm-cursor, .cm-dropCursor': { borderLeftColor: v('heading') },
  '.cm-gutters': { backgroundColor: 'transparent', color: v('subtle'), border: 'none', borderRight: `1px solid color-mix(in srgb, ${v('border')} 75%, transparent)` },
  '.cm-activeLine': { backgroundColor: `color-mix(in srgb, ${v('controlHover')} 60%, transparent)` },
  '.cm-activeLineGutter': { backgroundColor: 'transparent', color: v('muted') },
  '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, ::selection': {
    backgroundColor: `color-mix(in srgb, ${v('primary')} 30%, transparent) !important`,
  },
  '.cm-matchingBracket': { backgroundColor: `color-mix(in srgb, ${v('accent')} 25%, transparent)`, outline: 'none' },
  '.cm-placeholder': { color: v('subtle') },
  '.cm-tooltip': { backgroundColor: v('popover'), color: v('text'), border: `1px solid ${v('border')}`, borderRadius: '0.5rem', overflow: 'hidden' },
  '.cm-tooltip-autocomplete > ul': { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace', maxHeight: '14rem' },
  '.cm-tooltip-autocomplete > ul > li': { padding: '0.15rem 0.5rem !important' },
  '.cm-tooltip-autocomplete > ul > li[aria-selected]': { backgroundColor: `color-mix(in srgb, ${v('primary')} 25%, transparent)`, color: v('heading') },
  '.cm-completionDetail': { color: v('subtle'), fontStyle: 'normal', marginLeft: '0.75rem' },
  '.cm-completionMatchedText': { color: v('accent'), textDecoration: 'none' },
});

const highlight = HighlightStyle.define([
  { tag: [tags.keyword, tags.operatorKeyword, tags.modifier], color: v('primary'), fontWeight: '600' },
  { tag: [tags.string, tags.special(tags.string)], color: v('success') },
  { tag: [tags.number, tags.bool, tags.null], color: v('warning') },
  { tag: [tags.comment, tags.lineComment, tags.blockComment], color: v('subtle'), fontStyle: 'italic' },
  { tag: [tags.typeName, tags.standard(tags.name)], color: v('info') },
  { tag: [tags.special(tags.name), tags.quote], color: v('accent') },
  { tag: [tags.operator, tags.punctuation, tags.bracket], color: v('muted') },
]);

function language(dialect: SqlDialectName, schema: Record<string, SqlNamespace> | undefined) {
  return sql({ dialect: DIALECTS[dialect], schema: schema as SQLNamespace | undefined, upperCaseKeywords: true });
}

export default function SqlEditor({ value, onChange, onRun, dialect, schema, placeholder, ariaLabel }: SqlEditorProps) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const languageConf = useRef(new Compartment());
  const placeholderConf = useRef(new Compartment());
  // Latest callbacks, read by the extensions created once
  const callbacks = useRef({ onChange, onRun });
  useLayoutEffect(() => {
    callbacks.current = { onChange, onRun };
  });

  useEffect(() => {
    const run = () => {
      callbacks.current.onRun();
      return true;
    };
    const editor = new EditorView({
      parent: host.current!,
      state: EditorState.create({
        doc: value,
        extensions: [
          lineNumbers(),
          highlightActiveLineGutter(),
          highlightSpecialChars(),
          history(),
          drawSelection(),
          indentOnInput(),
          bracketMatching(),
          closeBrackets(),
          autocompletion({ icons: false }),
          highlightActiveLine(),
          EditorView.lineWrapping,
          Prec.highest(keymap.of([{ key: 'Mod-Enter', run, preventDefault: true }])),
          keymap.of([...closeBracketsKeymap, ...defaultKeymap, ...historyKeymap, ...completionKeymap, indentWithTab]),
          syntaxHighlighting(highlight),
          theme,
          languageConf.current.of(language(dialect, schema)),
          placeholderConf.current.of(placeholder ? placeholderExt(placeholder) : []),
          EditorView.contentAttributes.of({
            'aria-label': ariaLabel, 'aria-multiline': 'true', role: 'textbox',
            autocapitalize: 'off', autocorrect: 'off', spellcheck: 'false', enterkeyhint: 'enter',
          }),
          EditorView.updateListener.of(update => {
            if (update.docChanged) callbacks.current.onChange(update.state.doc.toString());
          }),
        ],
      }),
    });
    view.current = editor;
    return () => {
      editor.destroy();
      view.current = null;
    };
    // Created once; later prop changes are applied by the effects below
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A value set from outside (template, "Query this table", another source's query)
  useEffect(() => {
    const editor = view.current;
    if (!editor) return;
    const current = editor.state.doc.toString();
    if (current !== value) editor.dispatch({ changes: { from: 0, to: current.length, insert: value } });
  }, [value]);

  useEffect(() => {
    view.current?.dispatch({ effects: languageConf.current.reconfigure(language(dialect, schema)) });
  }, [dialect, schema]);

  useEffect(() => {
    view.current?.dispatch({ effects: placeholderConf.current.reconfigure(placeholder ? placeholderExt(placeholder) : []) });
  }, [placeholder]);

  return <div ref={host} className="qcli-sql-editor min-w-0" data-dialect={dialect} />;
}
