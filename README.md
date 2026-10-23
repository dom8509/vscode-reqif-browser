# ReqIF Browser for VS Code

Opens `.reqif` and `.reqifz` files (the [OMG Requirements Interchange
Format](https://www.omg.org/spec/ReqIF/), as exported by DOORS, Polarion,
codebeamer, PTC and others) as a table with a table of contents. Read-only:
the file is never changed.

## Using it

- **Open a file:** any `*.reqif` or `*.reqifz` opens in the browser. To see
  the XML of a `.reqif`, run *ReqIF: Open ReqIF as Text*; the preview icon in
  the editor title goes back.
- **Documents:** every specification in the file is one document. A
  `.reqifz` can hold several `.reqif` files with several specifications
  each. Pick the document at the top left, or choose *All documents* to see
  every document in one table (with a *Document* column) and to filter
  across all of them.
- **Table of contents:** on the left, the chapters with their numbers
  (1, 1.1, 1.2, …). Click a chapter to jump to it, also in another document.
  While you scroll, the chapter you are reading is marked. *+* and *−* expand
  and collapse all; ◧ in the toolbar hides the contents, and the edge
  between contents and table resizes them. With a filter, chapters without
  a match are dimmed.
- **Columns:**
  - *Hide:* the × that shows when you point at a header, or uncheck the
    column under *Columns ▾*.
  - *Move:* drag a header onto another one, or drag the column in the
    *Columns ▾* list.
  - *Resize:* drag the right edge of a header; double-click the edge for
    the first width again.
  - *Columns ▾ → Show all* shows every column, *Reset* goes back to the
    first layout. The layout is kept per file.
- **Built-in columns:** **#** is the chapter number, **Text** shows the
  chapter's title for a chapter and `ReqIF.Text` (or the first rich-text
  attribute) for a requirement, indented by its depth in the hierarchy, as
  DOORS shows its main column. **ID** is the object's ReqIF identifier.
  `ReqIF.ChapterName` and `ReqIF.Text` start hidden because *Text* shows
  them; show them under *Columns ▾*.
- **Filters:** the search box searches every shown column; the field under
  each header filters that column. All filters apply together.
  - `kW laden`: every word must occur (case does not matter).
  - `"Status LED"`: the phrase as written.
  - `-draft`: must not occur.
  - `/^LH-0\d+$/`: a regular expression.

- **Filter rules:** *Filter ▾* builds filters as in vscode-bases. *+ Add
  filter* adds a condition: a column (also a hidden one), an operator and a
  value. The value field suggests the values the column holds.
  - Operators: *is*, *is not*, *contains*, *does not contain*, *starts
    with*, *ends with*, *is empty*, *is not empty*, *>*, *≥*, *<*, *≤*,
    *matches regex*. Case does not matter. *is* matches one value of a
    list, so `Verification is Test` finds "Test, Analysis".
  - *>* and *<* compare numbers as numbers; dates (`2026-01-31`) and text
    in order.
  - The top line says how the conditions join: *All* (and), *Any* (or) or
    *None* (not). *+ Add filter group* adds a group with its own choice, so
    `Status is Approved and (Priority ≤ 1 or Safety relevant is true)`
    works. × removes a condition or group.
  - The button shows how many conditions filter. The rules are kept per
    file, also after VS Code restarts.
  - **Saved filters, for every file:** *Save as…* saves the rules under a
    name. The list at the top of the panel has them in every ReqIF file
    you open, in any workspace; pick one to use its rules. Change them and
    the button shows `*`: *Update* saves the change into the named filter,
    *Revert* goes back to it. *Delete* removes it everywhere. A condition
    on a column a file does not have shows "(not in this document)"; there
    the column counts as empty.

  *Context* keeps the chapters and parents of each match, dimmed, so you can
  see where a match is. *Clear filters* empties the search, the column filters and the rules. Ctrl+F (Cmd+F)
  goes to the search box.
- **Rich text:** XHTML attributes show formatted: paragraphs, lists,
  tables, bold, italic. Pictures embedded in a `.reqifz`, or next to a
  `.reqif`, show in the cell; other embedded files show as 📎 with their
  name. *Compact rows* cuts long cells short.
- **Copy an ID:** double-click a cell in **#** or **ID**.
- **Large files:** the table draws rows as you scroll, so files with tens
  of thousands of requirements open fast. When the file changes on disk (a
  new export), the browser reloads it and keeps your filters and layout.

### Chapters

ReqIF has no fixed notion of a heading, so the browser decides:

1. An object with a value in `ReqIF.ChapterName` is a chapter (DOORS,
   Polarion and most other tools).
2. An object whose type is named like *Heading*, *Überschrift*, *Chapter*,
   *Kapitel* or *Section* is a chapter.
3. In a file without `ReqIF.ChapterName`, an object with children is a
   chapter.

A chapter's title is its `ReqIF.ChapterName`, else `ReqIF.Name`, else the
first line of `ReqIF.Text`.

## Develop

```sh
npm install
npm run build      # or: npm run watch
npm run check      # typecheck, tests, build
npm run sample     # writes sample/lastenheft.reqif and sample/project.reqifz
```

Press F5 in VS Code to start an Extension Development Host with the `sample`
folder open. `npm run package` builds a `.vsix` to install with *Extensions:
Install from VSIX…*. A tag `v1.2.3` builds a release with the `.vsix` on
GitHub.

## Layout of the code

- `src/core/` reads files and holds the logic, with no VS Code in it:
  `reqif.ts` (ReqIF XML → documents, rows, table of contents), `load.ts`
  (`.reqifz` archives), `filter.ts`, `savedFilters.ts`, `layout.ts` (columns), `xhtml.ts`.
- `src/host/reqifEditor.ts` is the read-only custom editor: it reads the file
  and sends the documents to the webview.
- `webview/` is the table, the table of contents and the filters; filtering
  runs here, so typing stays fast.
