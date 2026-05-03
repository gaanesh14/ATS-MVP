// Ambient declaration for the deep-import path used to bypass the
// pdf-parse "Cannot find module './test/data/...'" debug-mode bug.
// The default `pdf-parse` import runs a debug block at module load that
// looks for test files; importing from `lib/pdf-parse.js` skips it.

declare module 'pdf-parse/lib/pdf-parse.js' {
  interface PdfParseResult {
    numpages: number;
    numrender: number;
    info: Record<string, unknown>;
    metadata: unknown;
    version: string;
    text: string;
  }

  function pdf(
    dataBuffer: Buffer | Uint8Array,
    options?: Record<string, unknown>
  ): Promise<PdfParseResult>;

  export default pdf;
}
