import type * as MuPDF from "mupdf";

function catalog(doc: MuPDF.PDFDocument) {
  const trailer = doc.getTrailer();
  try { return trailer.get("Root"); } finally { trailer.destroy(); }
}

function container(doc: MuPDF.PDFDocument, parent: MuPDF.PDFObject, key: string, array = false) {
  let value = parent.get(key);
  if (value.isNull()) {
    value.destroy();
    value = array ? doc.newArray() : doc.newDictionary();
    parent.put(key, value);
  }
  return value;
}

function putString(doc: MuPDF.PDFDocument, object: MuPDF.PDFObject, key: string, text: string) {
  const value = doc.newString(text);
  try { object.put(key, value); } finally { value.destroy(); }
}

function uniqueName(name: string, used: Set<string>) {
  let result = name, suffix = 2;
  while (used.has(result)) result = name + "_" + suffix++;
  used.add(result);
  return result;
}

// graftPage copies page contents/resources, but not annotations or the AcroForm.
// One map per input keeps widget, parent-field and appearance references shared.
export function copyPdfDocument(destination: MuPDF.PDFDocument, source: MuPDF.PDFDocument) {
  const offset = destination.countPages(), count = source.countPages();
  const links: { bounds: MuPDF.Rect; uri: string }[][] = [];

  // Remove all page back-references before grafting any connected field tree;
  // otherwise a widget's /P can recursively copy an orphaned source page tree.
  for (let index = 0; index < count; index++) {
    const page = source.loadPage(index);
    const object = page.getObject(), annotations = object.get("Annots");
    try {
      links[index] = [];
      for (const link of page.getLinks()) {
        try {
          let uri = link.getURI();
          if (!link.isExternal()) {
            const target = source.resolveLinkDestination(link);
            if (target.page < 0 || target.page >= count) continue;
            uri = destination.formatLinkURI({ ...target, page: target.page + offset });
          }
          links[index].push({ bounds: link.getBounds(), uri });
        } finally { link.destroy(); }
      }
      for (let i = annotations.length - 1; i >= 0; i--) {
        const annotation = annotations.get(i), subtype = annotation.get("Subtype");
        try {
          annotation.delete("P");
          // Recreate links with destinations in the combined document.
          if (subtype.asName() === "Link") annotations.delete(i);
        } finally { subtype.destroy(); annotation.destroy(); }
      }
    } finally { annotations.destroy(); object.destroy(); page.destroy(); }
  }

  const map = destination.newGraftMap();
  const sourceRoot = catalog(source), targetRoot = catalog(destination);
  const sourceForm = sourceRoot.get("AcroForm"), sourceFields = sourceRoot.get("AcroForm", "Fields");
  try {
    if (sourceFields.length) {
      const targetForm = container(destination, targetRoot, "AcroForm");
      const targetFields = container(destination, targetForm, "Fields", true);
      const sourceFonts = sourceForm.get("DR", "Font");
      const targetResources = container(destination, targetForm, "DR");
      const targetFonts = container(destination, targetResources, "Font");
      const defaultAppearance = sourceForm.get("DA"), defaultAlignment = sourceForm.get("Q");
      try {
        const fieldNames = new Set<string>(), fontNames = new Set<string>(), fontAliases = new Map<string, string>();
        targetFields.forEach(field => {
          const name = field.get("T");
          try { if (name.isString()) fieldNames.add(name.asString()); } finally { name.destroy(); field.destroy(); }
        });
        targetFonts.forEach((font, key) => { fontNames.add(String(key)); font.destroy(); });
        sourceFonts.forEach((font, key) => {
          const original = source.newName(String(key));
          const alias = destination.newName(uniqueName(String(key), fontNames));
          const copy = map.graftObject(font);
          try {
            targetFonts.put(alias, copy);
            fontAliases.set(original.toString(), alias.toString());
          } finally { copy.destroy(); alias.destroy(); original.destroy(); font.destroy(); }
        });
        const remapAppearance = (text: string) => text.replace(
          /\/[^\s<>{}\[\]()%]+(?=\s+[-+]?(?:\d*\.?\d+)\s+Tf\b)/g,
          name => fontAliases.get(name) || name,
        );
        const visited = new Set<string>();
        const updateField = (field: MuPDF.PDFObject) => {
          const identity = field.isIndirect() ? "ref:" + field.asIndirect() : "ptr:" + field.pointer;
          if (visited.has(identity)) return;
          visited.add(identity);
          const appearance = field.get("DA"), children = field.get("Kids");
          try {
            if (appearance.isString()) putString(source, field, "DA", remapAppearance(appearance.asString()));
            children.forEach(child => { try { updateField(child); } finally { child.destroy(); } });
          } finally { children.destroy(); appearance.destroy(); }
        };
        sourceFields.forEach(field => {
          const name = field.get("T"), appearance = field.get("DA"), alignment = field.get("Q");
          try {
            if (name.isString()) putString(source, field, "T", uniqueName(name.asString(), fieldNames));
            if (appearance.isNull() && defaultAppearance.isString()) putString(source, field, "DA", defaultAppearance.asString());
            if (alignment.isNull() && !defaultAlignment.isNull()) field.put("Q", defaultAlignment);
            updateField(field);
          } finally { alignment.destroy(); appearance.destroy(); name.destroy(); field.destroy(); }
        });
        sourceFields.forEach(field => {
          const copy = map.graftObject(field);
          try { targetFields.push(copy); } finally { copy.destroy(); field.destroy(); }
        });
        const calculations = sourceForm.get("CO");
        try {
          if (calculations.length) {
            const targetCalculations = container(destination, targetForm, "CO", true);
            try {
              calculations.forEach(field => {
                const copy = map.graftObject(field);
                try { targetCalculations.push(copy); } finally { copy.destroy(); field.destroy(); }
              });
            } finally { targetCalculations.destroy(); }
          }
        } finally { calculations.destroy(); }
      } finally {
        defaultAlignment.destroy(); defaultAppearance.destroy(); targetFonts.destroy();
        targetResources.destroy(); sourceFonts.destroy(); targetFields.destroy(); targetForm.destroy();
      }
    }

    for (let index = 0; index < count; index++) {
      map.graftPage(-1, source, index);
      const sourcePage = source.findPage(index), targetPage = destination.findPage(offset + index);
      const annotations = sourcePage.get("Annots");
      try {
        if (annotations.length) {
          const copies = map.graftObject(annotations);
          try {
            targetPage.put("Annots", copies);
            copies.forEach(annotation => { try { annotation.put("P", targetPage); } finally { annotation.destroy(); } });
          } finally { copies.destroy(); }
        }
      } finally { annotations.destroy(); targetPage.destroy(); sourcePage.destroy(); }
    }
    // Forward links need all target pages to exist before createLink resolves them.
    for (let index = 0; index < count; index++) {
      if (links[index].length) {
        const page = destination.loadPage(offset + index);
        try { for (const link of links[index]) page.createLink(link.bounds, link.uri).destroy(); } finally { page.destroy(); }
      }
    }
  } finally { sourceFields.destroy(); sourceForm.destroy(); targetRoot.destroy(); sourceRoot.destroy(); map.destroy(); }
}
