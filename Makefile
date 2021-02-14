# Makefile: start/stop and manage your tree server.
SHELL = bash

# The output of console.log statements goes in this file when you `make`.
LOG = admin/log/tree.log
# The pid of the process (stored in a file).
PID = .pid
# The current date in ISO 8601 format.
DATE = $(shell date "+%Y%m%dT%H%M%S%z")
TLS_CIPHER_LIST = 'TLS_CHACHA20_POLY1305_SHA256:TLS_AES_128_GCM_SHA256:TLS_AES_256_GCM_SHA384'

default: stop install start

run:
	@echo "[tree] run"
	node --tls-cipher-list=$(TLS_CIPHER_LIST) \
	  ./app.js >> $(LOG) 2>&1

start: stop
	@echo "[tree] start"
	@port=$$(jq .http.port -r <./admin/private/env.json); \
	host=$$(jq .http.host -r <./admin/private/env.json); \
	if [ `id -u` -ne "0" -a "$$port" -lt 1024 ]; \
	then \
	  sudo -p '[sudo] password for $(USER): ' echo; \
	  sudo -n bash -c 'make run' &  \
	else \
	  make run & \
	fi; \
	if [ $$! -ne "0" ]; then echo $$! > $(PID); fi; \
	echo "[info] tree running on http://$$host:$$port (see $(LOG))"; \
	echo "[info] use 'make stop' to kill it"

stop:
	@echo "[tree] stop"
	@if [ -e $(PID) ]; then \
	  ps -p $$(cat $(PID)) >/dev/null 2>&1; \
	  if [ $$? -eq 0 ]; then \
	    pgid="$$(ps -q "$$(cat $(PID))" -o pgid=)"; \
	    pkill -g "$$pgid" 2>/dev/null || sudo pkill -g "$$pgid"; \
	  fi; \
	  rm $(PID); \
	fi

stopdb:
	@cockroach quit --certs-dir admin/db/certs

restart: stop start

save:
	@if [ -e web/.git ]; then mv web/.git .git-bk; fi
	@cp -r web/* plugs/
	@rm -rf plugs/test/
	@cat metadata.json | jq 'del(.files.test)' > plugs/metadata.json
	@if [ -e .git-bk ]; then mv .git-bk web/.git; fi
	@echo "[info] you may now commit what is in plugs/"

load:
	@# WARNING: This operation overwrites files in web/.
	@if [ ! -e web/ ]; then mkdir web; fi
	@# We must not copy the metadata to web/.
	@mv plugs/metadata.json plug-metadata.json
	@cp -rf plugs/* web/
	@cp plug-metadata.json new-metadata.json
	@if [ -e metadata.json ]; then \
	  jq -s '.[0] * .[1]' metadata.json plug-metadata.json >new-metadata.json; \
	fi
	@mv new-metadata.json metadata.json
	@mv plug-metadata.json plugs/metadata.json
	@echo "[info] deployed web/ and metadata from plugs/"

backup:
	@mkdir -p backup
	@tar cf backup/web-$(DATE).tar web
	@tar --append -f backup/web-$(DATE).tar metadata.json
	@cockroach dump tree --certs-dir admin/db/certs >backup/tree-$(DATE).sql
	@tar --append -f backup/web-$(DATE).tar tree.sql
	@xz <backup/web-$(DATE).tar >backup/web-$(DATE).tar.xz
	@rm backup/web-$(DATE).tar
	@echo "[info] copied web/, metadata and database to backup/web-$(DATE).tar.xz"

restore:
	@tar xf "$$(ls backup/*.tar.xz | tail -1)"
	@db_host=$$(jq <admin/private/env.json -r .pg.host); \
	cockroach sql -e 'drop database '"$$db_host"' cascade; '\
	'create database '"$$db_host" --certs-dir admin/db/certs && \
	cockroach sql -d tree <tree.sql --certs-dir admin/db/certs
	@echo '[info] deployed web/, metadata and database from '"$$(ls backup/*.tar.xz | tail -1)"

# When files move around in web/, some dead metadata entries stay in metadata.
# They need to be garbage collected from time to time.
gc:
	node ./tools/meta/rebuild

test:
	node lib/test.js

install: install-bin web/ node_modules/

install-bin:
	@bash admin/setup/install.sh

web/: plugs/
	@if [ ! -e web/ ]; then \
		echo "[install] extracting web"; \
		make load; \
	fi

plugs/:
	@echo "[install] obtaining plugs"
	@git clone http://github.com/garden/plugs

node_modules/:
	@echo "[install] npm dependencies"
	# libicu-dev is needed for nodemailer.
	@sudo apt install libicu-dev
	@npm install

uninstall:
	@bash admin/setup/uninstall.sh

update-camp:
	npm update camp

update-ot:
	npm update ot
	curl 'https://raw.githubusercontent.com/Operational-Transformation/ot.js/master/dist/ot-min.js' > web/lib/js/ot-min.js
	curl 'https://raw.githubusercontent.com/Operational-Transformation/ot.js/master/dist/ot.js' > web/lib/js/ot.js

privkey.pem:
	@echo "[https] generating privkey.pem KEY"
	@cd admin/private/https; openssl genrsa -aes256 -out privkey.pem 1024

fullchain.pem: privkey.pem
	@echo "[https] generating fullchain.pem CSR"
	@cd admin/private/https; openssl req -new -key privkey.pem -out fullchain.pem

cert.pem: privkey.pem fullchain.pem
	@echo "[https] generating cert.pem CRT"
	@cd admin/private/https; openssl x509 -req -days 365 -in fullchain.pem -signkey privkey.pem -out cert.pem

rmhttps:
	@echo "[https] deleting https credentials"
	@rm -rf admin/private/https/*

https: cert.pem
	@echo "[info] you can now use privkey.pem, fullchain.pem, cert.pem"

jail:
	@echo "[jail] Constructing the program jail."
	cd jail && sudo docker build -t tree-jail .

help:
	@cat Makefile | less

me a:
	@cd .

sandwich:
	@if [ `id -u` = "0" ] ; then echo "OKAY." ; else echo "What? Make it yourself." ; fi

.PHONY: default run install install-bin uninstall start stop restart save load backup gc test update-camp update-ot rmhttps https jail help me a sandwich
