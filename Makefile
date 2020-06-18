lint:
	yarn -s run eslint --color .

test: lint
	yarn -s run jest --color

unittest:
	yarn -s run jest --watchAll

publish:
	git push -u --tags origin master
	npm publish

deps:
	yarn

update:
	yarn -s run updates -cu
	rm -rf node_modules
	$(MAKE) deps

patch: test
	yarn -s run versions -C patch
	$(MAKE) publish

minor: test
	yarn -s run versions -C minor
	$(MAKE) publish

major: test
	yarn -s run versions -C major
	$(MAKE) publish

.PHONY: lint test unittest publish deps update patch minor major
