# Makefile: start/stop and manage your tree server.
# Copyright © 2011 Jan Keromnes, Thaddee Tyl. All rights reserved.
# The following code is covered by the GPLv2 license.

# The output of console.log statements goes in this file when you `make`.
LOG = tree.log

# The name of your main server file.
SERVER = app.js

# The pid of the process (stored in a file).
PID = .pid

# The current date in ISO8601 format.
DATE = $$(date "+%Y%m%dT%H%M%S%z")

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

start: init stop
	@echo "[tree] start"
	@if [ `id -u` -ne "0" -a $(PORT) -lt 1024 ];  \
	then  \
	  sudo -p '[sudo] password for $(USER): ' echo;  \
	  sudo -n sh -c $(RUNTREE);  \
	  sudo chmod a+w $(LOG);  \
	else  \
	  sh -c $(RUNTREE); \
	fi; \
	echo "[info] tree running on port $(PORT) (see $(LOG))"; \
	echo "[info] use 'make stop' to kill it"

stop:
	@echo "[tree] stop"
	@if [ -e $(PID) ]; then  \
	  ps -p $$(cat $(PID)) >/dev/null 2>&1;  \
	  if [ $$? -eq 0 ]; then  \
	    kill $$(cat $(PID)) 2>/dev/null || sudo kill $$(cat $(PID));  \
	  fi;  \
	  rm $(PID);  \
	fi

restart: stop start

save:
	@if [ -e web/.git ]; then mv web/.git .git-bk; fi
	@cp -r web/* plugs/
	@cp -r meta plugs/
	@if [ -e .git-bk ]; then mv .git-bk web/.git; fi
	@echo "[info] you may now commit what is in plugs/"

load:
	@# WARNING: This operation overwrites files in web/.
	@if [ ! -e web/ ]; then mkdir web; fi
	@if [ ! -e meta/ ]; then mkdir meta; fi
	@if [ -e web/meta ]; then mv web/meta meta-bk; fi
	@cp -rf plugs/* web/
	@cp -rf web/meta/* meta/
	@cp -f web/meta/.DS-Store meta/
	@rm -rf web/meta/
	@if [ -e meta-bk ]; then mv meta-bk web/meta; fi
	@echo "[info] deployed web/ and meta/ from plugs/"

backup:
	@mkdir web$(DATE)
	@cp -r web/* web$(DATE)/
	@cp -r meta/ web$(DATE)/
	@echo "[info] copied web/ and meta/ to new backup web$(DATE)/"

# When files move around in web/, some dead metadata entries stay in meta/.
# They need to be garbage collected from time to time.
gc:
	@# WARNING: If web/ doesn't exist, meta/ will be deleted entirely.
	@for file in `cd meta && find . -name '*' -print`; do  \
	  if [ -d "meta/$$file" ] && ! [ -d "web/$$file" ] ||  \
	     [ -f "meta/$$file" ] && ! [ -f "web/$$file" ] &&  \
	     [ "$${file##*/}" != ".DS-Store" ]; then  \
	    echo "rm -rf meta/$$file"; rm -rf "meta/$$file"; \
	  fi;  \
	done

test:
	node lib/test.js

# List all first-launch dependencies here
init: web/

web/: plugs/
	@if [ ! -e web ] && [ ! -e meta ]; then  \
	  echo "[init] deploying web/ and meta/ from plugs/";  \
	  cp -r plugs/ web/ && mv web/meta .;  \
	  rm -rf web/.git && rm -rf web/.gitignore;  \
	fi;

links: plugs/
	@if [ ! -e web ] && [ ! -e meta ]; then  \
	  echo "[init] setting up symbolic links";  \
	  ln -s plugs web;  \
    ln -s plugs/meta meta;  \
  fi;

plugs/:
	@echo "[init] obtaining plugs"
	@git clone http://github.com/garden/plugs

node_modules/bcrypt/:
	npm install bcrypt

update-camp:
	npm update camp

update-ot:
	npm update operational-transformation

https.key:
	@echo "[https] generating KEY"
	@openssl genrsa -aes256 -out https.key 1024

https.csr: https.key
	@echo "[https] generating CSR"
	@openssl req -new -key https.key -out https.csr

https.crt: https.key https.csr
	@echo "[https] generating CRT"
	@openssl x509 -req -days 365 -in https.csr -signkey https.key -out https.crt

rmhttps:
	@echo "[https] deleting https credentials"
	@rm -rf https.key https.csr https.crt

https: https.crt
	@echo "[info] you can now use https.key, https.csr, https.crt"

buildroot/:
	@echo "[buildroot] Constructing the chroot jail."
	if ! which debootstrap>/dev/null; then sudo apt-get install debootstrap; fi
	mkdir buildroot
	sudo debootstrap wheezy buildroot http://http.debian.net/debian
	sudo chroot buildroot bash -c 'echo -e "#!/bin/sh\nexit 101" | cat >/usr/sbin/policy-rc.d && dpkg-divert --divert /usr/bin/ischroot.debianutils --rename /usr/bin/ischroot && ln -s /bin/true /usr/bin/ischroot'
	sudo mount -t proc proc buildroot/proc/
	#sudo mount -t sysfs sys buildroot/sys/
	#sudo mount -o bind /dev buildroot/dev/
	sudo chroot buildroot apt-get install g++ make patch binutils-gold curl python ruby sbcl openjdk-7-jdk mono-complete
	sudo chroot buildroot bash -c 'mkdir /home/node-js && cd /home/node-js && wget -N http://nodejs.org/dist/node-latest.tar.gz && tar xzf node-latest.tar.gz && cd node-v* && ./configure && make && make install && rm -rf /home/node-js'
	# Requirements for building Firefox.
	sudo chroot buildroot apt-get install zip unzip mercurial libasound2-dev libcurl4-openssl-dev libnotify-dev libxt-dev libiw-dev libidl-dev mesa-common-dev autoconf2.13 yasm libgtk2.0-dev libdbus-1-dev libdbus-glib-1-dev python-dev libgstreamer0.10-dev libgstreamer-plugins-base0.10-dev libpulse-dev
	# Forbid network access. FIXME: modules.dep.bin not available.
	#sudo chroot buildroot bash -c 'iptables -I OUTPUT -j DROP -m owner --gid-owner root'

rmbuildroot:
	@echo "[buildroot] Removing the chroot jail."
	sudo umount -l ./buildroot/proc/
	sudo rm -rf ./buildroot

help:
	@cat Makefile | less

wtf ?: help

coffee:
	@echo "\n           )      (\n           (  )   )\n         _..,-(--,.._\n      .-;'-.,____,.-';\n     (( |            |\n      \`-;            ;\n         \\          /\n      .-''\`-.____.-'''-.\n     (     '------'     )\n      \`--..________..--'\n";

me a:
	@cd .

sandwich:
	@if [ `id -u` = "0" ] ; then echo "OKAY." ; else echo "What? Make it yourself." ; fi

.PHONY: start stop restart save load backup gc test init links update-camp update-ot rmhttps https rmbuildroot help wtf ? coffee me a sandwich

