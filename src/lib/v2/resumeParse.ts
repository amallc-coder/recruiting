// Client-side résumé text extraction. The heavy parsers (pdfjs-dist, mammoth)
// are dynamically imported so they only load when a file is actually parsed —
// they never enter the main bundle, the same approach the xlsx importer uses.

/** Cap stored résumé text so a huge PDF can't bloat the row / the match prompt. */
const MAX_CHARS = 20000

/** Extract plain text from a résumé file (PDF, DOCX, or plain text). */
export async function extractResumeText(file: File): Promise<string> {
  const name = file.name.toLowerCase()
  let text: string
  if (name.endsWith('.pdf')) {
    text = await extractPdf(file)
  } else if (name.endsWith('.docx')) {
    text = await extractDocx(file)
  } else if (name.endsWith('.doc')) {
    throw new Error('Legacy .doc isn’t supported — save as .docx or PDF and try again.')
  } else if (name.endsWith('.txt') || name.endsWith('.md') || name.endsWith('.csv') || file.type.startsWith('text/')) {
    text = await file.text()
  } else {
    throw new Error('Unsupported file type — upload a PDF, DOCX, or text file.')
  }
  // Normalize whitespace and bound the length.
  return text
    .replace(/\r/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, MAX_CHARS)
}

async function extractPdf(file: File): Promise<string> {
  const pdfjs = await import('pdfjs-dist')
  // Vite resolves the worker as a hashed URL asset; set it once (idempotent).
  const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

  const data = await file.arrayBuffer()
  const doc = await pdfjs.getDocument({ data }).promise
  const pages: string[] = []
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i)
    const content = await page.getTextContent()
    const line = content.items
      .map((it) => ('str' in it ? it.str : ''))
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim()
    if (line) pages.push(line)
  }
  await doc.destroy()
  return pages.join('\n\n')
}

async function extractDocx(file: File): Promise<string> {
  // mammoth's browser build exposes extractRawText({ arrayBuffer }).
  const mammoth = await import('mammoth')
  const arrayBuffer = await file.arrayBuffer()
  const result = await mammoth.extractRawText({ arrayBuffer })
  return result.value ?? ''
}
