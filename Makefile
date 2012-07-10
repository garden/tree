# Makefile: start/stop and manage your tree server.
# Copyright © 2011 Jan Keromnes, Thaddee Tyl. All rights reserved.
# The following code is covered by the GPLv2 license.

# The output of console.log statements goes in this file when you `make`.
LOG = Log

# The name of your main server file.
SERVER = app.js

# The pid of the process (stored in a file).
PID = .pid

ifdef SECURE
  PORT ?= 443
  SECURE = yes
else
  PORT ?= 80
  SECURE = no
endif
DEBUG ?= 0

RUNTREE = '  \
  node $(SERVER) $(PORT) $(SECURE) $(DEBUG) >> $(LOG) 2>&1 &  \
  if [ $$! -ne "0" ]; then echo $$! > $(PID); fi;  \
  chmod a+w $(PID);'

start: stop web/ node_modules/bcrypt/
	@echo "start"
	@if [ `id -u` -ne "0" -a $(PORT) -lt 1024 ];  \
	then  \
	  sudo -p 'Password to run server as root: ' echo;  \
	  sudo -n sh -c $(RUNTREE);  \
	else  \
	  sh -c $(RUNTREE); \
	fi

stop:
	@echo "stop"
	@if [ -e $(PID) ]; then  \
	  kill $$(cat $(PID)) 2>/dev/null || sudo kill $$(cat $(PID));  \
	  rm $(PID);  \
	fi

clean:
	@# WARNING: This operation deletes server logs.
	@echo "clean"
	@rm -rf $(LOG)

save:
	@if [ -e web/.git ]; then mv web/.git .git-bk; fi
	@cp -r web/* plugs/
	@cp -r meta plugs/
	@if [ -e .git-bk ]; then mv .git-bk web/.git; fi
	@echo 'You may now commit what is in plugs/.'

load:
	@# WARNING: This operation overwrites files in web/.
	@if [ -e web/meta ]; then mv web/meta meta-bk; fi
	@cp -rf plugs/* web/
	@cp -rf web/meta/* meta/
	@rm -rf web/meta/
	@if [ -e meta-bk ]; then mv meta-bk web/meta; fi

test:
	node lib/test.js

init: web/ node_modules/bcrypt/

web/: plugs/
	@if [ -e web ]; then rm -r web; fi  # Otherwise cp -r would behave wrong.
	@if [ -e meta ]; then rm -r meta; fi
	@cp -r plugs web
	@mv web/meta .
	@rm -rf web/.git

plugs/:
	@git clone http://github.com/garden/plugs

node_modules/bcrypt/:
	@npm install bcrypt

# We mustn't update everything simultaneously – or else debugging
# whatever might break with the update becomes painful.
update:
	@npm update

update-camp:
	@npm update camp

update-ot:
	@npm update operational-transformation

https.key:
	@openssl genrsa -aes256 -out https.key 1024

https.csr: https.key
	@openssl req -new -key https.key -out https.csr

https.crt: https.key https.csr
	@openssl x509 -req -days 365 -in https.csr -signkey https.key -out https.crt

rmhttps:
	@echo "delete https credentials"
	@rm -rf https.key https.csr https.crt

https: https.crt

help:
	@cat Makefile | less

wtf ?: help

coffee:
	@echo "\n           )      (\n           (  )   )\n         _..,-(--,.._\n      .-;'-.,____,.-';\n     (( |            |\n      \`-;            ;\n         \\          /\n      .-''\`-.____.-'''-.\n     (     '------'     )\n      \`--..________..--'\n";

me a:
	@cd .

sandwich:
	@if [ `id -u` = "0" ] ; then echo "OKAY." ; else echo "What? Make it yourself." ; fi

.PHONY: start stop clean save load test update update-camp update-ot https help wtf ? coffee me a sandwich

