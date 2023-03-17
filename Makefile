node_modules: package-lock.json
	npm install --no-save
	@touch node_modules

.PHONY: deps
deps:
	yarn

.PHONY: lint
lint: node_modules
	npx eslint --color .

.PHONY: test
test: lint node_modules
	npx vitest

.PHONY: publish
publish: node_modules
	git push -u --tags origin master
	npm publish

.PHONY: update
update: node_modules
	npx updates -cu
	rm -rf node_modules package-lock.json
	npm install
	@touch node_modules

.PHONY: patch
patch: test
	npx versions patch package.json package-lock.json
	@$(MAKE) --no-print-directory publish

.PHONY: minor
minor: test
	npx versions minor package.json package-lock.json
	@$(MAKE) --no-print-directory publish

.PHONY: major
major: test
	npx versions major package.json package-lock.json
	@$(MAKE) --no-print-directory publish
