# Turning Leitmotif into a git submodule

Leitmotif lives in its **own repository** (`git@github.com:soulwax/Leitmotif.git`)
and is attached to the EchoWarrior repo as a **submodule** at `tools/leitmotif/`.

The app files here have already been committed to a **local** Leitmotif git repo
(no push was performed — that needs your SSH auth). Finish the setup with the
steps below.

## Current state (done for you)

- `tools/leitmotif/` is a standalone git repo with `origin` set to
  `git@github.com:soulwax/Leitmotif.git` and one commit on `main`.
- Nothing has been pushed; the EchoWarrior parent repo does **not** yet reference
  it as a submodule.

## Step 1 — push Leitmotif to its remote (needs your SSH key)

```bash
cd d:/Workspace/Rust/EchoWarrior/tools/leitmotif
git push -u origin main
```

## Step 2 — attach it as a submodule in the EchoWarrior repo

Because `tools/leitmotif/` already contains a git repo, first move it aside so
`git submodule add` can clone it cleanly from the remote:

```bash
cd d:/Workspace/Rust/EchoWarrior

# 1. Temporarily move the local working copy out of the way.
mv tools/leitmotif tools/leitmotif.local

# 2. Add the submodule (clones from the remote you just pushed to).
git submodule add git@github.com:soulwax/Leitmotif.git tools/leitmotif

# 3. Verify it matches, then remove the local copy.
#    (They should be identical since you just pushed it.)
rm -rf tools/leitmotif.local

# 4. Commit the submodule link in the parent repo.
git add .gitmodules tools/leitmotif
git commit -m "Add Leitmotif scene-director app as a submodule at tools/leitmotif"
```

## Step 3 — how others clone

```bash
git clone --recurse-submodules <echowarrior-url>
# or, in an existing clone:
git submodule update --init --recursive
```

## Alternative (simpler, if you prefer no move)

If you'd rather not move the folder: delete the local `.git` inside
`tools/leitmotif/` (after Step 1's push), then run `git submodule add ...` — git
will clone fresh from the remote into the empty path. The move approach above is
safer because it keeps your working copy until you've verified the remote.

## Note

The parent EchoWarrior repo currently has unrelated uncommitted work from another
task. The commands above only stage `.gitmodules` and the submodule gitlink —
they will **not** commit that other work. Review `git status` before committing if
unsure.
