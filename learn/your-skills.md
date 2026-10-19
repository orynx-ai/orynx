<!-- learn-sources: packages/contracts/src/orynx-skills.ts packages/core/src/skills/skill-file.ts packages/core/src/skills/skill-store.ts packages/core/src/skills/starters.ts packages/core/src/routes/orynx-skills.ts packages/api-client/src/endpoints/orynx-skills.ts packages/app/src/features/settings/components/skills-panel.tsx packages/app/src/features/settings/components/skill-list.tsx packages/app/src/features/settings/components/skill-editor.tsx packages/app/src/features/settings/components/delete-skill.tsx packages/app/src/features/settings/components/discard-skill-changes.tsx packages/app/src/features/settings/components/skills-bar-actions.tsx packages/ui/src/components/list-nav.tsx -->

# Your skills: where they live, and how the editor saves them

Spec 023 added Settings › Skills, after Coding agent. A skill tells Claude how to do one kind of work ("Bug bash", "How we review"). You write it once in Orynx; in a session you name it with `/bug-bash` in the composer (Part B, built on spec 022's `/` list). Unlike the other Settings tabs, a skill doesn't save as you type: it saves when you press Save skill.

The API lives under `/api/skills/orynx` (`orynx-skills.ts` in contracts, core and the client); `GET /api/skills` is the composer's `/` list from spec 022 (`skills.ts`).

## Where it lives

One `SKILL.md` per skill, in Claude Code's format, under `<DEVHUB_HOME>/plugin/skills/<folder>/`:

```markdown
---
name: bug-bash
description: Hunt for bugs in the code a ticket touches and list each one with steps to reproduce.
metadata:
  title: Bug bash
---

# Bug bash

1. Read the ticket and its acceptance criteria.
```

- **`name` is the folder**, which `folderFromName()` in contracts makes from the Name: lowercase, accents dropped, every run of other characters one `-`, at most 64 characters. The form shows it as you type and the server saves to it, so they never disagree. Renaming a skill moves its folder.
- **`description` is "When to use it"**, and **`metadata.title` is the Name**, the Agent Skills standard's place for extra fields. A hand-written file with no title shows its folder as its Name. The Instructions box holds everything after the frontmatter, so nothing is written twice.
- **Keys Orynx doesn't know are kept** through every save (`writeSkillFile()` in `skill-file.ts`), so a `license` or `allowed-tools` someone wrote stays.
- Folders are 0700 and files 0600. Each save writes a temporary file and renames it over `SKILL.md`, as `settings.json` does. Changes run one at a time (`oneAtATime()`), so two tabs can't both take a free folder.
- **What Orynx won't read**: a folder whose name a Name never makes (`My Skill`) isn't listed, since no request may name it. A link is skipped. A `SKILL.md` that's missing, over 64 KB, without frontmatter or with YAML `yaml` can't parse lists as "Orynx can't read this skill.", with Delete skill only.

## One save, end to end

```
Save skill ─▶ react-hook-form + SaveSkillRequestSchema     the contract's words under each field
               ▼
            PUT /api/skills/orynx/bug-bash { title, description, instructions }
               │  the folder in the URL passes SkillFolderSchema, or 400
               ▼
            SkillStore.save ─▶ folder taken? SkillRejectedError → 422 under Name
               │            ├▶ rename the folder, then write SKILL.md (renamed back if the write fails)
               │            └▶ events.publish({ type: 'skills.changed' })
               ▼
            useSaveSkill: reads the list again before it settles
               ▼
            the editor resets to what was saved; a rename moves the address to ?skill=bug-hunt
```

- **What's open lives in the address**: `/settings/skills?skill=bug-bash`, or `?new=true` for New skill, with the first skill open when it names neither. Search text stays out of it (in the list's own form), since typing must never navigate.
- **That's what makes "Discard changes" one rule.** Picking another skill, New skill, another tab, the sidebar and Back are all navigations, so one `useBlocker` in `discard-skill-changes.tsx` asks before unsaved changes go. Closing the window gets the browser's own question. Saving and deleting navigate with `ignoreBlocker`, since nothing is lost.
- **Other tabs follow.** `skills.changed` refreshes the list everywhere. The editor takes the server's new values with `keepDirtyValues`, so a field you changed here keeps your text.

## The screen

- The list is `ListNav` from `@devhub/ui`: each item's button holds only the Name, so its name is what it shows (axe's label-in-name rule), and stretches over the item; the description is the button's description.
- The page bar shows "4 skills in ~/.devhub/plugin" and New skill in place of "Changes save automatically". The count sits out of the flow before the button, so it moves nothing when the skills arrive.
- Loading shows `ListNavSkeleton` and `SkillEditorSkeleton`, built to the real heights. With no skills, "No skills yet." offers Add the starter skills (`starters.ts`, the design's four).
- The Bug bash starter's folder shows the design's callout on what it can't do yet: sessions have no network and no browser.
