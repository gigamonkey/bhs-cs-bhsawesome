# The BHS CS books. Everything book-level takes BOOK (a book directory —
# holds book.ts, schema.rnc, source/main.ptx); the scripts/ tools take the
# same argument directly.
BOOK ?= bhsawesome

build:
	node scripts/build.ts $(BOOK)

watch:
	node scripts/watch.ts $(BOOK)

serve:
	node scripts/serve.ts $(BOOK)

check-links:
	node scripts/check-links.ts $(BOOK)

validate: $(BOOK)/schema.rng
	uv run scripts/validate.py $(BOOK)

check-ids:
	uv run scripts/check-ids.py $(BOOK)/source/main.ptx

# Every file reachable from the book root, in reading order.
files:
	uv run scripts/list-files.py $(BOOK)/source/main.ptx

# Per-section word counts (an outline-mode file), written into the book dir.
words: $(BOOK)/words.txt

$(BOOK)/words.txt: $(BOOK)/source/main.ptx scripts/words.py
	uv run scripts/words.py -x activity $< > $@

# The book schema: <book>/schema.rnc (which includes the shared
# builder/schema/core.rnc) compiles to the committed <book>/schema.rng (plus
# core.rng beside it) that scripts/validate.py (and CI) validate against.
# Regenerate after editing either .rnc (needs trang; brew install jing-trang
# / apt install trang).
schema: $(BOOK)/schema.rng

$(BOOK)/schema.rng: $(BOOK)/schema.rnc builder/schema/core.rnc
	trang -I rnc -O rng $< $@

clean:
	rm -rf build $(BOOK)/words.txt

# ---------------------------------------------------------------------------
# Releasing @peterseibel/book-builder (the builder/ workspace, consumed by
# the BJC build in bhs-cs-content). VERSION defaults to patch; override like
# `make release-book-builder VERSION=minor` (or an explicit x.y.z).
VERSION ?= patch

# Bump, tag, and publish. `npm version` bumps builder/package.json AND the
# root lockfile (workspace-aware — hence not `cd builder && npm version`,
# which would leave the root lock stale); we then commit, tag
# book-builder-v<new>, and push, which triggers the publish-book-builder
# workflow (npm Trusted Publisher / OIDC). After it publishes, `npm update
# @peterseibel/book-builder` in the sibling bhs-cs-content so the BJC build
# picks up the change.
release-book-builder:
	@git diff --quiet && git diff --cached --quiet || { \
	  echo "working tree not clean — commit or stash before releasing."; exit 1; }
	npm version $(VERSION) --workspace @peterseibel/book-builder --no-git-tag-version
	@v=$$(node -p "require('./builder/package.json').version"); \
	tag="book-builder-v$$v"; \
	git add builder/package.json package-lock.json; \
	git commit -m "book-builder: $$v"; \
	git tag -a "$$tag" -m "@peterseibel/book-builder $$v"; \
	echo "Pushing $$tag (and the current branch) to origin…"; \
	git push --follow-tags origin HEAD

.PHONY: build watch serve check-links validate check-ids files words schema clean release-book-builder
