import { describe, expect, it } from 'vitest';
import { SAMPLE_LANGS, generateSample, samplesFor, type SampleRequest } from './codeSamples';
import { groupByTag, type Operation } from './openapi';
import { OPENAPI } from '../test/fixtures';

const GET: SampleRequest = {
  method: 'GET',
  url: 'https://api.example.com/v1/rates/md?currency=EUR',
  headers: { Authorization: 'Bearer YOUR_TOKEN' },
};

const POST: SampleRequest = {
  method: 'POST',
  url: 'https://api.example.com/v1/alerts',
  headers: { Authorization: 'Bearer YOUR_TOKEN', 'Content-Type': 'application/json' },
  body: '{\n  "a": 1\n}',
};

function operation(path: string, method: string): Operation {
  const op = groupByTag(OPENAPI).flatMap(t => t.operations).find(o => o.path === path && o.method === method);
  if (!op) throw new Error(`no ${method} ${path}`);
  return op;
}

describe('generateSample', () => {
  it('lists the seven languages in order', () => {
    expect(SAMPLE_LANGS.map(l => l.lang)).toEqual(['curl', 'javascript', 'python', 'csharp', 'php', 'go', 'java']);
    expect(SAMPLE_LANGS.map(l => l.label)).toEqual(['cURL', 'JavaScript', 'Python', 'C#', 'PHP', 'Go', 'Java']);
  });

  it.each(SAMPLE_LANGS)('$label: a GET carries the method, the full URL and YOUR_TOKEN', ({ lang }) => {
    const source = generateSample(lang, GET);
    expect(source).toMatch(/GET|Get/);
    expect(source).toContain('https://api.example.com/v1/rates/md?currency=EUR');
    expect(source).toContain('YOUR_TOKEN');
  });

  it.each(SAMPLE_LANGS)('$label: a POST carries the JSON body and a Content-Type: application/json header', ({ lang }) => {
    const source = generateSample(lang, POST);
    expect(source).toMatch(/POST|Post/);
    // Java's text block escapes every quote
    expect(source).toContain(lang === 'java' ? '\\"a\\": 1' : '"a": 1');
    expect(source).toMatch(/Content-?Type/);
    expect(source).toContain('application/json');
  });

  it('cURL', () => {
    expect(generateSample('curl', GET)).toMatchInlineSnapshot(`
      "curl -X GET 'https://api.example.com/v1/rates/md?currency=EUR' \\
        -H 'Authorization: Bearer YOUR_TOKEN'"
    `);
    expect(generateSample('curl', POST)).toMatchInlineSnapshot(`
      "curl -X POST 'https://api.example.com/v1/alerts' \\
        -H 'Authorization: Bearer YOUR_TOKEN' \\
        -H 'Content-Type: application/json' \\
        -d '{
        "a": 1
      }'"
    `);
  });

  it('JavaScript', () => {
    expect(generateSample('javascript', GET)).toMatchInlineSnapshot(`
      "const response = await fetch('https://api.example.com/v1/rates/md?currency=EUR', {
        method: 'GET',
        headers: {
          Authorization: 'Bearer YOUR_TOKEN',
        },
      });
      const data = await response.json();
      console.log(response.status, data);"
    `);
    expect(generateSample('javascript', POST)).toMatchInlineSnapshot(`
      "const response = await fetch('https://api.example.com/v1/alerts', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer YOUR_TOKEN',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          "a": 1
        }),
      });
      const data = await response.json();
      console.log(response.status, data);"
    `);
  });

  it('Python', () => {
    expect(generateSample('python', GET)).toMatchInlineSnapshot(`
      "import requests

      response = requests.request(
          "GET",
          "https://api.example.com/v1/rates/md?currency=EUR",
          headers={
              "Authorization": "Bearer YOUR_TOKEN",
          },
      )
      print(response.status_code, response.json())"
    `);
    expect(generateSample('python', POST)).toMatchInlineSnapshot(`
      "import requests

      response = requests.request(
          "POST",
          "https://api.example.com/v1/alerts",
          headers={
              "Authorization": "Bearer YOUR_TOKEN",
              "Content-Type": "application/json",
          },
          json={
              "a": 1
          },
      )
      print(response.status_code, response.json())"
    `);
  });

  it('C#', () => {
    expect(generateSample('csharp', GET)).toMatchInlineSnapshot(`
      "using System.Net.Http.Headers;

      using var client = new HttpClient();
      client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", "YOUR_TOKEN");

      var request = new HttpRequestMessage(HttpMethod.Get, "https://api.example.com/v1/rates/md?currency=EUR");

      using var response = await client.SendAsync(request);
      Console.WriteLine($"{(int)response.StatusCode} {await response.Content.ReadAsStringAsync()}");"
    `);
    expect(generateSample('csharp', POST)).toMatchInlineSnapshot(`
      "using System.Net.Http.Headers;
      using System.Text;

      using var client = new HttpClient();
      client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", "YOUR_TOKEN");

      var request = new HttpRequestMessage(HttpMethod.Post, "https://api.example.com/v1/alerts");
      request.Content = new StringContent("""
          {
            "a": 1
          }
          """, Encoding.UTF8, "application/json"); // Content-Type: application/json

      using var response = await client.SendAsync(request);
      Console.WriteLine($"{(int)response.StatusCode} {await response.Content.ReadAsStringAsync()}");"
    `);
  });

  it('PHP', () => {
    expect(generateSample('php', GET)).toMatchInlineSnapshot(`
      "<?php
      $curl = curl_init();
      curl_setopt_array($curl, [
          CURLOPT_URL => 'https://api.example.com/v1/rates/md?currency=EUR',
          CURLOPT_CUSTOMREQUEST => 'GET',
          CURLOPT_RETURNTRANSFER => true,
          CURLOPT_HTTPHEADER => [
              'Authorization: Bearer YOUR_TOKEN',
          ],
      ]);
      $response = curl_exec($curl);
      $status = curl_getinfo($curl, CURLINFO_HTTP_CODE);
      curl_close($curl);
      echo $status . ' ' . $response;"
    `);
    expect(generateSample('php', POST)).toMatchInlineSnapshot(`
      "<?php
      $curl = curl_init();
      curl_setopt_array($curl, [
          CURLOPT_URL => 'https://api.example.com/v1/alerts',
          CURLOPT_CUSTOMREQUEST => 'POST',
          CURLOPT_RETURNTRANSFER => true,
          CURLOPT_HTTPHEADER => [
              'Authorization: Bearer YOUR_TOKEN',
              'Content-Type: application/json',
          ],
          CURLOPT_POSTFIELDS => '{
        "a": 1
      }',
      ]);
      $response = curl_exec($curl);
      $status = curl_getinfo($curl, CURLINFO_HTTP_CODE);
      curl_close($curl);
      echo $status . ' ' . $response;"
    `);
  });

  it('Go', () => {
    expect(generateSample('go', GET)).toMatchInlineSnapshot(`
      "package main

      import (
      	"fmt"
      	"io"
      	"net/http"
      )

      func main() {
      	req, err := http.NewRequest("GET", "https://api.example.com/v1/rates/md?currency=EUR", nil)
      	if err != nil {
      		panic(err)
      	}
      	req.Header.Set("Authorization", "Bearer YOUR_TOKEN")

      	res, err := http.DefaultClient.Do(req)
      	if err != nil {
      		panic(err)
      	}
      	defer res.Body.Close()
      	data, _ := io.ReadAll(res.Body)
      	fmt.Println(res.Status, string(data))
      }"
    `);
    expect(generateSample('go', POST)).toMatchInlineSnapshot(`
      "package main

      import (
      	"fmt"
      	"io"
      	"net/http"
      	"strings"
      )

      func main() {
      	body := strings.NewReader(\`{
        "a": 1
      }\`)
      	req, err := http.NewRequest("POST", "https://api.example.com/v1/alerts", body)
      	if err != nil {
      		panic(err)
      	}
      	req.Header.Set("Authorization", "Bearer YOUR_TOKEN")
      	req.Header.Set("Content-Type", "application/json")

      	res, err := http.DefaultClient.Do(req)
      	if err != nil {
      		panic(err)
      	}
      	defer res.Body.Close()
      	data, _ := io.ReadAll(res.Body)
      	fmt.Println(res.Status, string(data))
      }"
    `);
  });

  it('Java', () => {
    expect(generateSample('java', GET)).toMatchInlineSnapshot(`
      "import java.net.URI;
      import java.net.http.HttpClient;
      import java.net.http.HttpRequest;
      import java.net.http.HttpResponse;

      HttpClient client = HttpClient.newHttpClient();
      HttpRequest request = HttpRequest.newBuilder(URI.create("https://api.example.com/v1/rates/md?currency=EUR"))
          .header("Authorization", "Bearer YOUR_TOKEN")
          .method("GET", HttpRequest.BodyPublishers.noBody())
          .build();
      HttpResponse<String> response = client.send(request, HttpResponse.BodyHandlers.ofString());
      System.out.println(response.statusCode() + " " + response.body());"
    `);
    expect(generateSample('java', POST)).toMatchInlineSnapshot(`
      "import java.net.URI;
      import java.net.http.HttpClient;
      import java.net.http.HttpRequest;
      import java.net.http.HttpResponse;

      HttpClient client = HttpClient.newHttpClient();
      HttpRequest request = HttpRequest.newBuilder(URI.create("https://api.example.com/v1/alerts"))
          .header("Authorization", "Bearer YOUR_TOKEN")
          .header("Content-Type", "application/json")
          .method("POST", HttpRequest.BodyPublishers.ofString("""
              {
                \\"a\\": 1
              }"""))
          .build();
      HttpResponse<String> response = client.send(request, HttpResponse.BodyHandlers.ofString());
      System.out.println(response.statusCode() + " " + response.body());"
    `);
  });

  it('quotes in values are escaped per language', () => {
    const req: SampleRequest = { method: 'GET', url: 'https://api.example.com/v1/x?q=a\'b"c', headers: { Authorization: 'Bearer YOUR_TOKEN' } };
    expect(generateSample('curl', req)).toContain(`'https://api.example.com/v1/x?q=a'\\''b"c'`);
    expect(generateSample('javascript', req)).toContain(`'https://api.example.com/v1/x?q=a\\'b"c'`);
    expect(generateSample('python', req)).toContain(`"https://api.example.com/v1/x?q=a'b\\"c"`);
    expect(generateSample('csharp', req)).toContain(`"https://api.example.com/v1/x?q=a'b\\"c"`);
    expect(generateSample('php', req)).toContain(`'https://api.example.com/v1/x?q=a\\'b"c'`);
    expect(generateSample('go', req)).toContain(`"https://api.example.com/v1/x?q=a'b\\"c"`);
    expect(generateSample('java', req)).toContain(`"https://api.example.com/v1/x?q=a'b\\"c"`);
  });

  it('a body with quotes, backslashes and backticks stays one literal', () => {
    const req: SampleRequest = { ...POST, body: '{\n  "q": "it\'s a \\"`quote`\\""\n}' };
    expect(generateSample('curl', req)).toContain(`-d '{\n  "q": "it'\\''s a \\"\`quote\`\\""\n}'`);
    expect(generateSample('php', req)).toContain(`'{\n  "q": "it\\'s a \\\\"\`quote\`\\\\""\n}'`);
    expect(generateSample('go', req)).toContain('`{\n  "q": "it\'s a \\"` + "`" + `quote` + "`" + `\\""\n}`');
    expect(generateSample('java', req)).toContain('\\"it\'s a \\\\\\"`quote`\\\\\\"\\"');
    expect(generateSample('python', req)).toContain('"q": "it\'s a \\"`quote`\\""');
  });

  it('a body ending in a quote or a backslash keeps every literal closed', () => {
    const quote: SampleRequest = { ...POST, body: '"string"' };
    expect(generateSample('java', quote)).toContain('ofString("""\n        \\"string\\""""))');
    expect(generateSample('curl', quote)).toContain(`-d '"string"'`);
    expect(generateSample('javascript', quote)).toContain('body: JSON.stringify("string"),');
    expect(generateSample('python', quote)).toContain('json="string",');
    expect(generateSample('csharp', quote)).toContain('"""\n    "string"\n    """');
    expect(generateSample('php', quote)).toContain(`CURLOPT_POSTFIELDS => '"string"',`);
    expect(generateSample('go', quote)).toContain('strings.NewReader(`"string"`)');

    const slash: SampleRequest = { ...POST, headers: { ...POST.headers, 'Content-Type': 'text/plain' }, body: 'a\\' };
    expect(generateSample('java', slash)).toContain('ofString("""\n        a\\\\"""))');
    expect(generateSample('curl', slash)).toContain(`-d 'a\\'`);
    expect(generateSample('javascript', slash)).toContain(`body: 'a\\\\',`);
    expect(generateSample('python', slash)).toContain('data="a\\\\",');
    expect(generateSample('csharp', slash)).toContain('"""\n    a\\\n    """');
    expect(generateSample('php', slash)).toContain(`CURLOPT_POSTFIELDS => 'a\\\\',`);
    expect(generateSample('go', slash)).toContain('strings.NewReader(`a\\`)');
  });

  it('a Java text block survives any run of quotes', () => {
    const quotes: SampleRequest = { ...POST, headers: { ...POST.headers, 'Content-Type': 'text/plain' }, body: 'a""""b"""""' };
    const java = generateSample('java', quotes);
    expect(java).toContain('ofString("""\n        a\\"\\"\\"\\"b\\"\\"\\"\\"\\""""))');
    // Between the delimiters, no quote is left unescaped
    const block = java.slice(java.indexOf('ofString("""') + 'ofString("""'.length, java.lastIndexOf('"""'));
    expect(block.replace(/\\./g, '')).not.toContain('"');
  });

  it('HEAD uses curl -I', () => {
    expect(generateSample('curl', { ...GET, method: 'HEAD' })).toMatch(/^curl -I 'https:/);
  });

  it('a non-JSON body is sent as written, not as JSON', () => {
    const form: SampleRequest = { ...POST, headers: { ...POST.headers, 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'a=1&b=x' };
    expect(generateSample('javascript', form)).toContain("body: 'a=1&b=x',");
    expect(generateSample('python', form)).toContain('data="a=1&b=x",');
    expect(generateSample('python', form)).not.toContain('json=');
    expect(generateSample('curl', form)).toContain("-d 'a=1&b=x'");
  });

  it('Python prints the text when the success response is not JSON', () => {
    expect(generateSample('python', { ...GET, responseJson: false })).toContain('print(response.status_code, response.text)');
    expect(generateSample('python', GET)).toContain('print(response.status_code, response.json())');
  });

  it('never contains a pasted token', () => {
    for (const { lang } of SAMPLE_LANGS) {
      expect(samplesFor(operation('/v1/rates/{country}', 'get'), 'https://api.example.com').map(s => s.source).join('\n'))
        .not.toContain('qcli_pat_');
      expect(generateSample(lang, GET)).toContain('YOUR_TOKEN');
    }
  });
});

describe('samplesFor', () => {
  it('a form body is encoded as form data; a success without JSON is not parsed as JSON', () => {
    const op = groupByTag({
      openapi: '3.1.0',
      paths: {
        '/login': {
          post: {
            requestBody: { content: { 'application/x-www-form-urlencoded': { example: { user: 'ann', note: 'a b&c' } } } },
            responses: { 204: { description: 'Signed in' } },
          },
        },
      },
    })[0].operations[0];
    expect(op.bodyExample).toBe('user=ann&note=a+b%26c');
    const samples = samplesFor(op, 'https://api.example.com');
    expect(samples[0].source).toContain("-H 'Content-Type: application/x-www-form-urlencoded'");
    expect(samples[0].source).toContain("-d 'user=ann&note=a+b%26c'");
    expect(samples[2].source).toContain('print(response.status_code, response.text)');
    expect(samplesFor(operation('/v1/rates/{country}', 'get'), 'https://api.example.com')[2].source).toContain('response.json()');
  });


  it('path params use examples, else {name}', () => {
    const op = operation('/v1/rates/{country}', 'get');
    expect(samplesFor(op, 'https://api.example.com')[0].source).toContain("'https://api.example.com/v1/rates/md'");

    const noExample: Operation = {
      ...op,
      parameters: op.parameters.map(p => (p.name === 'country' ? { ...p, example: undefined } : p)),
    };
    expect(samplesFor(noExample, 'https://api.example.com')[0].source).toContain("'https://api.example.com/v1/rates/{country}'");
  });

  it('query params with an example are appended, others left out', () => {
    const op = operation('/v1/rates/{country}', 'get');
    const withExample: Operation = {
      ...op,
      parameters: op.parameters.map(p => (p.name === 'currency' ? { ...p, example: 'EUR' } : p)),
    };
    expect(samplesFor(withExample, 'https://api.example.com/')[0].source).toContain("'https://api.example.com/v1/rates/md?currency=EUR'");
  });

  it('a JSON body comes from the schema\'s examples', () => {
    const op = operation('/v1/alerts', 'post');
    const curl = samplesFor(op, 'https://api.example.com')[0].source;
    expect(curl).toContain('-d \'{\n  "currency": "EUR",\n  "above": 20\n}\'');
    expect(curl).toContain("-H 'Content-Type: application/json'");
  });

  it('host x-codeSamples replace the generated language and extra languages are appended', () => {
    const op: Operation = {
      ...operation('/v1/rates/{country}', 'get'),
      codeSamples: [{ lang: 'shell', source: 'X' }, { lang: 'Ruby', source: 'Y' }],
    };

    const samples = samplesFor(op, 'https://api.example.com');

    expect(samples.map(s => s.label)).toEqual(['cURL', 'JavaScript', 'Python', 'C#', 'PHP', 'Go', 'Java', 'Ruby']);
    expect(samples[0]).toEqual({ lang: 'curl', label: 'cURL', source: 'X' });
    expect(samples[7]).toEqual({ lang: 'Ruby', label: 'Ruby', source: 'Y' });
  });

  it('aliases and labels of host samples', () => {
    const op: Operation = {
      ...operation('/v1/rates/{country}', 'get'),
      codeSamples: [
        { lang: 'node', label: 'Node.js', source: 'N' },
        { lang: 'C#', source: 'C' },
        { lang: 'golang', source: 'G' },
      ],
    };

    const samples = samplesFor(op, 'https://api.example.com');

    expect(samples.find(s => s.lang === 'javascript')).toEqual({ lang: 'javascript', label: 'Node.js', source: 'N' });
    expect(samples.find(s => s.lang === 'csharp')?.source).toBe('C');
    expect(samples.find(s => s.lang === 'go')?.source).toBe('G');
    expect(samples).toHaveLength(7);
  });
});
