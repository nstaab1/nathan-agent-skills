---
name: deck
description: Slides and speaker notes for Nathan's Slidev decks, covering the shared theme, block tags, click-stepped code and the PNG look check. Use when writing or editing a deck's slides or notes, putting code on a slide, or checking how a slide looks.
---

# Deck

A **deck** is a Slidev deck wearing the shared Dungeon and Lintel theme. The official `slidev` skill holds Slidev's syntax. Load it for anything this skill doesn't cover. This skill holds the house conventions every deck follows. The repo's `AGENTS.md` repo rules and the deck's plan file hold what belongs to one repo or one talk, and they win where they are more specific.

## Making a slide change

1. **Find the block.** Read the deck's plan file and the ticket or spec row for the blocks you are touching. Done when you can name each block's id, minutes, end time and place on the cut list.
2. **Read the current slides** through Slidev's MCP server (see [Tools](#tools)).
3. **Edit the Markdown.** Write slides by [Theme](#theme), [Block tags](#block-tags), [Code on a slide](#code-on-a-slide) and [Demo slides](#demo-slides), and notes by [Speaker notes](#speaker-notes). Words on slides and in notes follow the talk's `GLOSSARY.md`. Run `/unslop` on the text you wrote.
4. **Look.** Run the [look check](#the-look-check) on every slide you changed.
5. **Run the checks.** The deck check and the browser check, from the repo's `package.json` scripts. Done when both pass.

The change is done when every changed slide has a clean PNG in both skins and both checks pass. Name the slides you looked at when you report.

## Tools

| Job | Use |
| --- | --- |
| Changing a slide or a note | The slide Markdown, so every change is a reviewable diff |
| Reading slides, finding a slide's number, jumping every open browser to one slide | Slidev's MCP server, from the repo's `.mcp.json` |
| Seeing a slide | PNG export, then open the PNG |

## Theme

- One theme folder serves every deck in the repo, so a theme change is a change to every deck. Run the look check on a sample of each deck's slides.
- Use Slidev's default layouts. `layout: none` drops the wrapper the theme styles, and the slide renders unstyled.
- A content slide opens with a kicker line over its title:

  ```md
  <p class="kicker">Act 1 · Local or cloud?</p>

  ## Compare the two transcripts
  ```

- Colours come from the theme's CSS variables, so the slide recolours when L flips the skin. A hard-coded colour reads in one skin and fails in the other.
- Mermaid draws inside a shadow root that the theme's CSS can't reach, so a Mermaid diagram keeps one set of colours in both skins. Draw a diagram that has to recolour as HTML boxes. Keep Mermaid for diagrams whose colours, set in the diagram's init block, read in both skins.
- A drawing that appears on more than one slide is one Vue component fed props. Each slide passes its props, so every slide shows the same drawing.
- Everything the deck loads is in the repo: fonts as local files, images, and video as `*.mp4` under LFS. The browser check fails on any request off localhost.

## Block tags

A **block** is one row of the deck's plan file, a segment of the run of show.

- The first slide of every block carries `block: <id>` in its frontmatter, breaks included. Later slides carry no `block:` key and belong to the last tagged slide before them.
- Adding, dropping, renaming or reordering a block changes the plan file and the tags in the same commit. The deck check fails until they agree.

## Code on a slide

- Import code from a committed copy with Slidev's `<<<`, so the slide shows code that compiles:

  ```md
  <<< @/snippets/act-1/transcribe.ts#hosted ts {all|4-6|9|all}
  ```

- The repo's copy command makes the copies and records the source commit. To change code on a slide, fix it at its source and re-run the copy command.
- Click steps open on `all` so the room sees the shape, step through the lines that matter a few at a time, and end on `all`. Each step gets a `[click]` paragraph in the notes.
- Code fits one screen. If the look check shows the code panel scrolling or lines wrapping, import a smaller region.

## Demo slides

A **demo** is a live run on stage. Each demo has one demo slide, marked in its frontmatter with the demo's name:

```md
---
demo: madam-eva
---
```

The name is kebab case and unique in the deck. A demo that fills a whole block takes the block id, such as `demo: rs1`. The demo slide is up during the live run, and the recorded fallback goes there later under the same name, such as `madam-eva.mp4`. Its notes carry the demo's command and fallback cue.

## Speaker notes

Notes are the HTML comment at the end of a slide. The presenter reads them at a glance mid-talk, so write short paragraphs with the action first.

The first slide of every block carries:

- what to say and do
- what the room does or sees
- the block's minutes and its end time, from the plan file
- its place on the cut list and what the cut means, when it has one
- for a demo, the command and the fallback cue: when to stop trying live, and what to do instead

A click-stepped slide carries one `[click]` paragraph per click, in order, saying what to point at. Slidev highlights each paragraph as the presenter clicks.

Notes reach only the stage build. The deck check plants a sentinel note and fails if it shows up in the public bundle.

## The look check

Markdown hides overflow, clipped labels and a washed-out accent. A PNG shows them.

1. Export PNGs of the changed slides in both skins with the repo's export command. Export a click-stepped slide with its clicks.
2. Open every PNG and look for:
   - text past the frame or under the code panel
   - code that wraps, clips or scrolls
   - clipped diagram labels
   - click steps that overprint each other
   - accent or secondary text faint against its background
   - any difference between the skins other than colour
3. Fix and re-export until every PNG is clean.

Done when every changed slide has a clean PNG in Dungeon and in Lintel.
