# code/

**Replace this directory.** It is where the workspace expects your product code, and it is the
one path `workspace.config.json` points at by default.

Three ways to use it, all supported:

1. **Symlink a sibling repo** — `ln -s ../my-app code`. The workspace stays a separate repo
   with its own history, which is how the original was run.
2. **Put your code here directly** — delete this file and work in `code/`.
3. **Ignore it entirely** — set `codeDirs` in `workspace.config.json` to your real paths
   (`["src", "lib"]`) and delete this directory.

Whatever is listed in `codeDirs` is the only place an edit needs a card in `board/3-build`.
Everything else — docs, the plan, the workspace itself — stays free to edit.
