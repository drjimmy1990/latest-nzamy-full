/**
 * Thin Word adapter over the official Office.js API. NOT tested outside Word:
 * it needs a real Word host (sideload on staging). All decisions live in src/core.
 * Minimal structural types so this file compiles without @types/office-js.
 */
                        

export async function readParagraphs()                    {
  return Word.run(async (ctx     ) => {
    const ps = ctx.document.body.paragraphs; ps.load("items/text");
    await ctx.sync();
    return ps.items.map((p     ) => String(p.text));
  });
}

export async function readSelection()                                                    {
  return Word.run(async (ctx     ) => {
    const sel = ctx.document.getSelection(); sel.load("text");
    const para = sel.paragraphs.getFirst(); para.load("text");
    const all = ctx.document.body.paragraphs; all.load("items/text");
    await ctx.sync();
    // Match by LOCATION, not text: two identical paragraphs must not resolve to the first one.
    const startOfSel = para.getRange("Start");
    const cmp = all.items.map((p     ) => p.getRange("Start").compareLocationWith(startOfSel));
    await ctx.sync();
    const idx = cmp.findIndex((c     ) => c.value === "Equal");
    return { text: String(sel.text || para.text), paragraphIndex: idx };
  });
}

/** Move the Word selection to a paragraph (used to jump to a client comment). */
export async function selectParagraph(paragraphIndex        )                {
  await Word.run(async (ctx     ) => {
    const ps = ctx.document.body.paragraphs; ps.load("items");
    await ctx.sync();
    const p = ps.items[paragraphIndex];
    if (!p) throw new Error("paragraph_not_found");
    p.select();
    await ctx.sync();
  });
}

/** Replace as a TRACKED change so the lawyer accepts/rejects natively (owner decision). */
export async function replaceTracked(paragraphIndex        , newText        )                {
  await Word.run(async (ctx     ) => {
    ctx.document.load("changeTrackingMode");
    await ctx.sync();
    const previousMode = ctx.document.changeTrackingMode;
    ctx.document.changeTrackingMode = Word.ChangeTrackingMode.trackAll;
    const ps = ctx.document.body.paragraphs; ps.load("items");
    await ctx.sync();
    const p = ps.items[paragraphIndex];
    if (!p) throw new Error("paragraph_not_found");
    p.insertText(newText, Word.InsertLocation.replace);
    await ctx.sync();
    ctx.document.changeTrackingMode = previousMode; // do not leave the lawyer's document in a mode they did not choose
    await ctx.sync();
  });
}

export async function addComment(paragraphIndex        , body        )                {
  await Word.run(async (ctx     ) => {
    const ps = ctx.document.body.paragraphs; ps.load("items");
    await ctx.sync();
    const p = ps.items[paragraphIndex];
    if (!p) throw new Error("paragraph_not_found");
    p.getRange("Whole").insertComment(body);
    await ctx.sync();
  });
}

/** Whole file as base64 (for case upload / vault). */
export async function getDocumentBase64()                  {
  return new Promise((resolve, reject) => {
    (globalThis       ).Office.context.document.getFileAsync("compressed", { sliceSize: 262144 }, (r     ) => {
      if (r.status !== "succeeded") return reject(new Error("get_file_failed"));
      const file = r.value; const chunks               = []; let i = 0;
      const next = () => file.getSliceAsync(i, (s     ) => {
        if (s.status !== "succeeded") { file.closeAsync(); return reject(new Error("slice_failed")); }
        chunks.push(new Uint8Array(s.value.data));
        if (++i < file.sliceCount) return next();
        file.closeAsync();
        let bin = ""; for (const c of chunks) for (const b of c) bin += String.fromCharCode(b);
        resolve(btoa(bin));
      });
      next();
    });
  });
}
