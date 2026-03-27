Flow:

1. Repo prompt — accepts owner/repo or full GitHub URL
2. Branch select — fetches all branches, shows default branch first, user can pick or press Enter
3. Skills discovery — searches for skills/ or .claude/skills/ folder automatically
4. Skill listing — handles both flat (.md files) and nested (folder/SKILL.md) structures
5. Multi-select — user picks which skills to download
6. Output path — prompts where to save (defaults to ./skills)
7. Downloads — preserves structure (flat → name.md, nested → name/ folder)
