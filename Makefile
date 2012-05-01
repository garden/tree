# Makefile: Publish your website and start/stop your server.
# Copyright © 2011 Jan Keromnes, Thaddee Tyl. All rights reserved.
# Code covered by the LGPL license.

# The output of console.log statements goes in this file when you `make`.
# Note: when you `make debug`, the output appears on the console.
LOG = node.log

# The name you gave your main server file.
SERVER = app.js

# The folder where your awesome website is.
WEB = web

ifdef SECURE
  PORT ?= 443
  SECURE = yes
else
  PORT ?= 80
  SECURE = no
endif
DEBUG ?= 0

start: stop web/ node_modules/bcrypt/
	@echo "start"
	@if [ `id -u` -ne "0" -a $(PORT) -lt 1024 ] ;  \
	then  \
	  sudo node $(SERVER) $(PORT) $(SECURE) $(DEBUG) >> $(LOG) 2>&1 ;  \
	else  \
	  node $(SERVER) $(PORT) $(SECURE) $(DEBUG) >> $(LOG) 2>&1 ;  \
	fi

stop:
	@echo "stop"
	@for pid in `ps aux | grep -v make | grep node | grep $(SERVER) | awk '{print $$2}'` ; do  \
	   kill -9 $$pid 2> /dev/null ;  \
	   if [ "$$?" -ne "0" ] ; then  \
	     sudo kill -9 $$pid 2> /dev/null ;  \
	   fi  \
	done;  \

clean:
	@echo "clean"
	@rm -rf $(LOG)

init: clean web/ node_modules/bcrypt/

web/:
	@git clone http://github.com/garden/plugs web

node_modules/bcrypt/:
	@npm install bcrypt

test:
	node lib/test.js

# We mustn't update everything simultaneously – or else debugging what has
# broken becomes painful.
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
	@echo "\n           )      (\n           (  )   )\n         _..,-(--,.._\n      .-;'-.,____,.-';\n     (( |            |\n      \`-;            ;\n         \\          /	\n      .-''\`-.____.-'''-.\n     (     '------'     )\n      \`--..________..--'\n";

me a:
	@cd .

sandwich:
	@if [ `id -u` = "0" ] ; then echo "OKAY." ; else echo "What? Make it yourself." ; fi

.PHONY: restart stop start clean test update update-camp update-ot https https.key https.csr https.crt help wtf ? coffee me a sandwich

