declare module "pdf-parse" {
  interface PdfData {
    numpages: number;
    numrender: number;
    info: Record<string, unknown>;
    metadata: unknown;
    version: string;
    text: string;
  }

  interface PdfParseOptions {
    pagerender?: (pageData: unknown) => string;
    max?: number;
    version?: string;
  }

  function pdfParse(
    dataBuffer: Buffer,
    options?: PdfParseOptions
  ): Promise<PdfData>;

  export = pdfParse;
}
