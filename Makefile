include all-files.mk

all: pretext/files.txt words.txt pretext/full-main.ptx

%.txt: %.xsl
	xsltproc --xinclude $< pretext/full-main.ptx > $@

pretext/files.txt: pretext/full-main.ptx make-file-list.sh
	./make-file-list.sh

words.txt: pretext/full-main.ptx $(files) words.py
	./words.py -x activity $< > $@

all-files.mk: pretext/full-main.ptx $(files)
	@echo "files := $<" > $@
	@./list-files.py -f $< | perl -pe 's/^/files += /' >> $@

pretext/full-main.ptx: pretext/main.ptx
	perl -pe 's/<!-- (.*) -->/$$1/;' $< > $@

clean:
	rm -f all-files.mk
	rm -f pretext/files.txt
	rm -f pretext/full-main.ptx
	rm -f words.txt

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

.PHONY: release-book-builder
