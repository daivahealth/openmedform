import { readFileSync } from 'fs';
import { join } from 'path';
import { afterEach, describe, it, expect, vi } from 'vitest';
import { FormConversionController } from './form-conversion.controller';
import { FormConversionService, assertHtmlWithinBudget } from './form-conversion.service';
import { assertConversionOutputComplete } from '../../common/utils/llm-output';
import { extractFormHtml } from '../../common/utils/html-extract';
import { renderHtmlToDomWithOutcome } from '../../common/utils/html-render';
import type { LayoutSnapshot } from '../../common/utils/layout-detect';
import type { RequestUser } from '../../common/types/jwt-payload.interface';

const user: RequestUser = {
  userId: '10000000-0000-0000-0000-000000000001',
  tenantId: '20000000-0000-0000-0000-000000000002',
  email: 'user@example.com',
  role: 'FORM_DESIGNER',
};

function setup() {
  const service = { startConversion: vi.fn().mockResolvedValue({ id: 'job-1' }) };
  const controller = new FormConversionController(
    service as unknown as FormConversionService,
  );
  return { controller, service };
}

const htmlFile = (sizeBytes: number) =>
  ({
    mimetype: 'text/html',
    size: sizeBytes,
    buffer: Buffer.from('<form><input type="checkbox"></form>'),
    originalname: 'mockup.html',
  }) as Express.Multer.File;

describe('HTML upload guards', () => {
  it('accepts a reasonable HTML mock-up', async () => {
    const { controller, service } = setup();

    await controller.start(user, htmlFile(50_000), '127.0.0.1', {});

    expect(service.startConversion).toHaveBeenCalledWith(
      user.tenantId,
      user.userId,
      expect.objectContaining({ mimeType: 'text/html' }),
      '127.0.0.1',
    );
  });

  // The guards run before any async work, so these throw synchronously rather
  // than returning a rejected promise.

  it('rejects an HTML file over the 2MB cap with its actual size', () => {
    const { controller, service } = setup();

    expect(() =>
      controller.start(user, htmlFile(5 * 1024 * 1024), '127.0.0.1', {}),
    ).toThrow(/limited to 2MB .*5\.0MB/i);
    expect(service.startConversion).not.toHaveBeenCalled();
  });

  it('leaves the larger cap in place for PDFs', async () => {
    const { controller, service } = setup();
    const pdf = {
      mimetype: 'application/pdf',
      size: 5 * 1024 * 1024,
      buffer: Buffer.from('%PDF'),
      originalname: 'form.pdf',
    } as Express.Multer.File;

    await controller.start(user, pdf, '127.0.0.1', {});

    expect(service.startConversion).toHaveBeenCalled();
  });
});

describe('assertConversionOutputComplete', () => {
  it('accepts a complete JSON object', () => {
    expect(() => assertConversionOutputComplete('{"dataSchema":{}}')).not.toThrow();
  });

  it('accepts a complete object wrapped in markdown fences', () => {
    expect(() =>
      assertConversionOutputComplete('```json\n{"dataSchema":{}}\n```'),
    ).not.toThrow();
  });

  it('rejects output that ran out of budget mid-object, naming the real cause', () => {
    // The failure mode when a form is too large: valid-looking JSON that just
    // stops. Without this the author sees "not valid JSON" and hunts their file.
    expect(() =>
      assertConversionOutputComplete('{"dataSchema":{"properties":{"a":{"type":"str'),
    ).toThrow(/too large to convert in one pass/i);
  });

  it('leaves empty output for the assembler to report', () => {
    expect(() => assertConversionOutputComplete('   ')).not.toThrow();
  });

  it('leaves non-JSON output (e.g. a refusal) for the assembler to report', () => {
    expect(() => assertConversionOutputComplete('I cannot help with that')).not.toThrow();
  });

  describe('zero-field diagnosis', () => {
    // The two causes need different advice. Getting this wrong sends the author
    // hunting for a problem that is not in their file. The guard runs inside the
    // background conversion job, so it is exercised directly rather than through
    // the controller.
    const guardFor =
      (html: string, outcome?: 'unavailable' | 'disabled' | 'failed' | 'rendered') => () =>
        assertHtmlWithinBudget(extractFormHtml(html).stats, outcome);

    const JS_BUILT = `<table id="t"><thead><tr><th>Parameter</th></tr></thead><tbody id="b"></tbody></table>
       <script>buildEverything()</script>`;

    it('names JavaScript as the cause when the page ships scripts', () => {
      const jsBuilt = guardFor(JS_BUILT);
      expect(jsBuilt).toThrow(/builds its form with JavaScript/i);
      // …and says what to do about it
      expect(jsBuilt).toThrow(/outerHTML/i);
    });

    // The advice differs entirely by cause. Blaming the author's file for a
    // missing browser wastes their time and hides an operator problem.
    it('blames the deployment, not the file, when no browser is available', () => {
      const g = guardFor(JS_BUILT, 'unavailable');
      expect(g).toThrow(/no headless browser is available/i);
      expect(g).toThrow(/installation issue, not a problem with your file/i);
      expect(g).toThrow(/CHROMIUM_PATH/);
    });

    it('names the config flag when rendering is switched off', () => {
      expect(guardFor(JS_BUILT, 'disabled')).toThrow(/HTML_RENDER_DISABLED/);
    });

    it('says the page produced nothing when a render did run', () => {
      expect(guardFor(JS_BUILT, 'rendered')).toThrow(/rendered but produced no form fields/i);
      expect(guardFor(JS_BUILT, 'failed')).toThrow(/did not produce any fields/i);
    });

    it('keeps the plain "not a form" message when there are no scripts', () => {
      const notAForm = guardFor('<h1>Policy document</h1><p>No fields here.</p>');
      expect(notAForm).toThrow(/No form fields were found/i);
      expect(notAForm).not.toThrow(/JavaScript/i);
    });

    it('stays quiet for a mock-up that has real fields, scripts or not', () => {
      expect(
        guardFor('<input type="text" name="a"><script>enhance()</script>'),
      ).not.toThrow();
    });
  });

  describe('deployment-configurable size caps', () => {
    // The caps are correctness bounds tied to the output-token budget, so they
    // are env vars for the operator (conversion-limits.ts), never per-user.
    const manyFields = (n: number) =>
      Array.from({ length: n }, (_, i) => `<input type="text" name="f${i}">`).join('');
    const guardFor = (html: string) => () =>
      assertHtmlWithinBudget(extractFormHtml(html).stats);

    afterEach(() => {
      delete process.env.CONVERSION_MAX_FIELDS;
    });

    it('rejects past the default limit, naming the limit', () => {
      expect(guardFor(manyFields(200))).toThrow(/limit 160/);
    });

    it('honors a raised CONVERSION_MAX_FIELDS', () => {
      process.env.CONVERSION_MAX_FIELDS = '240';
      expect(guardFor(manyFields(200))).not.toThrow();
      expect(guardFor(manyFields(300))).toThrow(/limit 240/);
    });

    it('falls back to the default when the env var is not a number', () => {
      process.env.CONVERSION_MAX_FIELDS = 'lots';
      expect(guardFor(manyFields(200))).toThrow(/limit 160/);
    });

    it('clamps to the floor so a typo cannot zero the pipeline', () => {
      process.env.CONVERSION_MAX_FIELDS = '0';
      expect(guardFor(manyFields(5))).not.toThrow();
    });
  });
});


/**
 * The geometry fallback, exercised through the service seam with the browser
 * mocked out — the render itself is html-render.ts's business, and CI has no
 * Chromium. The snapshots are real captures (see layout-detect.test.ts).
 */
vi.mock('../../common/utils/html-render', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../common/utils/html-render')>()),
  renderHtmlToDomWithOutcome: vi.fn(),
}));

const FIXTURES = join(__dirname, '..', '..', 'common', 'utils', '__fixtures__');
const fixture = (name: string) => readFileSync(join(FIXTURES, name), 'utf8');
const layoutOf = (name: string) => JSON.parse(fixture(`${name}.layout.json`)) as LayoutSnapshot;

function conversionService() {
  return new FormConversionService(
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );
}

/** `extractHtmlSource` is private; the wiring under test is only reachable here. */
const extractSource = (html: string, warnings: string[]) =>
  (
    conversionService() as unknown as {
      extractHtmlSource(h: string, w: string[]): Promise<ReturnType<typeof extractFormHtml>>;
    }
  ).extractHtmlSource(html, warnings);

describe('geometry fallback wiring', () => {
  const render = vi.mocked(renderHtmlToDomWithOutcome);

  it('renders a script-free div grid and adopts the hint geometry recovers', async () => {
    const html = fixture('vip-div-grid.html');
    render.mockResolvedValue({ status: 'rendered', html, layout: layoutOf('vip-div-grid') });

    const warnings: string[] = [];
    const result = await extractSource(html, warnings);

    expect(render).toHaveBeenCalledOnce();
    expect(result.transposedMatrices).toHaveLength(1);
    expect(result.transposedMatrices[0].instanceHeaders).toEqual(['Cannula 1']);
    expect(warnings.join(' ')).toContain('without table markup');
  });

  it('does not spend a render on a layout with no add affordance', async () => {
    render.mockClear();

    const result = await extractSource(fixture('plain-div-grid.html'), []);

    expect(render).not.toHaveBeenCalled();
    expect(result.transposedMatrices).toEqual([]);
    expect(result.repeatingTables).toEqual([]);
  });

  it('leaves a real table alone — markup wins over geometry', async () => {
    render.mockClear();
    const html = fixture('vip-rendered.html');
    // This chart DOES get rendered, but for the nesting measurement rather than
    // for geometry (see "interaction probing" below). With no probe coming
    // back, the markup hint must survive untouched — geometry never overrides
    // a real <table>.
    render.mockResolvedValue({ status: 'rendered', html });

    const result = await extractSource(html, []);

    expect(result.transposedMatrices).toEqual(extractFormHtml(html).transposedMatrices);
  });

  it('does not render a table that has nothing left to measure', async () => {
    // Same chart with the nested "+ Day" control removed: markup detection
    // already knows everything, so a render would be pure cost.
    render.mockClear();
    const html = fixture('vip-rendered.html').replace(/\+ Day/g, 'Day');

    await extractSource(html, []);

    expect(render).not.toHaveBeenCalled();
  });

  it('keeps the static result when the browser is unavailable', async () => {
    render.mockClear();
    render.mockResolvedValue({ status: 'unavailable', detail: 'no chromium' });
    const html = fixture('vip-div-grid.html');

    const result = await extractSource(html, []);

    expect(render).toHaveBeenCalledOnce();
    expect(result.transposedMatrices).toEqual([]);
    expect(result.stats.fields).toBe(extractFormHtml(html).stats.fields);
  });

  it('survives a render that produced no snapshot', async () => {
    render.mockClear();
    const html = fixture('vip-div-grid.html');
    render.mockResolvedValue({ status: 'rendered', html });

    const result = await extractSource(html, []);

    expect(result.transposedMatrices).toEqual([]);
  });
});


describe('script-config opt-in (POST /conversions)', () => {
  // The default must be OFF for anything that is not an explicit yes: this
  // flag narrows the strip-scripts posture, so an ambiguous value is a no.
  it.each([
    ['true', true],
    ['1', true],
    ['false', false],
    ['0', false],
    ['yes', false],
    ['TRUE', false],
    [undefined, false],
    ['', false],
  ])('%s -> %s', async (sent, expected) => {
    const { controller, service } = setup();

    await controller.start(user, htmlFile(1000), '127.0.0.1', { extractScriptConfig: sent });

    expect(service.startConversion).toHaveBeenCalledWith(
      user.tenantId,
      user.userId,
      expect.objectContaining({ extractScriptConfig: expected }),
      '127.0.0.1',
    );
  });
});


describe('script-populated containers', () => {
  const render = vi.mocked(renderHtmlToDomWithOutcome);

  /**
   * The Sepsis screening sheet in miniature: a static form that ALSO writes a
   * whole checklist out of a script array, next to an ordinary "+ Add Row" log.
   * The field count is high, so nothing used to trigger a render and the
   * checklist reached the model as two column headings.
   */
  const sepsis = `
    <div class="row"><label>Consultant Name</label><input type="text" name="consultant"></div>
    <div class="row"><label>Date</label><input type="date" name="date"></div>
    <section>
      <h3>Clinical Suspicion of Sepsis — Signs Observed</h3>
      <div class="wrap"><table><thead><tr><th>Parameter</th><th>Patient's Condition</th></tr></thead>
        <tbody id="sepsis-signs-body"></tbody></table></div>
    </section>
    <section>
      <h3>Hourly Vitals</h3>
      <div class="wrap"><table><thead><tr><th>Time</th><th>HR</th><th>MAP</th></tr></thead>
        <tbody id="vitals-body"></tbody></table></div>
      <button type="button">+ Add Row</button>
    </section>
    <script>
      ['Chills, rigors', 'CRT > 3 seconds'].forEach(function (sign) {
        document.getElementById('sepsis-signs-body').appendChild(document.createElement('tr'));
      });
    </script>`;

  /** What that page looks like once its script has run. */
  const sepsisRendered = sepsis
    .replace(
      '<tbody id="sepsis-signs-body"></tbody>',
      `<tbody id="sepsis-signs-body">
         <tr><td>Chills, rigors</td><td><select><option>Present</option><option>Absent</option></select></td></tr>
         <tr><td>CRT > 3 seconds</td><td><select><option>Present</option><option>Absent</option></select></td></tr>
       </tbody>`,
    )
    .replace(
      '<tbody id="vitals-body"></tbody>',
      '<tbody id="vitals-body"><tr><td><input type="time"></td><td><input></td><td><input></td></tr></tbody>',
    );

  it('renders a page that builds fields at runtime even when the markup is full of them', async () => {
    render.mockClear();
    render.mockResolvedValue({ status: 'rendered', html: sepsisRendered });

    const warnings: string[] = [];
    const result = await extractSource(sepsis, warnings);

    expect(render).toHaveBeenCalledOnce();
    expect(result.cleanedHtml).toContain('Chills, rigors');
    expect(warnings.join(' ')).toMatch(/builds part of its form with JavaScript/);
  });

  it('keeps the repeating-log hint the render erased', async () => {
    // Running the page put a blank row in the vitals <tbody>, which is the very
    // evidence the recordTable hint is read from. Losing it would trade a whole
    // hourly chart for the rows the render recovered elsewhere.
    render.mockClear();
    render.mockResolvedValue({ status: 'rendered', html: sepsisRendered });

    const result = await extractSource(sepsis, []);

    expect(extractFormHtml(sepsisRendered).repeatingTables).toEqual([]);
    expect(result.repeatingTables).toHaveLength(1);
    expect(result.repeatingTables[0].addLabel).toBe('+ Add Row');
  });

  it('says so when the browser is unavailable and the fields stay unread', async () => {
    render.mockClear();
    render.mockResolvedValue({ status: 'unavailable', detail: 'no chromium' });

    const warnings: string[] = [];
    const result = await extractSource(sepsis, warnings);

    expect(result.cleanedHtml).not.toContain('Chills, rigors');
    expect(warnings.join(' ')).toMatch(/#sepsis-signs-body/);
    expect(warnings.join(' ')).toMatch(/nothing was invented/);
  });

  it('stays quiet once the render has filled the container', async () => {
    render.mockClear();
    render.mockResolvedValue({ status: 'rendered', html: sepsisRendered });

    const warnings: string[] = [];
    await extractSource(sepsis, warnings);

    expect(warnings.join(' ')).not.toMatch(/#sepsis-signs-body/);
  });

  it('discounts the blank log rows the render added from the size budget', async () => {
    // The restored hint means the log converts to ONE recordTable holding a
    // single row's worth of fields, so charging the budget for three identical
    // blank rows would reject a sheet the model can comfortably emit.
    render.mockClear();
    const threeRows = sepsisRendered.replace(
      '<tbody id="vitals-body"><tr><td><input type="time"></td><td><input></td><td><input></td></tr></tbody>',
      `<tbody id="vitals-body">
         <tr><td><input type="time"></td><td><input></td><td><input></td></tr>
         <tr><td><input type="time"></td><td><input></td><td><input></td></tr>
         <tr><td><input type="time"></td><td><input></td><td><input></td></tr>
       </tbody>`,
    );
    render.mockResolvedValue({ status: 'rendered', html: threeRows });

    const result = await extractSource(sepsis, []);
    const rendered = extractFormHtml(threeRows).stats;

    // Two of the three vitals rows (6 fields) are discounted; the recovered
    // checklist is not.
    expect(result.stats.fields).toBe(rendered.fields - 6);
    expect(result.stats.tableRows).toBe(rendered.tableRows - 2);
    expect(result.cleanedHtml).toContain('Chills, rigors');
  });

  it('never discounts an ordinary data table', async () => {
    render.mockClear();
    // Same page, but the render leaves the vitals log empty — the hint is not
    // restored, so nothing is discounted and the counts are the render's own.
    const emptyLog = sepsisRendered.replace(
      /<tbody id="vitals-body">[\s\S]*?<\/tbody>/,
      '<tbody id="vitals-body"></tbody>',
    );
    render.mockResolvedValue({ status: 'rendered', html: emptyLog });

    const result = await extractSource(sepsis, []);

    expect(result.stats.fields).toBe(extractFormHtml(emptyLog).stats.fields);
  });

  it('does not render an ordinary add-a-row log on its own', async () => {
    // Its markup already describes it: header row + add control = recordTable.
    render.mockClear();
    const log = `
      <input type="text" name="patient">
      <table><thead><tr><th>Time</th><th>HR</th></tr></thead><tbody id="vitals-body"></tbody></table>
      <button type="button">+ Add Row</button>
      <script>document.getElementById('vitals-body').appendChild(row());</script>`;

    const result = await extractSource(log, []);

    expect(render).not.toHaveBeenCalled();
    expect(result.repeatingTables).toHaveLength(1);
  });
});

describe('interaction probing', () => {
  const render = vi.mocked(renderHtmlToDomWithOutcome);
  const probeFixture = JSON.parse(fixture('vip-interactive.probe.json')) as {
    clicks: { label: string; before: LayoutSnapshot; after: LayoutSnapshot }[];
  };
  /** Only the click that matters here; the other one changed nothing. */
  const dayClick = probeFixture.clicks.filter((c) => c.label === '+ Day');
  const vipHtml = fixture('vip-rendered.html');

  const CANNULA_ROWS = [
    'Date of Insertion',
    'Time of Insertion',
    'Inserted At',
    'Inserted By — Name',
    'Inserted By — EC Code',
    'Site',
    'Side',
    'Size of Cannula (Gauge)',
  ];

  it('replaces the inferred nested split with a measured one', async () => {
    render.mockClear();
    render.mockResolvedValue({
      status: 'rendered',
      html: vipHtml,
      probe: { clicks: dayClick, html: vipHtml },
    });

    const warnings: string[] = [];
    const result = await extractSource(vipHtml, warnings);
    const matrix = result.transposedMatrices[0];

    expect(matrix.rowLabels).toHaveLength(22);
    expect(matrix.nestedRowLabels).toHaveLength(14);
    // The measurement is only useful if it puts the 8 cannula-level rows on the
    // OUTER record; that is the split the model used to get wrong.
    for (const row of CANNULA_ROWS) expect(matrix.nestedRowLabels).not.toContain(row);
    expect(warnings.join(' ')).toMatch(/measured, not guessed/);
  });

  it('keeps the hint order and vocabulary', async () => {
    render.mockClear();
    render.mockResolvedValue({
      status: 'rendered',
      html: vipHtml,
      probe: { clicks: dayClick, html: vipHtml },
    });

    const matrix = (await extractSource(vipHtml, [])).transposedMatrices[0];

    // A measurement naming rows the hint does not list would be worse than none.
    for (const label of matrix.nestedRowLabels ?? []) {
      expect(matrix.rowLabels).toContain(label);
    }
    const order = (matrix.nestedRowLabels ?? []).map((l) => matrix.rowLabels.indexOf(l));
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });

  it('leaves the hint alone when nothing was probed', async () => {
    render.mockClear();
    render.mockResolvedValue({ status: 'rendered', html: vipHtml });

    const matrix = (await extractSource(vipHtml, [])).transposedMatrices[0];

    expect(matrix.rowLabels).toHaveLength(22);
    expect(matrix.nestedRowLabels).toBeUndefined();
  });

  it('ignores a measurement that claims every row, or none', async () => {
    // All-or-nothing is not a split, it is noise — and acting on it would move
    // the outer record's fields into the nested one.
    const flat: LayoutSnapshot = { nodes: [] };
    for (const clicks of [
      [{ label: '+ Day', before: flat, after: flat }],
      [{ label: '+ Day', before: dayClick[0].after, after: dayClick[0].after }],
    ]) {
      render.mockClear();
      render.mockResolvedValue({
        status: 'rendered',
        html: vipHtml,
        probe: { clicks, html: vipHtml },
      });

      const matrix = (await extractSource(vipHtml, [])).transposedMatrices[0];
      expect(matrix.nestedRowLabels).toBeUndefined();
    }
  });

  it('ignores a click whose label matches no nested-add control', async () => {
    render.mockClear();
    render.mockResolvedValue({
      status: 'rendered',
      html: vipHtml,
      probe: {
        clicks: [{ ...dayClick[0], label: '+ Something Else' }],
        html: vipHtml,
      },
    });

    expect((await extractSource(vipHtml, [])).transposedMatrices[0].nestedRowLabels).toBeUndefined();
  });

  it('reads fields that only exist after a click', async () => {
    // The pre-click DOM has none; the post-probe DOM has them. Preferring the
    // richer read is what turns a rejected upload into a converted form.
    const before = '<html><body><div id="sites"></div><button>+ Add wound site</button></body></html>';
    const after =
      '<html><body><div id="sites">' +
      '<label>Location<input type="text"></label>' +
      '<label>Depth<input type="number"></label>' +
      '</div><button>+ Add wound site</button></body></html>';

    render.mockClear();
    render.mockResolvedValue({
      status: 'rendered',
      html: before,
      probe: { clicks: [], html: after },
    });

    const result = await extractSource(
      '<html><body><div id="sites"></div><button>+ Add wound site</button>' +
        '<script>/* builds on click */</script></body></html>',
      [],
    );

    expect(result.stats.fields).toBe(2);
  });

  it('never lets a worse post-probe DOM lose fields', async () => {
    // A probe that broke the page must not cost us what the render already had.
    const good = '<html><body><form><input type="text"><input type="text"></form>' +
      '<script>x</script></body></html>';
    render.mockClear();
    render.mockResolvedValue({
      status: 'rendered',
      html: good,
      probe: { clicks: [], html: '<html><body>gone</body></html>' },
    });

    const result = await extractSource(
      '<html><body><form></form><script>x</script></body></html>',
      [],
    );

    expect(result.stats.fields).toBe(2);
  });
});


describe('page-structure probe (PDF / image sources)', () => {
  const matrix = {
    labelHeader: 'Parameter',
    rowLabels: ['Date of Insertion', 'Site', 'Side'],
    instanceHeaders: ['Cannula 1'],
  };

  /** Minimal assembled output; only what recordStructureProbe touches. */
  const assembled = (uiSchema: unknown) => ({
    dataSchema: {},
    uiSchema,
    printSchema: {},
    translations: {},
    conversionMetadata: {} as Record<string, unknown>,
    scoringRules: {},
    warnings: [] as { type: string; message: string }[],
  });

  const record = (out: ReturnType<typeof assembled>, probe: unknown) =>
    (
      conversionService() as unknown as {
        recordStructureProbe(a: unknown, p: unknown): void;
      }
    ).recordStructureProbe(out, probe);

  const withRecordTable = {
    type: 'VerticalLayout',
    elements: [
      { type: 'Control', scope: '#/properties/c', options: { omf: { control: 'recordTable' } } },
    ],
  };
  const flat = { type: 'VerticalLayout', elements: [{ type: 'Control', scope: '#/properties/a' }] };

  it('records what was detected, so a reviewer can verify the hint existed', () => {
    const out = assembled(withRecordTable);
    record(out, { repeatingTables: [], transposedMatrices: [matrix], warnings: [] });

    expect(out.conversionMetadata.structureProbe).toEqual({
      source: 'page-images',
      detected: [
        {
          kind: 'matrix',
          labelHeader: 'Parameter',
          rowLabels: matrix.rowLabels,
          instanceHeaders: ['Cannula 1'],
        },
      ],
      rejected: [],
    });
  });

  it('warns that NOTHING was detected — a probe problem', () => {
    const out = assembled(flat);
    record(out, { repeatingTables: [], transposedMatrices: [], warnings: [] });

    expect(out.warnings).toHaveLength(1);
    expect(out.warnings[0].message).toMatch(/No repeating table structure was detected/);
    expect(out.warnings[0].message).not.toMatch(/diverged/);
  });

  it('warns that the model DIVERGED — a different problem with a different fix', () => {
    // Structure was detected and passed to the model, and the finished form has
    // no record table. Identical symptom to the case above, opposite cause.
    const out = assembled(flat);
    record(out, { repeatingTables: [], transposedMatrices: [matrix], warnings: [] });

    expect(out.warnings).toHaveLength(1);
    expect(out.warnings[0].message).toMatch(/diverged from the hint/);
    expect(out.warnings[0].message).not.toMatch(/No repeating table structure/);
  });

  it('stays quiet when the hint was detected and honoured', () => {
    const out = assembled(withRecordTable);
    record(out, { repeatingTables: [], transposedMatrices: [matrix], warnings: [] });

    expect(out.warnings).toEqual([]);
  });

  it('carries the probe\'s own rejections into the metadata', () => {
    const out = assembled(withRecordTable);
    record(out, {
      repeatingTables: [],
      transposedMatrices: [matrix],
      warnings: ['a table structure was reported with low confidence and was not used as a hint'],
    });

    expect(
      (out.conversionMetadata.structureProbe as { rejected: string[] }).rejected,
    ).toHaveLength(1);
  });

  it('does nothing at all for a source that was never probed', () => {
    // HTML uploads go through the markup detectors; there is no probe to report.
    const out = assembled(flat);
    record(out, undefined);

    expect(out.conversionMetadata).toEqual({});
    expect(out.warnings).toEqual([]);
  });
});
