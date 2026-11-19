import { isJsonType, type Operation } from './openapi';

/**
 * Code samples generated from an operation, in seven languages. Every sample carries the placeholder `YOUR_TOKEN`,
 * never a token the reader pasted into "try it". A host's own `x-codeSamples` replace the generated sample of their
 * language and add tabs for other languages.
 */

export type SampleLang = 'curl' | 'javascript' | 'python' | 'csharp' | 'php' | 'go' | 'java';

export const SAMPLE_LANGS: { lang: SampleLang; label: string }[] = [
  { lang: 'curl', label: 'cURL' },
  { lang: 'javascript', label: 'JavaScript' },
  { lang: 'python', label: 'Python' },
  { lang: 'csharp', label: 'C#' },
  { lang: 'php', label: 'PHP' },
  { lang: 'go', label: 'Go' },
  { lang: 'java', label: 'Java' },
];

/** The highlight.js language of each sample's code. */
export const SAMPLE_HIGHLIGHT: Record<SampleLang, string> = {
  curl: 'bash', javascript: 'javascript', python: 'python', csharp: 'csharp', php: 'php', go: 'go', java: 'java',
};

export interface SampleRequest {
  method: string;
  /** The server URL and the path with example path parameters, query appended. */
  url: string;
  /** `Authorization: Bearer YOUR_TOKEN`, plus `Content-Type` for a body. */
  headers: Record<string, string>;
  /** Pretty JSON (from the schema's example / examples / generated from the schema). */
  body?: string;
  /** False when the success response is not JSON: the Python sample prints the text instead of parsing it. */
  responseJson?: boolean;
}

export const TOKEN_PLACEHOLDER = 'YOUR_TOKEN';

const ALIASES: Record<string, SampleLang> = {
  curl: 'curl', shell: 'curl', bash: 'curl', sh: 'curl',
  javascript: 'javascript', js: 'javascript', node: 'javascript',
  python: 'python',
  csharp: 'csharp', 'c#': 'csharp', cs: 'csharp', dotnet: 'csharp',
  php: 'php',
  go: 'go', golang: 'go',
  java: 'java',
};

/** The generated language a host sample's `lang` stands for (case-insensitive, with the usual aliases). */
export function sampleLangOf(lang: string): SampleLang | undefined {
  return ALIASES[lang.trim().toLowerCase()];
}

/** The request the samples show: example path and query parameters, the token placeholder, the example body. */
export function sampleRequest(op: Operation, serverUrl: string): SampleRequest {
  const value = (name: string, where: string) => op.parameters.find(p => p.name === name && p.in === where)?.example;
  const path = op.path.replace(/\{([^}]+)\}/g, (match, name: string) => {
    const example = value(name, 'path');
    return example === undefined || example === null ? match : encodeURIComponent(String(example));
  });
  const query = op.parameters
    .filter(p => p.in === 'query' && p.example !== undefined && p.example !== null)
    .flatMap(p => (Array.isArray(p.example) ? p.example : [p.example]).map(v => `${encodeURIComponent(p.name)}=${encodeURIComponent(String(v))}`));
  const headers: Record<string, string> = { Authorization: `Bearer ${TOKEN_PLACEHOLDER}` };
  for (const p of op.parameters) {
    if (p.in === 'header' && p.example !== undefined && p.name.toLowerCase() !== 'authorization') headers[p.name] = String(p.example);
  }
  const body = op.bodyExample;
  if (body !== undefined) headers['Content-Type'] = op.bodyMediaType ?? 'application/json';
  return {
    method: op.method.toUpperCase(),
    url: `${serverUrl.replace(/\/+$/, '')}${path}${query.length ? `?${query.join('&')}` : ''}`,
    headers,
    ...(body !== undefined ? { body } : {}),
    ...(op.successJson ? {} : { responseJson: false }),
  };
}

/** The tabs of an operation: the seven generated samples (each replaced by the host's own of that language), then the host's other languages. */
export function samplesFor(op: Operation, serverUrl: string): { lang: string; label: string; source: string }[] {
  const req = sampleRequest(op, serverUrl);
  const samples: { lang: string; label: string; source: string }[] = SAMPLE_LANGS.map(({ lang, label }) => ({
    lang, label, source: generateSample(lang, req),
  }));
  const replaced = new Set<string>();
  for (const own of op.codeSamples) {
    const lang = sampleLangOf(own.lang);
    if (lang && !replaced.has(lang)) {
      replaced.add(lang);
      const at = samples.findIndex(s => s.lang === lang);
      samples[at] = { lang, label: own.label ?? samples[at].label, source: own.source };
    } else {
      samples.push({ lang: own.lang, label: own.label ?? own.lang, source: own.source });
    }
  }
  return samples;
}

// ── String literals per language ────────────────────────────────────────────────

/** A shell word in single quotes (`'` closes, escapes and reopens). */
const shellQuote = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`;
/** A JavaScript or PHP single-quoted string. */
const singleQuote = (s: string) =>
  `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029')}'`;
/** A double-quoted string valid in Python, C#, Go and Java (JSON's escapes are a subset of theirs). */
const doubleQuote = (s: string) => JSON.stringify(s);
/** PHP single quotes: only `\\` and `\'` are escapes. */
const phpQuote = (s: string) => `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;

const indent = (text: string, prefix: string) => text.split('\n').map(line => (line ? prefix + line : line)).join('\n');

/** The body as a JSON value, when it is declared JSON and parses; otherwise it is sent as written. */
function jsonBody(req: SampleRequest): { ok: true; value: unknown } | { ok: false } {
  const type = header(req.headers, 'Content-Type');
  return req.body !== undefined && (type === undefined || isJsonType(type)) ? parseJson(req.body) : { ok: false };
}

function parseJson(body: string): { ok: true; value: unknown } | { ok: false } {
  try {
    return { ok: true, value: JSON.parse(body) };
  } catch {
    return { ok: false };
  }
}

/** A JSON value as a Python literal (`True`, `False`, `None`), indented like JSON.stringify(…, 2) but 4 spaces. */
function pythonLiteral(value: unknown, level = 0): string {
  const pad = '    '.repeat(level + 1);
  const end = '    '.repeat(level);
  if (value === null) return 'None';
  if (value === true) return 'True';
  if (value === false) return 'False';
  if (typeof value === 'number') return String(value);
  if (typeof value === 'string') return JSON.stringify(value);
  if (Array.isArray(value)) {
    if (!value.length) return '[]';
    return `[\n${value.map(v => pad + pythonLiteral(v, level + 1)).join(',\n')}\n${end}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>);
  if (!entries.length) return '{}';
  return `{\n${entries.map(([k, v]) => `${pad}${JSON.stringify(k)}: ${pythonLiteral(v, level + 1)}`).join(',\n')}\n${end}}`;
}

const otherHeaders = (headers: Record<string, string>) =>
  Object.entries(headers).filter(([name]) => !/^(authorization|content-type)$/i.test(name));
const header = (headers: Record<string, string>, name: string) =>
  Object.entries(headers).find(([key]) => key.toLowerCase() === name.toLowerCase())?.[1];

// ── Generators ──────────────────────────────────────────────────────────────────

function curl(req: SampleRequest): string {
  // HEAD with -X waits for a body that never comes; -I sends a HEAD and prints the headers
  const lines = [req.method === 'HEAD' ? `curl -I ${shellQuote(req.url)}` : `curl -X ${req.method} ${shellQuote(req.url)}`];
  for (const [name, value] of Object.entries(req.headers)) lines.push(`  -H ${shellQuote(`${name}: ${value}`)}`);
  if (req.body !== undefined) lines.push(`  -d ${shellQuote(req.body)}`);
  return lines.join(' \\\n');
}

function javascript(req: SampleRequest): string {
  const key = (name: string) => (/^[A-Za-z_$][\w$]*$/.test(name) ? name : singleQuote(name));
  const lines = [
    `const response = await fetch(${singleQuote(req.url)}, {`,
    `  method: ${singleQuote(req.method)},`,
    '  headers: {',
    ...Object.entries(req.headers).map(([name, value]) => `    ${key(name)}: ${singleQuote(value)},`),
    '  },',
  ];
  if (req.body !== undefined) {
    const json = jsonBody(req);
    lines.push(json.ok
      ? `  body: JSON.stringify(${indent(JSON.stringify(json.value, null, 2), '  ').trimStart()}),`
      : `  body: ${singleQuote(req.body)},`);
  }
  lines.push('});', 'const data = await response.json();', 'console.log(response.status, data);');
  return lines.join('\n');
}

function python(req: SampleRequest): string {
  const lines = [
    'import requests',
    '',
    'response = requests.request(',
    `    ${doubleQuote(req.method)},`,
    `    ${doubleQuote(req.url)},`,
    '    headers={',
    ...Object.entries(req.headers).map(([name, value]) => `        ${doubleQuote(name)}: ${doubleQuote(value)},`),
    '    },',
  ];
  if (req.body !== undefined) {
    const json = jsonBody(req);
    lines.push(json.ok ? `    json=${pythonLiteral(json.value, 1)},` : `    data=${doubleQuote(req.body)},`);
  }
  lines.push(')', req.responseJson === false ? 'print(response.status_code, response.text)' : 'print(response.status_code, response.json())');
  return lines.join('\n');
}

const CSHARP_METHODS: Record<string, string> = {
  GET: 'Get', POST: 'Post', PUT: 'Put', DELETE: 'Delete', PATCH: 'Patch', HEAD: 'Head', OPTIONS: 'Options', TRACE: 'Trace',
};

function csharp(req: SampleRequest): string {
  const auth = header(req.headers, 'Authorization');
  const [scheme, ...rest] = (auth ?? '').split(' ');
  const method = CSHARP_METHODS[req.method] ? `HttpMethod.${CSHARP_METHODS[req.method]}` : `new HttpMethod(${doubleQuote(req.method)})`;
  const lines = ['using System.Net.Http.Headers;'];
  if (req.body !== undefined) lines.push('using System.Text;');
  lines.push('', 'using var client = new HttpClient();');
  if (auth) {
    lines.push(`client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue(${doubleQuote(scheme)}, ${doubleQuote(rest.join(' '))});`);
  }
  lines.push('', `var request = new HttpRequestMessage(${method}, ${doubleQuote(req.url)});`);
  for (const [name, value] of otherHeaders(req.headers)) lines.push(`request.Headers.Add(${doubleQuote(name)}, ${doubleQuote(value)});`);
  if (req.body !== undefined) {
    const type = doubleQuote(header(req.headers, 'Content-Type') ?? 'application/json');
    // A raw string literal keeps the JSON readable; a body that contains """ falls back to an escaped string
    const literal = req.body.includes('"""')
      ? doubleQuote(req.body)
      : `"""\n${indent(req.body, '    ')}\n    """`;
    lines.push(`request.Content = new StringContent(${literal}, Encoding.UTF8, ${type}); // Content-Type: ${type.slice(1, -1)}`);
  }
  lines.push(
    '',
    'using var response = await client.SendAsync(request);',
    'Console.WriteLine($"{(int)response.StatusCode} {await response.Content.ReadAsStringAsync()}");',
  );
  return lines.join('\n');
}

function php(req: SampleRequest): string {
  const lines = [
    '<?php',
    '$curl = curl_init();',
    'curl_setopt_array($curl, [',
    `    CURLOPT_URL => ${phpQuote(req.url)},`,
    `    CURLOPT_CUSTOMREQUEST => ${phpQuote(req.method)},`,
    '    CURLOPT_RETURNTRANSFER => true,',
    '    CURLOPT_HTTPHEADER => [',
    ...Object.entries(req.headers).map(([name, value]) => `        ${phpQuote(`${name}: ${value}`)},`),
    '    ],',
  ];
  if (req.body !== undefined) lines.push(`    CURLOPT_POSTFIELDS => ${phpQuote(req.body)},`);
  lines.push(
    ']);',
    '$response = curl_exec($curl);',
    '$status = curl_getinfo($curl, CURLINFO_HTTP_CODE);',
    'curl_close($curl);',
    'echo $status . \' \' . $response;',
  );
  return lines.join('\n');
}

/** A Go raw string; backticks (which cannot appear in one) are spliced in as "`". */
const goRaw = (s: string) => `\`${s.replace(/`/g, '` + "`" + `')}\``;

function go(req: SampleRequest): string {
  const hasBody = req.body !== undefined;
  const lines = [
    'package main',
    '',
    'import (',
    '\t"fmt"',
    '\t"io"',
    '\t"net/http"',
    ...(hasBody ? ['\t"strings"'] : []),
    ')',
    '',
    'func main() {',
  ];
  if (hasBody) lines.push(`\tbody := strings.NewReader(${goRaw(req.body!)})`);
  lines.push(
    `\treq, err := http.NewRequest(${doubleQuote(req.method)}, ${doubleQuote(req.url)}, ${hasBody ? 'body' : 'nil'})`,
    '\tif err != nil {',
    '\t\tpanic(err)',
    '\t}',
    ...Object.entries(req.headers).map(([name, value]) => `\treq.Header.Set(${doubleQuote(name)}, ${doubleQuote(value)})`),
    '',
    '\tres, err := http.DefaultClient.Do(req)',
    '\tif err != nil {',
    '\t\tpanic(err)',
    '\t}',
    '\tdefer res.Body.Close()',
    '\tdata, _ := io.ReadAll(res.Body)',
    '\tfmt.Println(res.Status, string(data))',
    '}',
  );
  return lines.join('\n');
}

/**
 * A Java text block, the closing delimiter right after the last line (no trailing newline). Backslashes are doubled,
 * then every `"` is escaped: no run of quotes (`""""`, a quote before the delimiter) can close the block early.
 */
const javaTextBlock = (s: string, pad: string) =>
  `"""\n${indent(s.replace(/\\/g, '\\\\').replace(/"/g, '\\"'), pad)}"""`;

function java(req: SampleRequest): string {
  const publisher = req.body !== undefined
    ? `HttpRequest.BodyPublishers.ofString(${javaTextBlock(req.body, '        ')})`
    : 'HttpRequest.BodyPublishers.noBody()';
  return [
    'import java.net.URI;',
    'import java.net.http.HttpClient;',
    'import java.net.http.HttpRequest;',
    'import java.net.http.HttpResponse;',
    '',
    'HttpClient client = HttpClient.newHttpClient();',
    `HttpRequest request = HttpRequest.newBuilder(URI.create(${doubleQuote(req.url)}))`,
    ...Object.entries(req.headers).map(([name, value]) => `    .header(${doubleQuote(name)}, ${doubleQuote(value)})`),
    `    .method(${doubleQuote(req.method)}, ${publisher})`,
    '    .build();',
    'HttpResponse<String> response = client.send(request, HttpResponse.BodyHandlers.ofString());',
    'System.out.println(response.statusCode() + " " + response.body());',
  ].join('\n');
}

const GENERATORS: Record<SampleLang, (req: SampleRequest) => string> = { curl, javascript, python, csharp, php, go, java };

export function generateSample(lang: SampleLang, req: SampleRequest): string {
  return GENERATORS[lang](req);
}
