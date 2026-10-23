# The overview page

The section's `index`: it draws the whole shape once, so every other page can assume it. Sections in this order, each one only if the system has it.

**Lead.** One sentence on the system's shape in claims (how many processes, where state lives, how it reaches the outside), one on what this page does and what the pages below do.

**At a glance.** A `flowchart LR` with every process, store and external system from the survey, grouped by where it runs (`subgraph` per machine or trust zone). Below it, one bullet per box group: bold name, its role in one sentence.

**System context.** A `flowchart TB` that adds the entrances: every public route, tunnel, private network and the direction each connection is opened in. Below it, a paragraph naming exactly which paths are public and why, linking the decisions.

**The pages in this section.** Table `Page | What it covers`, one row per page from the cut, the second column a comma list of the topics a reader would search for.

**Processes / deployables.** Table `Process | Entry point | Role`, then the paragraph on why they are split the way they are, with its decision link.

**The main flow.** One `sequenceDiagram` of the happy path across the processes, from the event arriving to the result leaving, marking each transaction boundary.

**The code layout.** An annotated `text` tree of the top-level modules, each with one line on what it holds and what it never holds. Then **the boundaries that decide where a change goes**: two or three bullets of the form "**The core knows no domain.** …".

**Where the design documents fit.** A callout naming the older design documents and stating precedence: where they differ, the code and the decision records are right.

Done when every process, store, external system and entrance from the survey appears in a diagram, and every page of the section appears in the table.
