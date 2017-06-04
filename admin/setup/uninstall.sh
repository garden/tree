#!/bin/bash

# shutting down services

echo "[uninstall] stopping systemd services"
sudo systemctl stop tree.service
sudo systemctl stop redirect.service
sudo systemctl stop update.service

# deleting services

echo "[uninstall] deleting systemd services"
sudo rm /etc/systemd/system/tree.service
sudo rm /etc/systemd/system/redirect.service
sudo rm /etc/systemd/system/update.service
sudo systemctl daemon-reload
