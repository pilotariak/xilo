# SPDX-FileCopyrightText: Copyright (C) Nicolas Lamirault <nicolas.lamirault@gmail.com>
# SPDX-License-Identifier: Apache-2.0

BANNER = X I L O

SHELL = /bin/bash -o pipefail

DIR = $(shell pwd)

NO_COLOR=\033[0m
OK_COLOR=\033[32;01m
ERROR_COLOR=\033[31;01m
WARN_COLOR=\033[33;01m
INFO_COLOR=\033[36m
WHITE_COLOR=\033[1m
MAKE_COLOR=\033[33;01m%-20s\033[0m

.DEFAULT_GOAL := help

OK=[🟢]
KO=[🔴]
WARN=[🟠]
INFO=[🔵]

.PHONY: help
help:
	@echo -e "$(OK_COLOR)      $(BANNER)$(NO_COLOR)"
	@echo "------------------------------------------------------------------"
	@echo ""
	@awk 'BEGIN {FS = ":.*##"; printf "Usage: make ${INFO_COLOR}<target>${NO_COLOR}\n"} /^[a-zA-Z_-]+:.*?##/ { printf "  ${INFO_COLOR}%-25s${NO_COLOR} %s\n", $$1, $$2 } /^##@/ { printf "\n${WHITE_COLOR}%s${NO_COLOR}\n", substr($$0, 5) } ' $(MAKEFILE_LIST)
	@echo ""

guard-%:
	@if [ "${${*}}" = "" ]; then \
		echo -e "$(ERROR_COLOR)Environment variable $* not set$(NO_COLOR)"; \
		exit 1; \
	fi

check-%:
	@if $$(hash $* 2> /dev/null); then \
		echo -e "$(OK_COLOR)$(OK)$(NO_COLOR) $*"; \
	else \
		echo -e "$(ERROR_COLOR)$(KO)$(NO_COLOR) $*"; \
	fi

##@ Development

.PHONY: install
install: ## Install dependencies
	@echo -e "$(INFO)$(INFO_COLOR)[Install] Processing $(NO_COLOR)"
	npm install

.PHONY: build
build: ## Build the project
	@echo -e "$(INFO)$(INFO_COLOR)[Build] Processing $(NO_COLOR)"
	npm run build

.PHONY: test
test: ## Run tests
	@echo -e "$(INFO)$(INFO_COLOR)[Test] Processing $(NO_COLOR)"
	npm test

.PHONY: lint
lint: ## Run linter
	@echo -e "$(INFO)$(INFO_COLOR)[Lint] Processing $(NO_COLOR)"
	npm run lint

.PHONY: format
format: ## Format code
	@echo -e "$(INFO)$(INFO_COLOR)[Format] Processing $(NO_COLOR)"
	npm run format

.PHONY: clean
clean: ## Clean project
	@echo -e "$(INFO)$(INFO_COLOR)[Clean] Processing $(NO_COLOR)"
	rm -rf dist/ build/ node_modules/
