#!/bin/bash

cd /home/dom/tree >> /home/dom/tree/admin/log/update.log 2>&1
make backup >> /home/dom/tree/admin/log/update.log 2>&1
git pull origin master >> /home/dom/tree/admin/log/update.log 2>&1
systemctl stop tree.service >> /home/dom/tree/admin/log/update.log 2>&1
