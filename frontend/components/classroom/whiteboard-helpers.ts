import { createShapeId, Editor } from 'tldraw';

/**
 * Retrieves all frames on the current page, auto-assigns index to any
 * frame shape that does not have one (using Y-position coordinates),
 * and returns them sorted by pageIndex.
 */
export function getPagesSorted(editor: Editor) {
  const frames = editor
    .getCurrentPageShapes()
    .filter((s) => s.type === 'frame');

  // Sort frames to determine sequential ordering
  // We sort by pageIndex if defined, else Y position
  const sortedToHeal = [...frames].sort((a, b) => {
    const aIndex = a.meta?.pageIndex !== undefined ? (a.meta.pageIndex as number) : -1;
    const bIndex = b.meta?.pageIndex !== undefined ? (b.meta.pageIndex as number) : -1;
    if (aIndex !== -1 && bIndex !== -1) return aIndex - bIndex;
    if (aIndex === -1 && bIndex === -1) return a.y - b.y;
    return aIndex === -1 ? 1 : -1;
  });

  const updates: any[] = [];
  sortedToHeal.forEach((f, idx) => {
    const expectedIndex = idx;
    const expectedName = `Page ${expectedIndex + 1}`;
    const currentName = f.props.name;
    const currentIdx = f.meta?.pageIndex;

    if (currentIdx !== expectedIndex || currentName !== expectedName) {
      updates.push({
        id: f.id,
        type: 'frame',
        props: {
          ...f.props,
          name: expectedName,
        },
        meta: {
          ...f.meta,
          pageIndex: expectedIndex,
        },
      });
    }
  });

  if (updates.length > 0) {
    editor.run(() => {
      updates.forEach((update) => {
        editor.updateShape(update);
      });
    });
  }

  return editor
    .getCurrentPageShapes()
    .filter((s) => s.type === 'frame')
    .sort((a, b) => ((a.meta?.pageIndex ?? 0) as number) - ((b.meta?.pageIndex ?? 0) as number));
}

/**
 * Returns the next available pageIndex.
 */
export function getNextPageIndex(editor: Editor) {
  const pages = getPagesSorted(editor);
  if (pages.length === 0) return 0;
  return ((pages[pages.length - 1].meta?.pageIndex ?? 0) as number) + 1;
}

/**
 * Handler for manual page creation. Creates a Letter-sized (1600x900)
 * page frame placed vertically below the last page.
 */
export function addHandDrawnPage(editor: Editor) {
  const pages = getPagesSorted(editor);
  const last = pages[pages.length - 1];
  const GAP = 50;
  const PAGE_W = 1440;   // Letter width
  const PAGE_H = 810;  // Letter height

  const y = last ? last.y + (last.props.h as number ?? PAGE_H) + GAP : 0;
  const x = last ? last.x : 0;

  editor.createShape({
    type: 'frame',
    x,
    y,
    props: { w: PAGE_W, h: PAGE_H, name: `Page ${getNextPageIndex(editor) + 1}` },
    meta: { pageIndex: getNextPageIndex(editor) },
  });
}

/**
 * Parses a PDF file using pdfjsLib, renders each page to a canvas,
 * uploads it to the backend R2 pipeline, and adds a frame containing
 * the page image shape to the Tldraw canvas.
 */
export async function importPdf(
  editor: Editor,
  file: File,
  onProgress?: (current: number, total: number) => void
) {
  // Dynamically import to prevent SSR issues
  const pdfjsLib = await import('pdfjs-dist');
  pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';

  const buf = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buf }).promise;

  let nextIndex = getNextPageIndex(editor);
  const pages = getPagesSorted(editor);
  const PAGE_W = 1440;
  const PAGE_H = 810;
  const CANVAS_W = 2880;
  const CANVAS_H = 1620;
  
  let y = pages.length
    ? pages[pages.length - 1].y + ((pages[pages.length - 1].props.h as number) ?? 0) + 50
    : 0;

  const ops: Array<() => void> = [];
  const SYNC_WORKER_URL = (process.env.NEXT_PUBLIC_SYNC_WORKER_URL || 'http://localhost:8787').replace(/\/+$/, '');

  for (let i = 1; i <= pdf.numPages; i++) {
    if (onProgress) {
      onProgress(i, pdf.numPages);
    }
    const page = await pdf.getPage(i);

    // 1. Get the viewport at a scale to fit the 2880x1620 canvas
    const pageViewport = page.getViewport({ scale: 1 });
    const sX = CANVAS_W / pageViewport.width;
    const sY = CANVAS_H / pageViewport.height;
    const scale = Math.min(sX, sY);
    const renderViewport = page.getViewport({ scale });

    // 2. Render PDF page to a temporary canvas of its actual fitted size
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = renderViewport.width;
    tempCanvas.height = renderViewport.height;
    const tempCtx = tempCanvas.getContext('2d')!;
    await page.render({ canvasContext: tempCtx, viewport: renderViewport, canvas: tempCanvas }).promise;

    // 3. Create the main canvas with uniform size
    const mainCanvas = document.createElement('canvas');
    mainCanvas.width = CANVAS_W;
    mainCanvas.height = CANVAS_H;
    const mainCtx = mainCanvas.getContext('2d')!;

    // Fill white background
    mainCtx.fillStyle = '#ffffff';
    mainCtx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    // Center the tempCanvas on mainCanvas
    const offsetX = (CANVAS_W - renderViewport.width) / 2;
    const offsetY = (CANVAS_H - renderViewport.height) / 2;
    mainCtx.drawImage(tempCanvas, offsetX, offsetY);

    const blob: Blob = await new Promise((res) => mainCanvas.toBlob((b) => res(b!), 'image/png'));
    
    // Upload page image to R2 bucket
    const uploadId = `${crypto.randomUUID()}-${file.name}-page-${i}.png`.replace(/[^a-zA-Z0-9.]/g, '-');
    const uploadUrl = `${SYNC_WORKER_URL}/api/uploads/${uploadId}`;
    
    const response = await fetch(uploadUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'image/png',
      },
      body: blob,
    });

    if (!response.ok) {
      throw new Error(`Failed to upload PDF page ${i}: ${response.statusText}`);
    }

    const frameId = createShapeId();
    const w = PAGE_W;
    const h = PAGE_H;

    const pageIdx = nextIndex;
    const currentY = y;

    ops.push(() => {
      // 1. Create the parent frame
      editor.createShape({
        id: frameId,
        type: 'frame',
        x: 0,
        y: currentY,
        props: { w, h, name: `Page ${pageIdx + 1}` },
        meta: { pageIndex: pageIdx },
      });

      // 2. Register the asset in Tldraw
      const assetId = `asset:${crypto.randomUUID()}` as any;
      editor.createAssets([
        {
          id: assetId,
          type: 'image',
          typeName: 'asset',
          props: {
            name: `${file.name}-page-${i}`,
            src: uploadUrl,
            w,
            h,
            mimeType: 'image/png',
            isAnimated: false,
          },
          meta: {},
        },
      ]);

      // 3. Create the child image shape inside the frame
      editor.createShape({
        type: 'image',
        parentId: frameId,
        x: 0,
        y: 0,
        props: { w, h, assetId },
      });
    });

    nextIndex++;
    y += h + 50;
  }

  // Batch create frames and image shapes inside a single transaction
  editor.run(() => ops.forEach((op) => op()));
}

/**
 * Uploads an image file to the backend uploads pipeline and creates
 * a single frame shape matching its dimensions, containing the image.
 */
export async function importImage(editor: Editor, file: File) {
  const SYNC_WORKER_URL = (process.env.NEXT_PUBLIC_SYNC_WORKER_URL || 'http://localhost:8787').replace(/\/+$/, '');
  const PAGE_W = 1440;
  const PAGE_H = 810;
  const CANVAS_W = 2880;
  const CANVAS_H = 1620;

  // 1. Get image dimensions
  const img: HTMLImageElement = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error('Failed to load image element'));
      i.src = reader.result as string;
    };
    reader.onerror = () => reject(new Error('FileReader failed'));
    reader.readAsDataURL(file);
  });

  const imgW = img.naturalWidth || 800;
  const imgH = img.naturalHeight || 600;

  // 2. Render image onto a uniform-sized 2880x1620 canvas filled with white
  const mainCanvas = document.createElement('canvas');
  mainCanvas.width = CANVAS_W;
  mainCanvas.height = CANVAS_H;
  const mainCtx = mainCanvas.getContext('2d')!;

  mainCtx.fillStyle = '#ffffff';
  mainCtx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  // Calculate scale to fit image in 2880x1620
  const sX = CANVAS_W / imgW;
  const sY = CANVAS_H / imgH;
  const scale = Math.min(sX, sY);

  const renderW = imgW * scale;
  const renderH = imgH * scale;
  const offsetX = (CANVAS_W - renderW) / 2;
  const offsetY = (CANVAS_H - renderH) / 2;

  mainCtx.drawImage(img, offsetX, offsetY, renderW, renderH);

  const blob: Blob = await new Promise((res) => mainCanvas.toBlob((b) => res(b!), 'image/png'));

  // 3. Upload image to R2 bucket
  const uploadId = `${crypto.randomUUID()}-${file.name}.png`.replace(/[^a-zA-Z0-9.]/g, '-');
  const uploadUrl = `${SYNC_WORKER_URL}/api/uploads/${uploadId}`;
  
  const response = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'image/png',
    },
    body: blob,
  });

  if (!response.ok) {
    throw new Error(`Failed to upload image: ${response.statusText}`);
  }

  // Calculate coordinates for the new frame
  const nextIndex = getNextPageIndex(editor);
  const pages = getPagesSorted(editor);
  const y = pages.length
    ? pages[pages.length - 1].y + ((pages[pages.length - 1].props.h as number) ?? 0) + 50
    : 0;

  const frameId = createShapeId();
  const w = PAGE_W;
  const h = PAGE_H;

  editor.run(() => {
    // 1. Create the parent frame
    editor.createShape({
      id: frameId,
      type: 'frame',
      x: 0,
      y,
      props: { w, h, name: `Page ${nextIndex + 1}` },
      meta: { pageIndex: nextIndex },
    });

    // 2. Register the asset in Tldraw
    const assetId = `asset:${crypto.randomUUID()}` as any;
    editor.createAssets([
      {
        id: assetId,
        type: 'image',
        typeName: 'asset',
        props: {
          name: file.name,
          src: uploadUrl,
          w,
          h,
          mimeType: 'image/png',
          isAnimated: false,
        },
        meta: {},
      },
    ]);

    // 3. Create the child image shape inside the frame
    editor.createShape({
      type: 'image',
      parentId: frameId,
      x: 0,
      y: 0,
      props: { w, h, assetId },
    });
  });
}

